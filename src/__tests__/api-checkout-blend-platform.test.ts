import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: {
    ORDERS: 'orders',
    BEANS: 'beans',
    ROASTERS: 'roasters',
    LOTS: 'lots',
    RESERVATIONS: 'reservations',
    BLENDS: 'blends',
    ROASTER_METRICS: 'roaster_metrics',
    POS: 'pos',
  },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: vi.fn() } } },
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({
  checkGeneralRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { POST } from '@/app/api/checkout/blend/route'
import { stripe } from '@/lib/stripe'
import { auth } from '@/lib/auth'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import type { BeanRecord, LotRecord, PoRecord, RoasterRecord } from '@/types/platform'

const BEAN_ID = 'bean-1'
const ROASTER_ID = 'roaster-1'

const bean: BeanRecord = {
  beanId: BEAN_ID,
  roasterId: ROASTER_ID,
  name: 'エチオピア イルガチェフェ',
  greenOrigin: 'エチオピア',
  roastLevel: 'city',
  pricePer100g: 1400,
  weeklyCapKg: 5,
  leadTimeDays: 4,
  orderStatus: 'on',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const roaster = { roasterId: ROASTER_ID, status: 'active' } as RoasterRecord

const lot: LotRecord = {
  beanId: BEAN_ID,
  roastDate: '2026-07-20',
  roasterId: ROASTER_ID,
  onHandG: 1000,
  reservedG: 0,
  availableG: 1000,
  parRankG: 2000,
  freshBy: '2026-08-10',
  status: 'fresh',
  purchasedG: 1000,
  soldG: 0,
  wastedG: 0,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  gsiPk: 'LOT',
  gsiSk: '2026-08-10',
}

// DynamoDB 呼び出しをコマンド種別 × テーブルで振り分ける簡易ルータ
interface RouterState {
  bean?: BeanRecord | undefined
  roaster?: RoasterRecord | undefined
  lots?: LotRecord[]
  pos?: Partial<PoRecord>[]
  transactError?: Error
}

function installDbRouter(state: RouterState = {}) {
  const { bean: b = bean, roaster: r = roaster, lots = [lot], pos = [], transactError } = state
  mockSend.mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const kind = cmd.constructor.name
    const table = cmd.input.TableName as string | undefined
    if (kind === 'GetCommand' && table === 'beans') return { Item: b }
    if (kind === 'GetCommand' && table === 'roasters') return { Item: r }
    if (kind === 'QueryCommand' && table === 'lots') return { Items: lots }
    if (kind === 'QueryCommand' && table === 'reservations') return { Items: [] }
    if (kind === 'QueryCommand' && table === 'pos') return { Items: pos }
    if (kind === 'TransactWriteCommand') {
      if (transactError) throw transactError
      return {}
    }
    return {}
  })
}

function sentCommands(name: string) {
  return mockSend.mock.calls.map((c) => c[0]).filter((cmd) => cmd.constructor.name === name)
}

function orderPut() {
  return sentCommands('PutCommand').find((cmd) => cmd.input.TableName === 'orders')
}

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/checkout/blend', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', host: 'www.sikocoffee.com' },
  })
}

function transactionCanceled() {
  const err = new Error('canceled') as Error & { name: string }
  err.name = 'TransactionCanceledException'
  return err
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PAYMENTS_ENABLED', 'true')
  vi.mocked(getClientIp).mockReturnValue('1.2.3.4')
  vi.mocked(checkGeneralRateLimit).mockResolvedValue({ allowed: true })
  vi.mocked(auth).mockResolvedValue(null as never)
  vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://stripe.test/session' } as never)
  installDbRouter()
})

describe('POST /api/checkout/blend（決済停止スイッチ）', () => {
  it('PAYMENTS_ENABLED 未設定なら 503 で Stripe も在庫確保も走らない', async () => {
    vi.stubEnv('PAYMENTS_ENABLED', '')
    const res = await POST(request({ items: [{ name: 'モーニング', ratios: [50, 30, 20], grams: 200 }] }))
    expect(res.status).toBe(503)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(sentCommands('TransactWriteCommand')).toHaveLength(0)
  })
})

describe('POST /api/checkout/blend（既存の3種ブレンド）', () => {
  it('ratios だけの注文は従来どおり一律1000円/100gで、在庫確保は走らない', async () => {
    const res = await POST(request({ items: [{ name: 'モーニング', ratios: [50, 30, 20], grams: 200 }] }))
    expect(res.status).toBe(200)
    expect(sentCommands('TransactWriteCommand')).toHaveLength(0)
    const created = vi.mocked(stripe.checkout.sessions.create).mock.calls[0]![0]!
    expect(created.line_items?.[0].price_data?.unit_amount).toBe(2000)
    expect(orderPut()?.input.Item).not.toHaveProperty('procurement')
  })
})

