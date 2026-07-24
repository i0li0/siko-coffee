import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { releaseReservationsForOrder } from '@/lib/reservations'
import { addRoasterMetrics } from '@/lib/roasterMetrics'
import type { LabelSnapshotEntry } from '@/types/platform'

// 全額返金（§6.3 の「差替 or 返金」の返金側）。
// 在庫の扱い: 確保中（held）は戻すが、**確定済み（committed）は戻さない**。
// 買取済みの在庫は §5 の売り切り同意で単品消化に回す前提のため（§6.3 巻き添えの後始末）。

export type RefundResult = { ok: true } | { ok: false; error: string; status: number }

export async function refundOrder(order: {
  id: string
  status?: string
  stripeSessionId?: string
  labelSnapshot?: LabelSnapshotEntry[]
}): Promise<RefundResult> {
  if (order.status === 'refunded') return { ok: true } // 冪等
  if (!order.stripeSessionId) {
    return { ok: false, error: 'この注文には決済が紐づいていません', status: 400 }
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId)
    const paymentIntent =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
    if (!paymentIntent) return { ok: false, error: 'No payment intent found', status: 400 }
    await stripe.refunds.create({ payment_intent: paymentIntent })
  } catch {
    return { ok: false, error: 'Refund failed', status: 502 }
  }

  await releaseReservationsForOrder(order.id)

  const now = new Date().toISOString()
  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: order.id },
      UpdateExpression: 'SET #s = :refunded, refundedAt = :now, updatedAt = :now',
      // status は webhook（charge.refunded）でも更新されるので、既に refunded なら何もしない
      ConditionExpression: 'attribute_exists(id) AND #s <> :refunded',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':refunded': 'refunded', ':now': now },
    }),
  ).catch(() => { /* 競合＝webhook が先に更新済み */ })

  // 失注として計測（失注率＝lost/(orders+lost)・§11.2⑦）
  const roasters = new Set((order.labelSnapshot ?? []).map((l) => l.roasterId))
  for (const roasterId of roasters) {
    await addRoasterMetrics(roasterId, { lostCount: 1 })
  }

  return { ok: true }
}
