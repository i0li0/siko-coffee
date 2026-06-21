import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: {
    PRODUCTS: 'products', ORDERS: 'orders', BLENDS: 'blends',
    INVENTORY: 'inventory', CONFIG: 'config',
  },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { list: vi.fn() } },
  },
}))
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  OWNER_EMAIL: 'owner@example.com',
}))
vi.mock('@/lib/orderToken', () => ({
  signOrderToken: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { POST } from '@/app/api/webhooks/stripe/route'
import { stripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/email'
import { signOrderToken } from '@/lib/orderToken'
import { NextRequest } from 'next/server'

function makeRequest(body = 'raw-body', sig = 'sig_123'): NextRequest {
  const headers: Record<string, string> = {}
  if (sig) headers['stripe-signature'] = sig
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sendEmail).mockResolvedValue(undefined as never)
  vi.mocked(signOrderToken).mockResolvedValue('mock-token')
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.ORDER_TOKEN_SECRET = 'test-secret'
  process.env.SITE_URL = 'https://www.sikocoffee.com'
})

describe('POST /api/webhooks/stripe', () => {
  it('署名なしで 400', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: 'body',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Missing signature' })
  })

  it('署名検証失敗で 400', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('Invalid signature')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
  })

  it('checkout.session.completed — 注文保存・メール送信', async () => {
    const session = {
      id: 'cs_123',
      client_reference_id: null,
      customer_details: { email: 'test@example.com', name: 'テスト' },
      amount_total: 2000,
      amount_subtotal: 1500,
      total_details: { amount_shipping: 500 },
      currency: 'jpy',
      created: Math.floor(Date.now() / 1000),
      metadata: {},
      collected_information: {
        shipping_details: {
          name: 'テスト',
          address: { postal_code: '100-0001', state: '東京都', city: '千代田区', line1: '1-1', line2: '' },
        },
      },
    }

    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    } as never)

    mockSend.mockResolvedValue({ Item: null, Items: [], Attributes: {} })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(sendEmail).toHaveBeenCalled()
  })

  it('checkout.session.expired — pending 注文を削除', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.expired',
      data: {
        object: { id: 'cs_456', client_reference_id: 'order_abc' },
      },
    } as never)

    mockSend.mockResolvedValue({})

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSend).toHaveBeenCalled()
  })

  it('charge.refunded — 注文を refunded に更新', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: { payment_intent: 'pi_123' },
      },
    } as never)

    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue({
      data: [{ id: 'cs_789', client_reference_id: 'order_xyz' }],
    } as never)

    mockSend.mockResolvedValue({})

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({
      payment_intent: 'pi_123',
      limit: 1,
    })
  })

  it('未知のイベントタイプでも 200', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'payment_intent.created',
      data: { object: {} },
    } as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })
})
