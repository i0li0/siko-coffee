import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { ORDERS: 'orders' },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/pos', () => ({ applyOrderException: vi.fn() }))
vi.mock('@/lib/orderToken', () => ({ buildOrderUrl: vi.fn(async () => 'https://example.test/order') }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => true), OWNER_EMAIL: 'owner@example.test' }))
vi.mock('@/lib/slackNotify', () => ({ notifySlack: vi.fn() }))

import {
  classifyDelayTier,
  delayDays,
  etaFromResponse,
  recalculateOrderEta,
  type OrderDelay,
} from '@/lib/etaDelay'
import { applyOrderException } from '@/lib/pos'
import { sendEmail } from '@/lib/email'

const ORDER_ID = 'order-1'
const BEAN_ID = 'bean-1'
const ROASTER_ID = 'roaster-1'

// 約束 ETA を基準日に固定して、応答日をずらすことで Δ を作る
const PROMISED = '2026-08-01T00:00:00.000Z'

interface OrderState {
  etaPromised?: string
  etaCurrent?: string
  delay?: OrderDelay
  customerEmail?: string | null
}

function installDb(order: OrderState | undefined) {
  mockSend.mockImplementation(async (cmd: unknown) => {
    if (cmd instanceof GetCommand) return { Item: order ? { id: ORDER_ID, ...order } : undefined }
    if (cmd instanceof UpdateCommand) return {}
    return {}
  })
}

function updatedDelay(): OrderDelay | undefined {
  const call = mockSend.mock.calls.find(([c]) => c instanceof UpdateCommand)
  return (call?.[0] as UpdateCommand | undefined)?.input.ExpressionAttributeValues?.[':delay'] as
    | OrderDelay
    | undefined
}

// 応答から SHIP_PREP_DAYS(3) + leadTime 日後が新 ETA。約束比 Δ 日の遅れを作る応答日を逆算する。
function respondedAtForDelta(deltaDays: number, leadTimeDays: number): string {
  const target = Date.parse(PROMISED) + deltaDays * 24 * 3600 * 1000
  return new Date(target - (3 + leadTimeDays) * 24 * 3600 * 1000).toISOString()
}

describe('遅延の段の判定（§6.3 ①）', () => {
  it('delayDays は切り上げ＝半日でも遅れたら1日として扱う', () => {
    expect(delayDays(PROMISED, PROMISED)).toBe(0)
    expect(delayDays(PROMISED, '2026-08-01T12:00:00.000Z')).toBe(1)
    expect(delayDays(PROMISED, '2026-08-04T00:00:00.000Z')).toBe(3)
  })

  it('前倒しは負にせず 0 に丸める', () => {
    expect(delayDays(PROMISED, '2026-07-28T00:00:00.000Z')).toBe(0)
  })

  it('境界: 3日まで silent / 7日まで choice / 超は required', () => {
    expect(classifyDelayTier(0)).toBe('silent')
    expect(classifyDelayTier(3)).toBe('silent')
    expect(classifyDelayTier(4)).toBe('choice')
    expect(classifyDelayTier(7)).toBe('choice')
    expect(classifyDelayTier(8)).toBe('required')
  })

  it('etaFromResponse は応答日 + 発送準備3日 + リードタイム', () => {
    expect(etaFromResponse('2026-08-01T00:00:00.000Z', 4)).toBe('2026-08-08T00:00:00.000Z')
  })
})

