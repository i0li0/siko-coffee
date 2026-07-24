import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { substitutionDecisionSchema } from '@/lib/validation'
import { approveSubstitution, getOrderForSubstitution, markSubstitutionDeclined } from '@/lib/substitution'
import { refundOrder } from '@/lib/refund'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// POST /api/account/orders/[id]/substitution — 差替提案への購入者の判断（§6.3）。
//   approve … 差替を確定（ラベル再生成・調達先の差し替え）。吸収バンド内なので支払額は据え置き。
//   decline … 全額返金（v1 は「抜く」を作らないので、差替を断れば返金の2択）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req.headers)
  const rl = await checkGeneralRateLimit(ip, { prefix: 'order-substitution', maxAttempts: 20, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const session = await auth()
  if (!session?.user?.id && !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = substitutionDecisionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  try {
    const order = (await getOrderForSubstitution(id)) as
      | (Awaited<ReturnType<typeof getOrderForSubstitution>> & {
          userId?: string
          customerEmail?: string
          stripeSessionId?: string
        })
      | null
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // 所有者チェック（未存在と他人の注文は同じ 404）
    const owns =
      (order.userId && order.userId === session.user?.id) ||
      (order.customerEmail &&
        session.user?.email &&
        order.customerEmail.toLowerCase() === session.user.email.toLowerCase())
    if (!owns) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // 未確定の提案（承認も辞退もされていないもの）が対象
    const entry = order.substitution?.find((s) => !s.approvedByBuyerAt && !s.declinedByBuyerAt)
    if (!entry) return NextResponse.json({ error: '承認待ちの差替提案がありません' }, { status: 409 })

    if (parsed.data.decision === 'approve') {
      const applied = await approveSubstitution(order, entry)
      if (!applied) return NextResponse.json({ error: '代替候補の豆が見つかりません' }, { status: 409 })
      return NextResponse.json({ decision: 'approve', labelSnapshot: applied.labelSnapshot })
    }

    // 辞退 → 全額返金（確保中の在庫は戻す。確定済みは戻さず単品消化へ・§6.3）
    await markSubstitutionDeclined(order, entry)
    const refunded = await refundOrder(order)
    if (!refunded.ok) return NextResponse.json({ error: refunded.error }, { status: refunded.status })

    return NextResponse.json({ decision: 'decline', refunded: true })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'account/orders/[id]/substitution', method: 'POST' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
