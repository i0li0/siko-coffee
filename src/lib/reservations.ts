import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import { lotKeyOf, type LotRecord, type ReservationRecord } from '@/types/platform'

// 在庫確保（docs/blend-platform-plan.md §9・§11.2⑤・§13.3）。
//
// 前提: lots は availableG（= onHandG − reservedG）を実体で持つ（§11.2④）。
// ConditionExpression に算術式を書けないため、確保条件は `availableG >= :qty` の単純比較にする。

export const RESERVATION_TTL_SEC = 30 * 60 // 決済セッションの寿命に合わせた保持時間

export interface Allocation {
  beanId: string
  roastDate: string
  roasterId: string
  qtyG: number
}

export interface AllocationPlan {
  allocations: Allocation[]
  shortfallG: number // 在庫で賄えなかったぶん（>0 なら発注＝mode="po"・§13.3）
}

// 1つの豆について、古いロットから順（FIFO＝鮮度の回転）に必要量を割り当てる。
// 確保はまだしない（確保は holdReservations の TransactWriteItems で一括・all-or-nothing）。
export async function planLotAllocations(
  beanId: string,
  roasterId: string,
  requiredG: number,
): Promise<AllocationPlan> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE.LOTS,
      KeyConditionExpression: 'beanId = :bid',
      ExpressionAttributeValues: { ':bid': beanId },
      ScanIndexForward: true, // roastDate 昇順＝古いロットから使う
    }),
  )

  const allocations: Allocation[] = []
  let remaining = requiredG

  for (const lot of (res.Items ?? []) as LotRecord[]) {
    if (remaining <= 0) break
    if (lot.status === 'expired') continue
    const available = lot.availableG ?? 0
    if (available <= 0) continue
    const qtyG = Math.min(available, remaining)
    allocations.push({ beanId, roastDate: lot.roastDate, roasterId, qtyG })
    remaining -= qtyG
  }

  return { allocations, shortfallG: remaining }
}

// 確保（held）。1つでも条件不成立なら全体失敗＝部分確保を作らない（§13.4）。
// 失敗時は TransactionCanceledException が投げられる。
export async function holdReservations(
  orderId: string,
  allocations: Allocation[],
  ttlSec: number = RESERVATION_TTL_SEC,
): Promise<void> {
  if (allocations.length === 0) return

  const now = new Date().toISOString()
  const expireAt = Math.floor(Date.now() / 1000) + ttlSec

  await getDocClient().send(
    new TransactWriteCommand({
      TransactItems: allocations.flatMap((a) => {
        const reservation: ReservationRecord = {
          orderId,
          lotKey: lotKeyOf(a.beanId, a.roastDate),
          beanId: a.beanId,
          roastDate: a.roastDate,
          roasterId: a.roasterId,
          qtyG: a.qtyG,
          state: 'held',
          expireAt,
          createdAt: now,
          updatedAt: now,
          gsiPk: 'RSV',
        }
        return [
          {
            Update: {
              TableName: TABLE.LOTS,
              Key: { beanId: a.beanId, roastDate: a.roastDate },
              UpdateExpression:
                'SET reservedG = reservedG + :q, availableG = availableG - :q, updatedAt = :now',
              ConditionExpression: 'attribute_exists(beanId) AND availableG >= :q',
              ExpressionAttributeValues: { ':q': a.qtyG, ':now': now },
            },
          },
          {
            Put: {
              TableName: TABLE.RESERVATIONS,
              Item: reservation,
              ConditionExpression: 'attribute_not_exists(orderId)', // 同一注文の二重確保を防ぐ
            },
          },
        ]
      }),
    }),
  )
}

// 注文に紐づく確保レコードを取得（PK Query・Scan なし）。
export async function listReservations(orderId: string): Promise<ReservationRecord[]> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE.RESERVATIONS,
      KeyConditionExpression: 'orderId = :oid',
      ExpressionAttributeValues: { ':oid': orderId },
    }),
  )
  return (res.Items ?? []) as ReservationRecord[]
}

