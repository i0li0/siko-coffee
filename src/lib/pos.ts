import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import {
  poKeyOf,
  type ExceptionType,
  type OrderException,
  type PoRecord,
  type PoStatus,
  type ProcurementEntry,
  type RoasterRecord,
} from '@/types/platform'

// 発注（PO）の読み書き（docs/blend-platform-plan.md §6.2・§6.3・§11.2⑨）。

export interface PoSeed {
  roasterId: string
  beanId: string
  beanName: string
  qtyG: number
  poStatus: PoStatus
  timeoutAt?: string
  leadTimeDays?: number
}

function gsiKeys(poStatus: PoStatus, timeoutAt: string | undefined, createdAt: string) {
  return { gsiPk: `PO#${poStatus}`, gsiSk: timeoutAt ?? createdAt }
}

// 注文成立時に PO を1豆1行で作る（orders.procurement[] と同じ内容の逆引き）。
export async function createPoRecords(orderId: string, seeds: PoSeed[]): Promise<PoRecord[]> {
  const now = new Date().toISOString()
  const records: PoRecord[] = seeds.map((s) => ({
    roasterId: s.roasterId,
    poKey: poKeyOf(orderId, s.beanId),
    orderId,
    beanId: s.beanId,
    beanName: s.beanName,
    qtyG: s.qtyG,
    poStatus: s.poStatus,
    ...(s.timeoutAt ? { timeoutAt: s.timeoutAt } : {}),
    ...(s.leadTimeDays !== undefined ? { leadTimeDays: s.leadTimeDays } : {}),
    createdAt: now,
    updatedAt: now,
    ...gsiKeys(s.poStatus, s.timeoutAt, now),
  }))

  for (const record of records) {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE.POS,
        Item: record,
        ConditionExpression: 'attribute_not_exists(roasterId)', // 同一注文×豆の二重作成を防ぐ
      }),
    )
  }
  return records
}

// 自分宛の発注一覧（PK Query・Scan なし）。status 指定時はアプリ側で絞る（件数が小さいため）。
export async function listPosForRoaster(roasterId: string, status?: PoStatus): Promise<PoRecord[]> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE.POS,
      KeyConditionExpression: 'roasterId = :rid',
      ExpressionAttributeValues: { ':rid': roasterId },
      ScanIndexForward: false,
    }),
  )
  const items = (res.Items ?? []) as PoRecord[]
  return status ? items.filter((p) => p.poStatus === status) : items
}

// ステータス別の横断一覧（GSI by-status）。cron は pending × timeoutAt<=now で使う。
export async function listPosByStatus(status: PoStatus, until?: string, limit = 100): Promise<PoRecord[]> {
  const res = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE.POS,
      IndexName: 'by-status',
      KeyConditionExpression: until ? 'gsiPk = :pk AND gsiSk <= :until' : 'gsiPk = :pk',
      ExpressionAttributeValues: until ? { ':pk': `PO#${status}`, ':until': until } : { ':pk': `PO#${status}` },
      Limit: limit,
    }),
  )
  return (res.Items ?? []) as PoRecord[]
}

// 状態遷移。from に無い状態からは動かさない（承認済/timeout 後の遅延応答を弾く・§13.4）。
export async function transitionPo(
  roasterId: string,
  poKey: string,
  from: PoStatus[],
  to: PoStatus,
  extra: { comment?: string } = {},
): Promise<PoRecord | null> {
  const now = new Date().toISOString()
  const fromValues = Object.fromEntries(from.map((s, i) => [`:from${i}`, s]))

  try {
    const res = await getDocClient().send(
      new UpdateCommand({
        TableName: TABLE.POS,
        Key: { roasterId, poKey },
        UpdateExpression: [
          'SET poStatus = :to',
          'gsiPk = :gsiPk',
          'respondedAt = :now',
          'updatedAt = :now',
          ...(extra.comment ? ['#comment = :comment'] : []),
        ].join(', '),
        ConditionExpression: `attribute_exists(roasterId) AND poStatus IN (${from.map((_, i) => `:from${i}`).join(', ')})`,
        ...(extra.comment ? { ExpressionAttributeNames: { '#comment': 'comment' } } : {}),
        ExpressionAttributeValues: {
          ':to': to,
          ':gsiPk': `PO#${to}`,
          ':now': now,
          ...fromValues,
          ...(extra.comment ? { ':comment': extra.comment } : {}),
        },
        ReturnValues: 'ALL_NEW',
      }),
    )
    return res.Attributes as PoRecord
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return null
    throw err
  }
}

