import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireRoaster } from '@/lib/roasterAuth'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { poRespondSchema } from '@/lib/validation'
import { applyOrderException, classifyException, syncOrderProcurement, transitionPo } from '@/lib/pos'
import { recalculateOrderEta } from '@/lib/etaDelay'
import { poKeyOf } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// POST /api/roaster/pos/[orderId]/respond — 発注への応答（accept / decline・§6.2-5）
// pending からのみ遷移できる（承認済み・タイムアウト後の遅延応答は 409）。
// decline は §6.3 の例外（差替 or 返金の2択）へ送る＝注文に exception を立てる。
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const ip = getClientIp(req.headers)
  const rl = await checkGeneralRateLimit(ip, { prefix: 'roaster-pos-respond', maxAttempts: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const authed = await requireRoaster()
  if (!authed.ok) return authed.response

  const { orderId } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = poRespondSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { beanId, decision, comment } = parsed.data
  const nextStatus = decision === 'accept' ? 'accepted' : 'declined'

  try {
    // PK が roasterId なので、他人の発注には触れない（キーの時点で所有者が保証される）
    const updated = await transitionPo(
      authed.roaster.roasterId,
      poKeyOf(orderId, beanId),
      ['pending'],
      nextStatus,
      { comment },
    )
    if (!updated) {
      return NextResponse.json(
        { error: '応答できる発注がありません（未存在、または既に応答/期限切れ）' },
        { status: 409 },
      )
    }

    await syncOrderProcurement(orderId, beanId, nextStatus)

    if (decision === 'accept') {
      // 承認された時点からリードタイムが動き出す＝応答が遅れたぶんは着荷の遅れになる。
      // ETA を引き直し、遅延幅に応じて通知/選択肢の要否を決める（§6.3 T1）。
      // 通知の失敗で応答そのものを 500 にはしない（発注の状態遷移は既に成立している）。
      await recalculateOrderEta({
        orderId,
        beanId,
        roasterId: authed.roaster.roasterId,
        leadTimeDays: updated.leadTimeDays ?? 0,
        respondedAt: updated.respondedAt,
      }).catch((err) => {
        Sentry.captureException(err, { tags: { route: 'roaster/pos/[orderId]/respond', step: 'eta' } })
      })
    }

    if (decision === 'decline') {
      // 辞退＝構成豆が欠ける。回復見込みで T1/T2/T3 を分類して注文に記録（§6.3）。
      await applyOrderException(orderId, {
        type: classifyException(authed.roaster),
        beanId,
        roasterId: authed.roaster.roasterId,
        reason: 'declined',
      })
    }

    return NextResponse.json(updated)
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'roaster/pos/[orderId]/respond', method: 'POST' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