// 確保 → 確定（held → committed）。決済完了で在庫を実際に減らす（§13.3 ②）。
// reservation.state="held" を条件にするため、webhook 再送でも二重に減らない（§13.4）。
// 戻り値: 焙煎者ごとの確定グラム数（roaster_metrics の soldG に積む）。
export async function commitReservations(orderId: string): Promise<Record<string, number>> {
  const reservations = await listReservations(orderId)
  const soldByRoaster: Record<string, number> = {}
  const now = new Date().toISOString()

  for (const r of reservations) {
    if (r.state !== 'held') continue
    try {
      await getDocClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE.LOTS,
                Key: { beanId: r.beanId, roastDate: r.roastDate },
                // availableG は確保時に減らし済みなので触らない
                UpdateExpression:
                  'SET onHandG = onHandG - :q, reservedG = reservedG - :q, soldG = soldG + :q, updatedAt = :now',
                ConditionExpression: 'attribute_exists(beanId) AND reservedG >= :q',
                ExpressionAttributeValues: { ':q': r.qtyG, ':now': now },
              },
            },
            {
              Update: {
                TableName: TABLE.RESERVATIONS,
                Key: { orderId: r.orderId, lotKey: r.lotKey },
                UpdateExpression: 'SET #state = :committed, updatedAt = :now',
                ConditionExpression: '#state = :held',
                ExpressionAttributeNames: { '#state': 'state' },
                ExpressionAttributeValues: { ':committed': 'committed', ':held': 'held', ':now': now },
              },
            },
          ],
        }),
      )
      soldByRoaster[r.roasterId] = (soldByRoaster[r.roasterId] ?? 0) + r.qtyG
    } catch (err) {
      // 条件不成立＝他プロセスが先に確定/戻し済み。ここは握って他ロットの確定を続ける。
      if ((err as { name?: string }).name !== 'TransactionCanceledException') throw err
    }
  }

  return soldByRoaster
}

// 確保 → 戻し（held → released）。失効・決済中断・注文取消で在庫を返す。
// 二重戻し防止は state="held" 条件（§13.4）。戻せたら true。
export async function releaseReservation(r: ReservationRecord): Promise<boolean> {
  const now = new Date().toISOString()
  try {
    await getDocClient().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE.LOTS,
              Key: { beanId: r.beanId, roastDate: r.roastDate },
              UpdateExpression:
                'SET reservedG = reservedG - :q, availableG = availableG + :q, updatedAt = :now',
              ConditionExpression: 'attribute_exists(beanId) AND reservedG >= :q',
              ExpressionAttributeValues: { ':q': r.qtyG, ':now': now },
            },
          },
          {
            Update: {
              TableName: TABLE.RESERVATIONS,
              Key: { orderId: r.orderId, lotKey: r.lotKey },
              UpdateExpression: 'SET #state = :released, updatedAt = :now',
              ConditionExpression: '#state = :held',
              ExpressionAttributeNames: { '#state': 'state' },
              ExpressionAttributeValues: { ':released': 'released', ':held': 'held', ':now': now },
            },
          },
        ],
      }),
    )
    return true
  } catch (err) {
    if ((err as { name?: string }).name === 'TransactionCanceledException') return false
    throw err
  }
}

// 注文単位の一括戻し（決済中断・pending 掃除から使う）。
export async function releaseReservationsForOrder(orderId: string): Promise<number> {
  const reservations = await listReservations(orderId)
  let released = 0
  for (const r of reservations) {
    if (r.state !== 'held') continue
    if (await releaseReservation(r)) released += 1
  }
  return released
}

// 失効した確保を GSI by-expire で拾う（Scan なし・cron が主／TTL は保険・§13.4）。
export async function findExpiredReservations(
  nowSec: number = Math.floor(Date.now() / 1000),
  limit = 100,
): Promise<ReservationRecord[]> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE.RESERVATIONS,
      IndexName: 'by-expire',
      KeyConditionExpression: 'gsiPk = :pk AND expireAt <= :now',
      ExpressionAttributeValues: { ':pk': 'RSV', ':now': nowSec },
      Limit: limit,
    }),
  )
  return ((res.Items ?? []) as ReservationRecord[]).filter((r) => r.state === 'held')
}