// orders.procurement[] 側の poStatus も揃える（表示は注文単位で行うため二重化している）。
export async function syncOrderProcurement(orderId: string, beanId: string, poStatus: PoStatus): Promise<void> {
  const db = getDocClient()
  const res = await db.send(
    new GetCommand({ TableName: TABLE.ORDERS, Key: { id: orderId }, ProjectionExpression: 'procurement' }),
  )
  const procurement = (res.Item?.procurement ?? []) as ProcurementEntry[]
  if (procurement.length === 0) return

  const updated = procurement.map((p) => (p.beanId === beanId ? { ...p, poStatus } : p))
  await db.send(
    new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: orderId },
      UpdateExpression: 'SET procurement = :p, updatedAt = :now',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeValues: { ':p': updated, ':now': new Date().toISOString() },
    }),
  )
}

// 48h 無応答の発注を timeout にし、注文へ例外を立てる（§6.3）。
// cron のほか、発注一覧の読み取り時にも呼ぶ（Hobby の cron が日次までのため＝下記 sweep の理由と同じ）。
export async function sweepPoTimeouts(now = new Date().toISOString()): Promise<{ timedOut: number; skipped: number }> {
  const expired = await listPosByStatus('pending', now)
  let timedOut = 0
  let skipped = 0

  for (const po of expired) {
    const updated = await transitionPo(po.roasterId, po.poKey, ['pending'], 'timeout')
    if (!updated) {
      skipped += 1 // 直前に焙煎者が応答した
      continue
    }
    timedOut += 1

    await syncOrderProcurement(po.orderId, po.beanId, 'timeout')
    const roasterRes = await getDocClient().send(
      new GetCommand({ TableName: TABLE.ROASTERS, Key: { roasterId: po.roasterId } }),
    )
    await applyOrderException(po.orderId, {
      type: classifyException(roasterRes.Item as RoasterRecord | undefined),
      beanId: po.beanId,
      roasterId: po.roasterId,
      reason: 'timeout',
    })
  }

  return { timedOut, skipped }
}

// 欠け方の分類（§6.3 の軸1＝回復見込み）。
//   T1 一時   … 復帰日がある休止（ETA を出せる＝待てる）
//   T2 不定   … 休止だが復帰未定 / それ以外の目処なし
//   T3 恒久   … 退会・売り切り中（「待つ」を出してはいけない）
export function classifyException(roaster: RoasterRecord | null | undefined): ExceptionType {
  if (!roaster) return 'T2'
  if (roaster.status === 'withdrawn' || roaster.status === 'selling_out') return 'T3'
  if (roaster.status === 'paused') return roaster.pausedUntil ? 'T1' : 'T2'
  return 'T2'
}

// 例外を注文に記録する。課金済みなら post_charge（返金を伴う経路）。
export async function applyOrderException(
  orderId: string,
  exception: Omit<OrderException, 'phase' | 'createdAt'>,
): Promise<OrderException | null> {
  const db = getDocClient()
  const res = await db.send(
    new GetCommand({ TableName: TABLE.ORDERS, Key: { id: orderId }, ProjectionExpression: '#s', ExpressionAttributeNames: { '#s': 'status' } }),
  )
  if (!res.Item) return null

  const phase = res.Item.status === 'pending' ? 'pre_charge' : 'post_charge'
  const record: OrderException = { ...exception, phase, createdAt: new Date().toISOString() }

  await db.send(
    new UpdateCommand({
      TableName: TABLE.ORDERS,
      Key: { id: orderId },
      UpdateExpression: 'SET #e = :e, updatedAt = :now',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: { '#e': 'exception' },
      ExpressionAttributeValues: { ':e': record, ':now': new Date().toISOString() },
    }),
  )
  return record
}
