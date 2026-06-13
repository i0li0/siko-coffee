import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { stripe } from '@/lib/stripe'
import type { OrderRecord, OrderStatus } from '@/types/admin'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 各ステータスから遷移可能な次ステータス。cancelled / refunded は終端。
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: [],
  paid: ['processing', 'shipped', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

// ステータスごとのタイムスタンプ属性名
const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  processing: 'processingAt',
  shipped: 'shippedAt',
  delivered: 'deliveredAt',
  cancelled: 'cancelledAt',
  refunded: 'refundedAt',
}

// PATCH /api/admin/orders/[id]  body: { status }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { id } = await params

  let nextStatus: OrderStatus
  try {
    const body = await request.json()
    nextStatus = body.status
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!nextStatus || !(nextStatus in TRANSITIONS)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    const res = await getDocClient().send(new GetCommand({
      TableName: TABLE.ORDERS,
      Key: { id },
    }))
    const order = res.Item as OrderRecord | undefined

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const current = order.status
    if (current === nextStatus) {
      return NextResponse.json(order)
    }
    if (!TRANSITIONS[current]?.includes(nextStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${current} to ${nextStatus}` },
        { status: 409 },
      )
    }

    // 返金は Stripe Refund API を発火させる。
    // 実際の status 確定は charge.refunded webhook でも行われるが、
    // ここでも即時更新して管理画面に反映する。
    if (nextStatus === 'refunded') {
      if (!order.stripeSessionId) {
        return NextResponse.json(
          { error: 'No Stripe session associated with this order' },
          { status: 400 },
        )
      }
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId)
        const paymentIntent =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id
        if (!paymentIntent) {
          return NextResponse.json({ error: 'No payment intent found' }, { status: 400 })
        }
        await stripe.refunds.create({ payment_intent: paymentIntent })
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'admin/orders/[id]', step: 'refund' } })
        return NextResponse.json({ error: 'Refund failed' }, { status: 502 })
      }
    }

    const now = new Date().toISOString()
    const tsAttr = STATUS_TIMESTAMP[nextStatus]

    const names: Record<string, string> = { '#status': 'status' }
    const values: Record<string, unknown> = { ':status': nextStatus, ':updatedAt': now }
    let setExpr = '#status = :status, statusUpdatedAt = :updatedAt'
    if (tsAttr) {
      names['#ts'] = tsAttr
      values[':ts'] = now
      setExpr += ', #ts = :ts'
    }

    const updated = await getDocClient().send(new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id },
      UpdateExpression: `SET ${setExpr}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))

    return NextResponse.json(updated.Attributes)
  } catch (err) {
    console.error('Order PATCH error:', err)
    Sentry.captureException(err, { tags: { route: 'admin/orders/[id]' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
