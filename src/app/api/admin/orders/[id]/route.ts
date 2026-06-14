import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { stripe } from '@/lib/stripe'
import { sendEmail, OWNER_EMAIL } from '@/lib/email'
import { shippedNotice, deliveredNotice } from '@/lib/emailTemplates'
import { buildTrackingUrl, carrierLabel, getCarrier } from '@/lib/carriers'
import { signOrderToken } from '@/lib/orderToken'
import type { OrderRecord, OrderStatus } from '@/types/admin'

const SITE_URL = process.env.SITE_URL || 'https://www.sikocoffee.com'

async function buildOrderUrl(orderId: string): Promise<string | undefined> {
  try {
    const token = await signOrderToken(orderId)
    return `${SITE_URL}/shop/order/${orderId}?t=${token}`
  } catch {
    return undefined
  }
}

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
  let carrier: string | undefined
  let trackingNumber: string | undefined
  try {
    const body = await request.json()
    nextStatus = body.status
    carrier = typeof body.carrier === 'string' ? body.carrier.trim() : undefined
    trackingNumber = typeof body.trackingNumber === 'string' ? body.trackingNumber.trim() : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!nextStatus || !(nextStatus in TRANSITIONS)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // 発送時は配送業者と追跡番号が必須。
  if (nextStatus === 'shipped') {
    if (!carrier || !getCarrier(carrier)) {
      return NextResponse.json({ error: '配送業者を選択してください' }, { status: 400 })
    }
    if (!trackingNumber) {
      return NextResponse.json({ error: '追跡番号を入力してください' }, { status: 400 })
    }
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

    // 発送時：配送業者・追跡番号・追跡URLを保存。
    let trackingUrl: string | undefined
    if (nextStatus === 'shipped' && carrier && trackingNumber) {
      trackingUrl = buildTrackingUrl(carrier, trackingNumber)
      values[':carrier'] = carrier
      values[':tnum'] = trackingNumber
      setExpr += ', carrier = :carrier, trackingNumber = :tnum'
      if (trackingUrl) {
        values[':turl'] = trackingUrl
        setExpr += ', trackingUrl = :turl'
      }
    }

    const updated = await getDocClient().send(new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id },
      UpdateExpression: `SET ${setExpr}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))

    // 顧客への通知メール（遷移が成立したときのみ＝重複送信しない）。
    if (order.customerEmail && (nextStatus === 'shipped' || nextStatus === 'delivered')) {
      const orderUrl = await buildOrderUrl(id)
      const mail =
        nextStatus === 'shipped'
          ? shippedNotice({
              orderId: id,
              customerName: order.customerName,
              carrierLabel: carrierLabel(carrier),
              trackingNumber: trackingNumber!,
              trackingUrl,
              orderUrl,
            })
          : deliveredNotice({ orderId: id, customerName: order.customerName, orderUrl })
      await sendEmail({ to: order.customerEmail, subject: mail.subject, text: mail.text, html: mail.html, replyTo: OWNER_EMAIL })
    }

    return NextResponse.json(updated.Attributes)
  } catch (err) {
    console.error('Order PATCH error:', err)
    Sentry.captureException(err, { tags: { route: 'admin/orders/[id]' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
