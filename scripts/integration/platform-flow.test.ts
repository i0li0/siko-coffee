import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'
import { getDocClient, TABLE } from '@/lib/db'
import {
  commitReservations,
  findExpiredReservations,
  holdReservations,
  listReservations,
  planLotAllocations,
  releaseReservation,
} from '@/lib/reservations'
import { resolvePlatformItem } from '@/lib/platformCheckout'
import { addRoasterMetrics, currentMetricsMonth } from '@/lib/roasterMetrics'
import { lotKeyOf, type BeanRecord, type LotRecord, type RoasterRecord } from '@/types/platform'

// preview 実テーブルに対する結合テスト（docs/blend-platform-plan.md §13.7）。
// ユニットテストではモックできない DynamoDB 側の挙動を確認する:
//   ConditionExpression の文法 / TransactWriteItems の all-or-nothing / GSI Query / ADD の原子性。
// 実行: VERCEL_ENV=preview npx vitest run --config vitest.integration.config.ts

if (process.env.VERCEL_ENV !== 'preview') {
  throw new Error('VERCEL_ENV=preview で実行してください（本番テーブルを触らないため）')
}

const db = getDocClient()
const suffix = randomUUID().slice(0, 8)
const ROASTER_ID = `it-roaster-${suffix}`
const BEAN_ID = `it-bean-${suffix}`
const ORDER_ID = `it-order-${suffix}`
const OLD_LOT = '2026-07-01'
const NEW_LOT = '2026-07-15'
const METRICS_MONTH = currentMetricsMonth()