describe('POST /api/checkout/blend（プラットフォーム構成）', () => {
  const platformItem = {
    name: 'マイブレンド',
    grams: 200,
    custom: true,
    components: [{ beanId: BEAN_ID, ratioPct: 100 }],
  }

  it('価格は焙煎者の申告価格（pricePer100g）から算出する', async () => {
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(200)
    const created = vi.mocked(stripe.checkout.sessions.create).mock.calls[0]![0]!
    expect(created.line_items?.[0].price_data?.unit_amount).toBe(2800) // 200g × ¥1400/100g
  })

  it('在庫があれば held で確保し、注文は mode="stock" になる', async () => {
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(200)

    const tx = sentCommands('TransactWriteCommand')[0]
    const txItems = tx.input.TransactItems as Record<string, { ConditionExpression?: string; Item?: Record<string, unknown> }>[]
    expect(txItems[0].Update?.ConditionExpression).toContain('availableG >= :q')
    expect(txItems[1].Put?.Item).toMatchObject({ lotKey: `${BEAN_ID}#2026-07-20`, qtyG: 200, state: 'held' })

    const item = orderPut()?.input.Item as { procurement: { mode: string }[]; labelSnapshot: { greenOrigin: string }[] }
    expect(item.procurement[0]).toMatchObject({ beanId: BEAN_ID, roasterId: ROASTER_ID, mode: 'stock', qtyG: 200 })
    expect(item.labelSnapshot[0]).toMatchObject({ greenOrigin: 'エチオピア', ratioPct: 100, grams: 200 })
  })

  it('在庫不足ぶんは発注（mode="po"）にまわり、週上限内なら自動承認', async () => {
    installDbRouter({ lots: [{ ...lot, onHandG: 50, availableG: 50 }] })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(200)
    const item = orderPut()?.input.Item as {
      procurement: { mode: string; poStatus: string }[]
      etaPromised: string
    }
    expect(item.procurement[0]).toMatchObject({ mode: 'po', poStatus: 'auto_approved', leadTimeDays: 4 })
    expect(item.etaPromised).toBeTruthy() // 発送準備3日 + リードタイム4日
  })

  it('週上限を超える発注は焙煎者の応答待ち（pending＋48h期限）', async () => {
    installDbRouter({ bean: { ...bean, weeklyCapKg: 0.05 }, lots: [] })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(200)
    const item = orderPut()?.input.Item as { procurement: { poStatus: string; timeoutAt: string }[] }
    expect(item.procurement[0].poStatus).toBe('pending')
    expect(item.procurement[0].timeoutAt).toBeTruthy()
  })

  it('週上限の判定は直近7日の既存 PO を積み上げる（実績ベース・§14.4）', async () => {
    // weeklyCapKg=0.3(=300g)。既存 PO で 250g 消費済み → 今回 200g で超過 → pending。
    const recent = new Date().toISOString()
    installDbRouter({
      bean: { ...bean, weeklyCapKg: 0.3 },
      lots: [],
      pos: [{ beanId: BEAN_ID, qtyG: 250, poStatus: 'accepted', createdAt: recent }],
    })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(200)
    const item = orderPut()?.input.Item as { procurement: { poStatus: string }[] }
    expect(item.procurement[0].poStatus).toBe('pending') // 250 + 200 > 300
  })

  it('辞退/失効・8日前の PO は枠を消費しない（declined/timeout・window 外は無視）', async () => {
    const recent = new Date().toISOString()
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()
    installDbRouter({
      bean: { ...bean, weeklyCapKg: 0.3 },
      lots: [],
      pos: [
        { beanId: BEAN_ID, qtyG: 250, poStatus: 'declined', createdAt: recent }, // 辞退＝枠を消費しない
        { beanId: BEAN_ID, qtyG: 250, poStatus: 'accepted', createdAt: old }, // 8日前＝window 外
        { beanId: 'other-bean', qtyG: 250, poStatus: 'accepted', createdAt: recent }, // 別の豆
      ],
    })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(200)
    const item = orderPut()?.input.Item as { procurement: { poStatus: string }[] }
    expect(item.procurement[0].poStatus).toBe('auto_approved') // 有効な既存ぶん 0 + 200 <= 300
  })

  it('受付停止中（orderStatus="off"）の豆は 409 で買えない', async () => {
    installDbRouter({ bean: { ...bean, orderStatus: 'off' } })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(409)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('休止/退会中の焙煎者の豆は 409 で買えない', async () => {
    installDbRouter({ roaster: { ...roaster, status: 'paused' } })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(409)
  })

  it('売り切り（selling_out）は在庫ぶんのみ＝不足すれば 409', async () => {
    installDbRouter({ roaster: { ...roaster, status: 'selling_out' }, lots: [{ ...lot, onHandG: 50, availableG: 50 }] })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(409)
  })

  it('確保トランザクションが競合で失敗したら 409（部分確保は作らない）', async () => {
    installDbRouter({ transactError: transactionCanceled() })
    const res = await POST(request({ items: [platformItem] }))
    expect(res.status).toBe(409)
    expect(orderPut()).toBeUndefined()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('構成比の合計が100%でなければ 400', async () => {
    const res = await POST(
      request({ items: [{ ...platformItem, components: [{ beanId: BEAN_ID, ratioPct: 40 }] }] }),
    )
    expect(res.status).toBe(400)
  })
})
