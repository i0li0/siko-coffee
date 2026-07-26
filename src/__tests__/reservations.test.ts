import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { LOTS: 'lots', RESERVATIONS: 'reservations' },
  isDbConfigured: () => false,
}))

import {
  commitReservations,
  findExpiredReservations,
  holdReservations,
  planLotAllocations,
  reconcileLotReservations,
  releaseReservation,
} from '@/lib/reservations'
import type { LotRecord, ReservationRecord } from '@/types/platform'

const BEAN_ID = 'bean-1'
const ROASTER_ID = 'roaster-1'

function lot(roastDate: string, availableG: number, status: LotRecord['status'] = 'fresh'): LotRecord {
  return {
    beanId: BEAN_ID,
    roastDate,
    roasterId: ROASTER_ID,
    onHandG: availableG,
    reservedG: 0,
    availableG,
    parRankG: 1000,
    freshBy: `${roastDate}T00:00:00.000Z`,
    status,
    purchasedG: availableG,
    soldG: 0,
    wastedG: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    gsiPk: 'LOT',
    gsiSk: `${roastDate}T00:00:00.000Z`,
  }
}

function reservation(over: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    orderId: 'order-1',
    lotKey: `${BEAN_ID}#2026-07-10`,
    beanId: BEAN_ID,
    roastDate: '2026-07-10',
    roasterId: ROASTER_ID,
    qtyG: 200,
    state: 'held',
    expireAt: 1_700_000_000,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    gsiPk: 'RSV',
    ...over,
  }
}

function transactionCanceled() {
  const err = new Error('canceled') as Error & { name: string }
  err.name = 'TransactionCanceledException'
  return err
}

function sentCommands(name: string) {
  return mockSend.mock.calls.map((c) => c[0]).filter((cmd) => cmd.constructor.name === name)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('planLotAllocations', () => {
  it('古いロットから順に割り当て、足りないぶんは shortfall になる', async () => {
    mockSend.mockResolvedValue({ Items: [lot('2026-07-10', 120), lot('2026-07-18', 100)] })
    const plan = await planLotAllocations(BEAN_ID, ROASTER_ID, 300)
    expect(plan.allocations).toEqual([
      { beanId: BEAN_ID, roastDate: '2026-07-10', roasterId: ROASTER_ID, qtyG: 120 },
      { beanId: BEAN_ID, roastDate: '2026-07-18', roasterId: ROASTER_ID, qtyG: 100 },
    ])
    expect(plan.shortfallG).toBe(80)
    // Scan ではなく PK Query（昇順＝古い順）
    const query = sentCommands('QueryCommand')[0]
    expect(query.input.ScanIndexForward).toBe(true)
  })

  it('期限切れロットと空きゼロのロットは使わない', async () => {
    mockSend.mockResolvedValue({ Items: [lot('2026-07-01', 500, 'expired'), lot('2026-07-05', 0), lot('2026-07-09', 300)] })
    const plan = await planLotAllocations(BEAN_ID, ROASTER_ID, 200)
    expect(plan.allocations).toEqual([
      { beanId: BEAN_ID, roastDate: '2026-07-09', roasterId: ROASTER_ID, qtyG: 200 },
    ])
    expect(plan.shortfallG).toBe(0)
  })
})

describe('holdReservations', () => {
  it('ロットの確保と予約レコードを1トランザクションで書く（all-or-nothing）', async () => {
    mockSend.mockResolvedValue({})
    await holdReservations('order-1', [
      { beanId: BEAN_ID, roastDate: '2026-07-10', roasterId: ROASTER_ID, qtyG: 120 },
      { beanId: BEAN_ID, roastDate: '2026-07-18', roasterId: ROASTER_ID, qtyG: 80 },
    ])
    const tx = sentCommands('TransactWriteCommand')
    expect(tx).toHaveLength(1)
    expect(tx[0].input.TransactItems).toHaveLength(4) // ロット更新 × 2 ＋ 予約 Put × 2
  })

  it('割り当てが無ければ何も書かない', async () => {
    await holdReservations('order-1', [])
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('commitReservations', () => {
  it('held だけを確定し、焙煎者ごとの確定グラム数を返す', async () => {
    mockSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') {
        return {
          Items: [
            reservation({ qtyG: 200 }),
            reservation({ lotKey: `${BEAN_ID}#2026-07-18`, roastDate: '2026-07-18', qtyG: 100 }),
            reservation({ lotKey: `${BEAN_ID}#2026-07-20`, state: 'committed', qtyG: 999 }),
          ],
        }
      }
      return {}
    })

    const sold = await commitReservations('order-1')
    expect(sold).toEqual({ [ROASTER_ID]: 300 }) // committed 済みは数えない
    const tx = sentCommands('TransactWriteCommand')
    expect(tx).toHaveLength(2)
    const lotUpdate = (tx[0].input.TransactItems as Record<string, { UpdateExpression?: string }>[])[0].Update
    // availableG は確保時に減らし済み＝ここでは触らない
    expect(lotUpdate?.UpdateExpression).toContain('onHandG = onHandG - :q')
    expect(lotUpdate?.UpdateExpression).not.toContain('availableG')
  })

  it('競合で確定できないロットがあっても他のロットの確定は続ける', async () => {
    let tx = 0
    mockSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') {
        return {
          Items: [
            reservation({ qtyG: 200 }),
            reservation({ lotKey: `${BEAN_ID}#2026-07-18`, roastDate: '2026-07-18', qtyG: 100 }),
          ],
        }
      }
      tx += 1
      if (tx === 1) throw transactionCanceled()
      return {}
    })

    const sold = await commitReservations('order-1')
    expect(sold).toEqual({ [ROASTER_ID]: 100 })
  })
})

