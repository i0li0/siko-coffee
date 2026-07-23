import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { ORDERS: 'orders', BEANS: 'beans', ROASTERS: 'roasters', RESERVATIONS: 'reservations', LOTS: 'lots' },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/adminAuth', () => ({ verifyAdminToken: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ checkGeneralRateLimit: vi.fn(), getClientIp: vi.fn() }))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: vi.fn() } },
    refunds: { create: vi.fn() },
  },
}))
vi.mock('@/lib/roasterMetrics', () => ({ addRoasterMetrics: vi.fn(), currentMetricsMonth: () => '2026-07' }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { POST as propose } from '@/app/api/admin/orders/[id]/substitution/route'
import { POST as decide } from '@/app/api/account/orders/[id]/substitution/route'
import { verifyAdminToken } from '@/lib/adminAuth'
import { auth } from '@/lib/auth'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { stripe } from '@/lib/stripe'
import { addRoasterMetrics } from '@/lib/roasterMetrics'
import type { BeanRecord, LabelSnapshotEntry, RoasterRecord, SubstitutionEntry } from '@/types/platform'

const ORDER_ID = 'order-1'
const USER_ID = 'user-1'
const FROM_BEAN = 'bean-from'
const TO_BEAN = 'bean-to'

const line: LabelSnapshotEntry = {
  beanId: FROM_BEAN,
  roasterId: 'roaster-a',
  name: '元の豆',
  greenOrigin: 'エチオピア',
  roastLevel: 'city',
  ratioPct: 50,
  grams: 100,
  pricePer100g: 1400,
}

const toBean: BeanRecord = {
  beanId: TO_BEAN,
  roasterId: 'roaster-b',
  name: '代替の豆',
  greenOrigin: 'エチオピア', // 同系統
  roastLevel: 'full_city',
  pricePer100g: 1450, // Δ=+¥50/100g → 吸収バンド内
  weeklyCapKg: 5,
  leadTimeDays: 3,
  orderStatus: 'on',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const activeRoaster = { roasterId: 'roaster-b', status: 'active' } as RoasterRecord

function baseOrder(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: 'paid',
    userId: USER_ID,
    customerEmail: 'buyer@example.com',
    stripeSessionId: 'cs_test_1',
    labelSnapshot: [line, { ...line, beanId: 'bean-c', roasterId: 'roaster-c', name: '別の豆' }],
    procurement: [{ roasterId: 'roaster-a', beanId: FROM_BEAN, qtyG: 100, mode: 'po', poStatus: 'declined' }],
    ...over,
  }
}

interface DbState {
  order?: Record<string, unknown> | undefined
  bean?: BeanRecord | undefined
  roaster?: RoasterRecord | undefined
}

function installDb(state: DbState = {}) {
  const { order = baseOrder(), bean = toBean, roaster = activeRoaster } = state
  mockSend.mockImplementation(async (cmd: { constructor: { name: string }; input: { TableName?: string } }) => {
    const kind = cmd.constructor.name
    if (kind === 'GetCommand' && cmd.input.TableName === 'orders') return { Item: order }
    if (kind === 'GetCommand' && cmd.input.TableName === 'beans') return { Item: bean }
    if (kind === 'GetCommand' && cmd.input.TableName === 'roasters') return { Item: roaster }
    if (kind === 'QueryCommand') return { Items: [] }
    return {}
  })
}

function sentCommands(name: string) {
  return mockSend.mock.calls.map((c) => c[0]).filter((cmd) => cmd.constructor.name === name)
}

function jsonRequest(body: unknown, path: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const params = { params: Promise.resolve({ id: ORDER_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClientIp).mockReturnValue('1.2.3.4')
  vi.mocked(checkGeneralRateLimit).mockResolvedValue({ allowed: true })
  vi.mocked(verifyAdminToken).mockResolvedValue(null)
  vi.mocked(auth).mockResolvedValue({ user: { id: USER_ID, email: 'buyer@example.com' } } as never)
  vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({ payment_intent: 'pi_1' } as never)
  vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_1' } as never)
  installDb()
})

describe('POST /api/admin/orders/[id]/substitution（Sikō推薦）', () => {
  it('同系統・バンド内なら提案が作られ、吸収フラグが立つ', async () => {
    const res = await propose(
      jsonRequest({ fromBeanId: FROM_BEAN, toBeanId: TO_BEAN }, `/api/admin/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(201)
    const entry = (await res.json()) as SubstitutionEntry
    expect(entry).toMatchObject({
      toBeanName: '代替の豆',
      deltaPer100g: 50,
      deltaYen: 50, // 100g ぶん
      absorbedBySiko: true,
    })
  })

  it('推薦バンド（±¥100/100g）を超える価格差は 400', async () => {
    installDb({ bean: { ...toBean, pricePer100g: 1600 } })
    const res = await propose(
      jsonRequest({ fromBeanId: FROM_BEAN, toBeanId: TO_BEAN }, `/api/admin/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(400)
  })

  it('生豆生産国も焙煎度も違う豆は 400（同系統に限る）', async () => {
    installDb({ bean: { ...toBean, greenOrigin: 'ブラジル', roastLevel: 'light' } })
    const res = await propose(
      jsonRequest({ fromBeanId: FROM_BEAN, toBeanId: TO_BEAN }, `/api/admin/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(400)
  })

  it('受付停止中の代替候補は 409', async () => {
    installDb({ bean: { ...toBean, orderStatus: 'off' } })
    const res = await propose(
      jsonRequest({ fromBeanId: FROM_BEAN, toBeanId: TO_BEAN }, `/api/admin/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(409)
  })

  it('admin 認証が通らなければ提案できない', async () => {
    vi.mocked(verifyAdminToken).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    const res = await propose(
      jsonRequest({ fromBeanId: FROM_BEAN, toBeanId: TO_BEAN }, `/api/admin/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(401)
  })
})

const pendingProposal: SubstitutionEntry = {
  fromBeanId: FROM_BEAN,
  toBeanId: TO_BEAN,
  toBeanName: '代替の豆',
  deltaYen: 50,
  deltaPer100g: 50,
  absorbedBySiko: true,
  proposedAt: '2026-07-23T00:00:00.000Z',
}

describe('POST /api/account/orders/[id]/substitution（購入者の2択）', () => {
  it('承認すると法定ラベルが差し替わり、調達先も代替焙煎者になる', async () => {
    installDb({ order: baseOrder({ substitution: [pendingProposal] }) })
    const res = await decide(
      jsonRequest({ decision: 'approve' }, `/api/account/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(200)

    const update = sentCommands('UpdateCommand').find((cmd) => cmd.input.ExpressionAttributeValues[':label'])
    const label = update?.input.ExpressionAttributeValues[':label'] as LabelSnapshotEntry[]
    expect(label[0]).toMatchObject({ beanId: TO_BEAN, roasterId: 'roaster-b', greenOrigin: 'エチオピア', grams: 100 })
    expect(label[1]?.beanId).toBe('bean-c') // 他の豆は触らない
    const proc = update?.input.ExpressionAttributeValues[':proc'] as { beanId: string; poStatus: string }[]
    expect(proc[0]).toMatchObject({ beanId: TO_BEAN, poStatus: 'pending' })
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it('辞退すると全額返金され、失注として計測される', async () => {
    installDb({ order: baseOrder({ substitution: [pendingProposal] }) })
    const res = await decide(
      jsonRequest({ decision: 'decline' }, `/api/account/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ decision: 'decline', refunded: true })
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' })
    // labelSnapshot にいる焙煎者ぶん（roaster-a / roaster-c）を失注計上
    expect(addRoasterMetrics).toHaveBeenCalledTimes(2)
    expect(addRoasterMetrics).toHaveBeenCalledWith('roaster-a', { lostCount: 1 })
  })

  it('他人の注文は 404（存在を漏らさない）', async () => {
    installDb({ order: baseOrder({ userId: 'someone-else', customerEmail: 'other@example.com', substitution: [pendingProposal] }) })
    const res = await decide(
      jsonRequest({ decision: 'approve' }, `/api/account/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(404)
  })

  it('未承認の提案が無ければ 409（二重承認の防止）', async () => {
    installDb({
      order: baseOrder({ substitution: [{ ...pendingProposal, approvedByBuyerAt: '2026-07-23T01:00:00.000Z' }] }),
    })
    const res = await decide(
      jsonRequest({ decision: 'approve' }, `/api/account/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(409)
  })

  it('未ログインは 401', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await decide(
      jsonRequest({ decision: 'approve' }, `/api/account/orders/${ORDER_ID}/substitution`),
      params,
    )
    expect(res.status).toBe(401)
  })
})
