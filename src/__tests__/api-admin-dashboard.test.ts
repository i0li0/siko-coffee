import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { SALES: 'sales', EXPENSES: 'expenses', INVENTORY: 'inventory' },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/adminAuth', () => ({ verifyAdminToken: vi.fn() }))

import { GET } from '@/app/api/admin/dashboard/route'
import { verifyAdminToken } from '@/lib/adminAuth'

function req(month: string) {
  return new NextRequest(`https://example.com/api/admin/dashboard?month=${month}`)
}

// Scan(売上) → Query(支出)×12 → Scan(在庫) の順で呼ばれる前提で応答を組み立てる
function mockDb({ sales = [], expenses = {}, inventory = [] }: {
  sales?: { date: string; amount: number }[]
  expenses?: Record<string, { yearMonth: string; allocatedAmount: number }[]>
  inventory?: { id: string }[]
}) {
  let scanCount = 0
  mockSend.mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
    if (cmd.constructor.name === 'ScanCommand') {
      scanCount += 1
      return scanCount === 1 ? { Items: sales } : { Items: inventory }
    }
    const ym = (cmd.input.ExpressionAttributeValues as Record<string, string>)[':ym']
    return { Items: expenses[ym] ?? [] }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAdminToken).mockResolvedValue(null) // 認証済み
})

describe('GET /api/admin/dashboard', () => {
  it('未認証なら verifyAdminToken の応答をそのまま返す', async () => {
    const denied = new Response('nope', { status: 401 }) as never
    vi.mocked(verifyAdminToken).mockResolvedValue(denied)
    expect(await GET(req('2026-07'))).toBe(denied)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('month の形式が不正なら 400', async () => {
    for (const bad of ['2026', '2026-7', 'abc', '']) {
      const res = await GET(req(bad))
      expect(res.status, bad).toBe(400)
    }
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('年で1回だけ Scan し、月ごとに振り分ける（Scan を12回打たない）', async () => {
    mockDb({
      sales: [
        { date: '2026-07-03', amount: 500 },
        { date: '2026-07-20', amount: 800 },
        { date: '2026-03-01', amount: 100 },
      ],
    })
    const res = await GET(req('2026-07'))
    const body = await res.json()

    const scans = mockSend.mock.calls.map((c) => c[0]).filter((cmd) => cmd.constructor.name === 'ScanCommand')
    expect(scans).toHaveLength(2) // 売上1回 ＋ 在庫1回
    expect(scans[0].input.ExpressionAttributeValues).toEqual({ ':year': '2026' })

    expect(body.monthSales).toHaveLength(2)
    expect(body.yearSales['2026-03']).toHaveLength(1)
    expect(body.yearSales['2026-01']).toEqual([])
  })

  it('Scan がページングされても取りこぼさない', async () => {
    let call = 0
    mockSend.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name !== 'ScanCommand') return { Items: [] }
      call += 1
      if (call === 1) return { Items: [{ date: '2026-07-01', amount: 1 }], LastEvaluatedKey: { date: 'x' } }
      if (call === 2) return { Items: [{ date: '2026-07-02', amount: 2 }] }
      return { Items: [] } // 在庫
    })
    const body = await (await GET(req('2026-07'))).json()
    expect(body.monthSales).toHaveLength(2)
  })

  it('支出は12ヶ月ぶんを Query し、全月のキーが揃う', async () => {
    mockDb({ expenses: { '2026-07': [{ yearMonth: '2026-07', allocatedAmount: 300 }] } })
    const body = await (await GET(req('2026-07'))).json()

    const queries = mockSend.mock.calls.map((c) => c[0]).filter((cmd) => cmd.constructor.name === 'QueryCommand')
    expect(queries).toHaveLength(12)
    expect(queries.map((q) => q.input.ExpressionAttributeValues[':ym'])).toContain('2026-12')
    expect(Object.keys(body.yearExpenses)).toHaveLength(12)
    expect(body.monthExpenses).toHaveLength(1)
    expect(body.yearExpenses['2026-01']).toEqual([])
  })

  it('データが空でも 200 と空配列を返す（空の preview 環境で落ちない）', async () => {
    mockDb({})
    const res = await GET(req('2026-07'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.monthSales).toEqual([])
    expect(body.monthExpenses).toEqual([])
    expect(body.inventory).toEqual([])
  })

  it('DynamoDB が落ちたら 500 を返し、console にも残す（Sentry 未設定でも消えない）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSend.mockRejectedValue(new Error('boom'))
    const res = await GET(req('2026-07'))
    expect(res.status).toBe(500)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