describe('releaseReservation', () => {
  it('戻すと reservedG が減り availableG が復活する', async () => {
    mockSend.mockResolvedValue({})
    expect(await releaseReservation(reservation())).toBe(true)
    const items = sentCommands('TransactWriteCommand')[0].input.TransactItems as Record<
      string,
      { UpdateExpression?: string; ConditionExpression?: string; ExpressionAttributeValues?: Record<string, unknown> }
    >[]
    expect(items[0].Update?.UpdateExpression).toContain('availableG = availableG + :q')
    expect(items[1].Update?.ConditionExpression).toBe('#state = :held') // 二重戻し防止
  })

  it('既に確定/戻し済み（条件不成立）なら false', async () => {
    mockSend.mockRejectedValue(transactionCanceled())
    expect(await releaseReservation(reservation())).toBe(false)
  })
})

describe('reconcileLotReservations', () => {
  // 「確保レコードは無いのに reservedG が残っている」＝TTL が先に消した孤児。
  // sweep は確保レコードを起点にするため直せない。本番で実際に発生した（2026-07-27）。
  function staleLot(over: Partial<LotRecord> = {}): LotRecord {
    return {
      ...lot('2026-07-10', 800),
      onHandG: 1000,
      reservedG: 200,
      availableG: 800,
      updatedAt: '2026-07-24T10:59:15.846Z', // 十分に古い
      ...over,
    }
  }

  // 確保 Query → ロット Query の順で応答を返す
  function mockQueries(reservations: ReservationRecord[], lots: LotRecord[]) {
    let call = 0
    mockSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') {
        call += 1
        return { Items: call === 1 ? reservations : lots }
      }
      return {}
    })
  }

  it('確保レコードが消えた孤児 reservedG を戻し、availableG も回復させる', async () => {
    mockQueries([], [staleLot()])
    const res = await reconcileLotReservations()
    expect(res).toEqual({ checked: 1, repaired: 1, freedG: 200 })

    const items = sentCommands('TransactWriteCommand')[0].input.TransactItems as Record<
      string,
      { UpdateExpression?: string; ConditionExpression?: string; ExpressionAttributeValues?: Record<string, unknown> }
    >[]
    expect(items[0].Update?.UpdateExpression).toContain('availableG = onHandG - :expected')
    // 読んだ値を条件にした CAS（read-modify-write ではない）
    expect(items[0].Update?.ConditionExpression).toBe('reservedG = :current AND onHandG = :onHand')
    expect(items[0].Update?.ExpressionAttributeValues?.[':expected']).toBe(0)
  })

  it('Scan を使わず、確保→ロットの順に GSI を Query する', async () => {
    mockQueries([], [staleLot()])
    await reconcileLotReservations()
    expect(sentCommands('ScanCommand')).toHaveLength(0)
    const queries = sentCommands('QueryCommand')
    expect(queries[0].input.IndexName).toBe('by-expire')
    expect(queries[1].input.IndexName).toBe('by-freshBy')
  })

  it('有効な確保があるぶんは残す（部分的なドリフトだけ直す）', async () => {
    mockQueries([reservation({ qtyG: 50, lotKey: `${BEAN_ID}#2026-07-10` })], [staleLot()])
    const res = await reconcileLotReservations()
    expect(res).toEqual({ checked: 1, repaired: 1, freedG: 150 })
    const items = sentCommands('TransactWriteCommand')[0].input.TransactItems as Record<
      string,
      { Update?: { ExpressionAttributeValues?: Record<string, unknown> } }
    >[]
    expect((items[0] as { Update?: { ExpressionAttributeValues?: Record<string, unknown> } }).Update?.ExpressionAttributeValues?.[':expected']).toBe(50)
  })

  it('直近に更新されたロットは触らない（確保直後の誤開放を防ぐ）', async () => {
    mockQueries([], [staleLot({ updatedAt: new Date().toISOString() })])
    const res = await reconcileLotReservations()
    expect(res).toEqual({ checked: 1, repaired: 0, freedG: 0 })
    expect(sentCommands('TransactWriteCommand')).toHaveLength(0)
  })

  it('確保が reservedG を上回る場合は何もしない（不足側は触らない）', async () => {
    mockQueries([reservation({ qtyG: 500, lotKey: `${BEAN_ID}#2026-07-10` })], [staleLot()])
    const res = await reconcileLotReservations()
    expect(res).toEqual({ checked: 1, repaired: 0, freedG: 0 })
    expect(sentCommands('TransactWriteCommand')).toHaveLength(0)
  })

  it('held 以外の確保は期待値に数えない', async () => {
    mockQueries(
      [reservation({ qtyG: 200, lotKey: `${BEAN_ID}#2026-07-10`, state: 'committed' })],
      [staleLot()],
    )
    const res = await reconcileLotReservations()
    expect(res.freedG).toBe(200)
  })

  it('reservedG が 0 のロットは検査対象にしない', async () => {
    mockQueries([], [staleLot({ reservedG: 0, availableG: 1000 })])
    const res = await reconcileLotReservations()
    expect(res).toEqual({ checked: 0, repaired: 0, freedG: 0 })
  })

  it('並行更新（条件不成立）なら諦めて次回に回す', async () => {
    let call = 0
    mockSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') {
        call += 1
        return { Items: call === 1 ? [] : [staleLot()] }
      }
      throw transactionCanceled()
    })
    const res = await reconcileLotReservations()
    expect(res).toEqual({ checked: 1, repaired: 0, freedG: 0 })
  })
})

describe('findExpiredReservations', () => {
  it('GSI by-expire を Query し、held のものだけ返す', async () => {
    mockSend.mockResolvedValue({
      Items: [reservation(), reservation({ lotKey: 'x', state: 'committed' })],
    })
    const expired = await findExpiredReservations(1_700_000_100)
    expect(expired).toHaveLength(1)
    const query = sentCommands('QueryCommand')[0]
    expect(query.input.IndexName).toBe('by-expire')
    expect(query.input.KeyConditionExpression).toBe('gsiPk = :pk AND expireAt <= :now')
  })
})
