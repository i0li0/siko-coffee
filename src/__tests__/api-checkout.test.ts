import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('@/lib/db', () => ({
  getDocClient: () => ({ send: mockSend }),
  TABLE: { PRODUCTS: 'products', ORDERS: 'orders', CONFIG: 'config' },
  isDbConfigured: () => false,
}))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: { create: vi.fn() },
    },
  },
}))
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({
  checkGeneralRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import { POST } from '@/app/api/checkout/route'
import { stripe } from '@/lib/stripe'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { auth } from '@/lib/auth'
import { NextRequest } from 'next/server'

function makeRequest(formFields: Record<string, string>): NextRequest {
  const form = new FormData()
  for (const [k, v] of Object.entries(formFields)) form.append(k, v)
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    body: form,
    headers: { host: 'www.sikocoffee.com' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClientIp).mockReturnValue('1.2.3.4')
  vi.mocked(checkGeneralRateLimit).mockResolvedValue({ allowed: true })
  vi.mocked(auth).mockResolvedValue(null as never)
})

describe('POST /api/checkout', () => {
  it('レート制限超過で 429', async () => {
    vi.mocked(checkGeneralRateLimit).mockResolvedValue({ allowed: false, retryAfter: 60 })
    const res = await POST(makeRequest({ productId: 'x' }))
    expect(res.status).toBe(429)
  })

  it('productId なしで 400', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid productId' })
  })

  it('商品が見つからない場合 404', async () => {
    mockSend.mockResolvedValue({ Item: null })
    const res = await POST(makeRequest({ productId: 'prod_1' }))
    expect(res.status).toBe(404)
  })

  it('非公開商品は 404', async () => {
    mockSend.mockResolvedValue({ Item: { id: 'prod_1', isPublic: false, price: 1000, name: 'x', type: 'beans' } })
    const res = await POST(makeRequest({ productId: 'prod_1' }))
    expect(res.status).toBe(404)
  })

  it('menu タイプは 404', async () => {
    mockSend.mockResolvedValue({ Item: { id: 'prod_1', isPublic: true, type: 'menu', price: 500, name: 'x' } })
    const res = await POST(makeRequest({ productId: 'prod_1' }))
    expect(res.status).toBe(404)
  })

  it('canCustomize な商品は 404', async () => {
    mockSend.mockResolvedValue({ Item: { id: 'prod_1', isPublic: true, type: 'beans', price: 1000, name: 'x', canCustomize: true } })
    const res = await POST(makeRequest({ productId: 'prod_1' }))
    expect(res.status).toBe(404)
  })

  it('正常な商品で Stripe セッション作成 → 303 リダイレクト', async () => {
    mockSend.mockResolvedValue({
      Item: { id: 'prod_1', isPublic: true, type: 'beans', price: 2000, name: 'テスト豆', description: 'desc' },
    })
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
    } as never)

    const res = await POST(makeRequest({ productId: 'prod_1' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://checkout.stripe.com/test')

    const createCall = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0] as Record<string, unknown>
    expect(createCall.mode).toBe('payment')
    expect(createCall.locale).toBe('ja')
  })

  it('Stripe エラーで 500', async () => {
    mockSend.mockResolvedValue({
      Item: { id: 'prod_1', isPublic: true, type: 'beans', price: 2000, name: 'x' },
    })
    vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(new Error('Stripe down'))
    const res = await POST(makeRequest({ productId: 'prod_1' }))
    expect(res.status).toBe(500)
  })

  it('session.url が null の場合 500', async () => {
    mockSend.mockResolvedValue({
      Item: { id: 'prod_1', isPublic: true, type: 'beans', price: 2000, name: 'x' },
    })
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: null } as never)
    const res = await POST(makeRequest({ productId: 'prod_1' }))
    expect(res.status).toBe(500)
  })
})