describe('recalculateOrderEta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('約束より早い/同じなら書き換えない＝良い変動で購入者を煩わせない', async () => {
    installDb({ etaPromised: PROMISED, etaCurrent: PROMISED, customerEmail: 'a@example.test' })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID,
      leadTimeDays: 4, respondedAt: respondedAtForDelta(-2, 4),
    })
    expect(res).toEqual({ changed: false, notified: false })
    expect(updatedDelay()).toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('Δ<=3 は silent＝ETA は更新するがメールは出さない', async () => {
    installDb({ etaPromised: PROMISED, etaCurrent: PROMISED, customerEmail: 'a@example.test' })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID,
      leadTimeDays: 4, respondedAt: respondedAtForDelta(2, 4),
    })
    expect(res.changed).toBe(true)
    expect(res.notified).toBe(false)
    expect(updatedDelay()).toMatchObject({ deltaDays: 2, tier: 'silent' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(applyOrderException).not.toHaveBeenCalled()
  })

  it('3<Δ<=7 は choice＝通知するが注文は継続（例外は立てない）', async () => {
    installDb({ etaPromised: PROMISED, etaCurrent: PROMISED, customerEmail: 'a@example.test' })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID,
      leadTimeDays: 4, respondedAt: respondedAtForDelta(5, 4),
    })
    expect(res.notified).toBe(true)
    expect(updatedDelay()).toMatchObject({ deltaDays: 5, tier: 'choice', notifiedTier: 'choice' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(applyOrderException).not.toHaveBeenCalled()
  })

  it('Δ>7 は required＝実質 T2 として差替/返金へ送る', async () => {
    installDb({ etaPromised: PROMISED, etaCurrent: PROMISED, customerEmail: 'a@example.test' })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID,
      leadTimeDays: 4, respondedAt: respondedAtForDelta(10, 4),
    })
    expect(res.notified).toBe(true)
    expect(updatedDelay()).toMatchObject({ deltaDays: 10, tier: 'required' })
    expect(applyOrderException).toHaveBeenCalledWith(ORDER_ID, {
      type: 'T2', beanId: BEAN_ID, roasterId: ROASTER_ID, reason: 'delay',
    })
  })

  it('同じ段では再通知しない（再プロンプトしない・§6.3）', async () => {
    const already: OrderDelay = {
      deltaDays: 5, tier: 'choice', beanId: BEAN_ID, roasterId: ROASTER_ID,
      etaBefore: PROMISED, etaAfter: '2026-08-06T00:00:00.000Z',
      notifiedTier: 'choice', updatedAt: PROMISED,
    }
    installDb({ etaPromised: PROMISED, etaCurrent: PROMISED, delay: already, customerEmail: 'a@example.test' })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID,
      leadTimeDays: 4, respondedAt: respondedAtForDelta(6, 4),
    })
    expect(res.changed).toBe(true)
    expect(res.notified).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('choice → required に上がったときだけ1回エスカレーションする', async () => {
    const already: OrderDelay = {
      deltaDays: 5, tier: 'choice', beanId: BEAN_ID, roasterId: ROASTER_ID,
      etaBefore: PROMISED, etaAfter: '2026-08-06T00:00:00.000Z',
      notifiedTier: 'choice', updatedAt: PROMISED,
    }
    installDb({ etaPromised: PROMISED, etaCurrent: PROMISED, delay: already, customerEmail: 'a@example.test' })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID,
      leadTimeDays: 4, respondedAt: respondedAtForDelta(12, 4),
    })
    expect(res.notified).toBe(true)
    expect(updatedDelay()).toMatchObject({ tier: 'required', notifiedTier: 'required' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('メールアドレスが無くても記録と例外処理は進む', async () => {
    installDb({ etaPromised: PROMISED, etaCurrent: PROMISED, customerEmail: null })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID,
      leadTimeDays: 4, respondedAt: respondedAtForDelta(10, 4),
    })
    expect(res.notified).toBe(true)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(applyOrderException).toHaveBeenCalled()
  })

  it('etaPromised を持たない注文（在庫のみ＝発注なし）は対象外', async () => {
    installDb({ customerEmail: 'a@example.test' })
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID, leadTimeDays: 4,
    })
    expect(res).toEqual({ changed: false, notified: false })
  })

  it('注文が存在しなければ何もしない', async () => {
    installDb(undefined)
    const res = await recalculateOrderEta({
      orderId: ORDER_ID, beanId: BEAN_ID, roasterId: ROASTER_ID, leadTimeDays: 4,
    })
    expect(res).toEqual({ changed: false, notified: false })
  })
})