const roaster: RoasterRecord = {
  roasterId: ROASTER_ID,
  displayName: `結合テスト焙煎者 ${suffix}`,
  status: 'active',
  licenseType: 'notification',
  licenseNo: 'IT-0000',
  termsVersion: 'v1',
  termsAgreedAt: new Date().toISOString(),
  optIns: { allowBlend: true, allowNameStory: true, allowSelloutAfterExit: false },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const bean: BeanRecord = {
  beanId: BEAN_ID,
  roasterId: ROASTER_ID,
  name: `結合テスト豆 ${suffix}`,
  greenOrigin: 'エチオピア',
  roastLevel: 'city',
  pricePer100g: 1200,
  weeklyCapKg: 5,
  leadTimeDays: 3,
  orderStatus: 'on',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function lot(roastDate: string, onHandG: number): LotRecord {
  return {
    beanId: BEAN_ID,
    roastDate,
    roasterId: ROASTER_ID,
    onHandG,
    reservedG: 0,
    availableG: onHandG,
    parRankG: 2000,
    freshBy: `${roastDate}T00:00:00.000Z`,
    status: 'fresh',
    purchasedG: onHandG,
    soldG: 0,
    wastedG: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    gsiPk: 'LOT',
    gsiSk: `${roastDate}T00:00:00.000Z`,
  }
}

async function getLot(roastDate: string): Promise<LotRecord> {
  const res = await db.send(new GetCommand({ TableName: TABLE.LOTS, Key: { beanId: BEAN_ID, roastDate } }))
  return res.Item as LotRecord
}

beforeAll(async () => {
  await db.send(new PutCommand({ TableName: TABLE.ROASTERS, Item: roaster }))
  await db.send(new PutCommand({ TableName: TABLE.BEANS, Item: { ...bean, gsiPk: 'BEAN#PUBLIC', gsiSk: bean.createdAt } }))
  await db.send(new PutCommand({ TableName: TABLE.LOTS, Item: lot(OLD_LOT, 300) }))
  await db.send(new PutCommand({ TableName: TABLE.LOTS, Item: lot(NEW_LOT, 500) }))
})

afterAll(async () => {
  const reservations = await listReservations(ORDER_ID)
  for (const r of reservations) {
    await db.send(new DeleteCommand({ TableName: TABLE.RESERVATIONS, Key: { orderId: r.orderId, lotKey: r.lotKey } }))
  }
  for (const roastDate of [OLD_LOT, NEW_LOT]) {
    await db.send(new DeleteCommand({ TableName: TABLE.LOTS, Key: { beanId: BEAN_ID, roastDate } }))
  }
  await db.send(new DeleteCommand({ TableName: TABLE.BEANS, Key: { beanId: BEAN_ID } }))
  await db.send(new DeleteCommand({ TableName: TABLE.ROASTERS, Key: { roasterId: ROASTER_ID } }))
  await db.send(
    new DeleteCommand({ TableName: TABLE.ROASTER_METRICS, Key: { roasterId: ROASTER_ID, month: METRICS_MONTH } }),
  )
})

describe('§13.3 注文→確保→確定（preview 実テーブル）', () => {
  it('①ブレンドの解決: 実DBの beans/roasters から価格と可否が決まる', async () => {
    const resolved = await resolvePlatformItem({ components: [{ beanId: BEAN_ID, ratioPct: 100 }], grams: 200 }, null)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.item.amountYen).toBe(2400) // 200g × ¥1200/100g
    expect(resolved.item.procurement[0]).toMatchObject({ mode: 'stock', qtyG: 200 })
    expect(resolved.item.labelSnapshot[0]?.greenOrigin).toBe('エチオピア')
  })

  it('②割当は古いロットから（FIFO）＝ロット跨ぎで足し合わせる', async () => {
    const plan = await planLotAllocations(BEAN_ID, ROASTER_ID, 400)
    expect(plan.shortfallG).toBe(0)
    expect(plan.allocations).toEqual([
      { beanId: BEAN_ID, roastDate: OLD_LOT, roasterId: ROASTER_ID, qtyG: 300 },
      { beanId: BEAN_ID, roastDate: NEW_LOT, roasterId: ROASTER_ID, qtyG: 100 },
    ])
  })

  it('③確保（held）: TransactWriteItems で availableG が減り予約が立つ', async () => {
    const plan = await planLotAllocations(BEAN_ID, ROASTER_ID, 400)
    await holdReservations(ORDER_ID, plan.allocations)

    expect(await getLot(OLD_LOT)).toMatchObject({ onHandG: 300, reservedG: 300, availableG: 0 })
    expect(await getLot(NEW_LOT)).toMatchObject({ onHandG: 500, reservedG: 100, availableG: 400 })

    const reservations = await listReservations(ORDER_ID)
    expect(reservations).toHaveLength(2)
    expect(reservations.every((r) => r.state === 'held')).toBe(true)
    expect(reservations[0]?.expireAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('④空きを超える確保は全体失敗＝部分確保を作らない', async () => {
    const before = await getLot(NEW_LOT)
    await expect(
      holdReservations(`${ORDER_ID}-over`, [
        { beanId: BEAN_ID, roastDate: NEW_LOT, roasterId: ROASTER_ID, qtyG: 100 },
        { beanId: BEAN_ID, roastDate: OLD_LOT, roasterId: ROASTER_ID, qtyG: 999 }, // 空き0で不成立
      ]),
    ).rejects.toMatchObject({ name: 'TransactionCanceledException' })

    expect(await getLot(NEW_LOT)).toMatchObject({ availableG: before.availableG }) // 1件目も入っていない
    expect(await listReservations(`${ORDER_ID}-over`)).toHaveLength(0)
  })

  it('⑤在庫が空いていない豆は発注（mode="po"）にまわる', async () => {
    // OLD_LOT は空き0、NEW_LOT は残り400 → 600g 要求で 200g 不足
    const resolved = await resolvePlatformItem({ components: [{ beanId: BEAN_ID, ratioPct: 100 }], grams: 600 }, null)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.item.procurement[0]).toMatchObject({ mode: 'po', poStatus: 'auto_approved' })
  })

  it('⑥確定（committed）: onHandG が減り soldG が増える／再実行しても二重に減らない', async () => {
    const sold = await commitReservations(ORDER_ID)
    expect(sold).toEqual({ [ROASTER_ID]: 400 })

    expect(await getLot(OLD_LOT)).toMatchObject({ onHandG: 0, reservedG: 0, availableG: 0, soldG: 300 })
    expect(await getLot(NEW_LOT)).toMatchObject({ onHandG: 400, reservedG: 0, availableG: 400, soldG: 100 })

    // webhook 再送を模す
    expect(await commitReservations(ORDER_ID)).toEqual({})
    expect(await getLot(NEW_LOT)).toMatchObject({ onHandG: 400, soldG: 100 })
  })

  it('⑦戻し（released）: 確定済みは戻らない／held は availableG が復活する', async () => {
    const committed = (await listReservations(ORDER_ID))[0]!
    expect(await releaseReservation(committed)).toBe(false) // state="held" 条件で弾かれる

    const holdOrderId = `${ORDER_ID}-release`
    await holdReservations(holdOrderId, [{ beanId: BEAN_ID, roastDate: NEW_LOT, roasterId: ROASTER_ID, qtyG: 150 }])
    expect(await getLot(NEW_LOT)).toMatchObject({ availableG: 250, reservedG: 150 })

    const held = (await listReservations(holdOrderId))[0]!
    expect(await releaseReservation(held)).toBe(true)
    expect(await getLot(NEW_LOT)).toMatchObject({ availableG: 400, reservedG: 0 })
    expect(await releaseReservation(held)).toBe(false) // 二重戻し防止

    await db.send(new DeleteCommand({ TableName: TABLE.RESERVATIONS, Key: { orderId: holdOrderId, lotKey: held.lotKey } }))
  })

  it('⑧失効した確保は GSI by-expire で拾える（cron の入力・Scan なし）', async () => {
    const expiredOrderId = `${ORDER_ID}-expired`
    const pastSec = Math.floor(Date.now() / 1000) - 3600
    await holdReservations(expiredOrderId, [{ beanId: BEAN_ID, roastDate: NEW_LOT, roasterId: ROASTER_ID, qtyG: 50 }], -3600)

    const expired = await findExpiredReservations(pastSec + 60)
    expect(expired.some((r) => r.orderId === expiredOrderId)).toBe(true)

    const target = expired.find((r) => r.orderId === expiredOrderId)!
    expect(await releaseReservation(target)).toBe(true)
    expect(await getLot(NEW_LOT)).toMatchObject({ availableG: 400, reservedG: 0 })

    await db.send(
      new DeleteCommand({ TableName: TABLE.RESERVATIONS, Key: { orderId: expiredOrderId, lotKey: lotKeyOf(BEAN_ID, NEW_LOT) } }),
    )
  })
})

describe('§11.2④/⑦ ロット更新と計測（preview 実テーブル）', () => {
  it('⑨CAS: 読んだ値から動いていたら条件不成立で弾かれる', async () => {
    const stale = await getLot(NEW_LOT)
    // 別プロセスの割り込みを模して先に動かす
    await db.send(
      new UpdateCommand({
        TableName: TABLE.LOTS,
        Key: { beanId: BEAN_ID, roastDate: NEW_LOT },
        UpdateExpression: 'SET onHandG = onHandG + :d, availableG = availableG + :d',
        ExpressionAttributeValues: { ':d': 10 },
      }),
    )

    await expect(
      db.send(
        new UpdateCommand({
          TableName: TABLE.LOTS,
          Key: { beanId: BEAN_ID, roastDate: NEW_LOT },
          UpdateExpression: 'SET onHandG = :v',
          ConditionExpression: '#c = :stale',
          ExpressionAttributeNames: { '#c': 'onHandG' },
          ExpressionAttributeValues: { ':v': 1, ':stale': stale.onHandG },
        }),
      ),
    ).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' })
  })

  it('⑩ロット登録の二重防止: 複合キーでも attribute_not_exists が効く', async () => {
    // 既存の豆×焙煎日 → 条件不成立（ルートは 409 を返す）
    await expect(
      db.send(
        new PutCommand({
          TableName: TABLE.LOTS,
          Item: lot(NEW_LOT, 999),
          ConditionExpression: 'attribute_not_exists(beanId)',
        }),
      ),
    ).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' })

    // 同じ豆でも焙煎日が違えば別ロットとして通る
    const another = '2026-07-25'
    await db.send(
      new PutCommand({
        TableName: TABLE.LOTS,
        Item: lot(another, 100),
        ConditionExpression: 'attribute_not_exists(beanId)',
      }),
    )
    await db.send(new DeleteCommand({ TableName: TABLE.LOTS, Key: { beanId: BEAN_ID, roastDate: another } }))
  })

  it('⑪鮮度切れ抽出は GSI by-freshBy の Query で拾える（Scan なし）', async () => {
    const res = await db.send(
      new QueryCommand({
        TableName: TABLE.LOTS,
        IndexName: 'by-freshBy',
        KeyConditionExpression: 'gsiPk = :pk AND gsiSk <= :until',
        ExpressionAttributeValues: { ':pk': 'LOT', ':until': '2026-07-20T00:00:00.000Z' },
      }),
    )
    const ours = (res.Items ?? []).filter((i) => (i as LotRecord).beanId === BEAN_ID)
    expect(ours.map((i) => (i as LotRecord).roastDate).sort()).toEqual([OLD_LOT, NEW_LOT])
  })

  it('⑫計測は ADD で積み上がる（アイテム未存在でも 0 起点で作られる）', async () => {
    await addRoasterMetrics(ROASTER_ID, { purchasedG: 1000, wastedG: 100 })
    await addRoasterMetrics(ROASTER_ID, { wastedG: 50, gmvYen: 2400, orderCount: 1 })

    const res = await db.send(
      new GetCommand({ TableName: TABLE.ROASTER_METRICS, Key: { roasterId: ROASTER_ID, month: METRICS_MONTH } }),
    )
    expect(res.Item).toMatchObject({ purchasedG: 1000, wastedG: 150, gmvYen: 2400, orderCount: 1 })
  })
})
