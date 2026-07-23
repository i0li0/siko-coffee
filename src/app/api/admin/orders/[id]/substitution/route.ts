import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { verifyAdminToken } from '@/lib/adminAuth'
import { substitutionProposeSchema } from '@/lib/validation'
import { getOrderForSubstitution, proposeSubstitution } from '@/lib/substitution'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// POST /api/admin/orders/[id]/substitution — Sikō の差替推薦を作る（§6.3）。
// ここでは提案するだけで確定しない。確定は購入者の承認（account 側）が必須。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = substitutionProposeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  try {
    const order = await getOrderForSubstitution(id)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const result = await proposeSubstitution(order, parsed.data.fromBeanId, parsed.data.toBeanId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json(result.entry, { status: 201 })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'admin/orders/[id]/substitution', method: 'POST' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
