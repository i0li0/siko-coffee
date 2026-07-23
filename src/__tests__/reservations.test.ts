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
