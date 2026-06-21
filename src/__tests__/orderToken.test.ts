import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signOrderToken, verifyOrderToken } from '@/lib/orderToken'

beforeEach(() => {
  process.env.ORDER_TOKEN_SECRET = 'test-order-secret-long-enough-for-hmac!'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('signOrderToken / verifyOrderToken', () => {
  it('生成したトークンは同じ注文 ID で検証通過', async () => {
    const token = await signOrderToken('order_001')
    expect(await verifyOrderToken('order_001', token)).toBe(true)
  })

  it('異なる注文 ID では検証失敗', async () => {
    const token = await signOrderToken('order_001')
    expect(await verifyOrderToken('order_002', token)).toBe(false)
  })

  it('改ざんトークンは検証失敗', async () => {
    const token = await signOrderToken('order_001')
    const tampered = token.slice(0, -4) + 'XXXX'
    expect(await verifyOrderToken('order_001', tampered)).toBe(false)
  })

  it('空の orderId/token は false', async () => {
    expect(await verifyOrderToken('', 'sometoken')).toBe(false)
    expect(await verifyOrderToken('order_001', '')).toBe(false)
  })

  it('期限切れトークンは false', async () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-06-01T00:00:00Z').getTime()
    vi.setSystemTime(baseTime)

    const token = await signOrderToken('order_001')

    // 181日後に進める（TOKEN_TTL_SEC = 180日）
    vi.setSystemTime(baseTime + 181 * 24 * 60 * 60 * 1000)
    expect(await verifyOrderToken('order_001', token)).toBe(false)
  })

  it('期限内のトークンは有効', async () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-06-01T00:00:00Z').getTime()
    vi.setSystemTime(baseTime)

    const token = await signOrderToken('order_001')

    // 179日後（まだ有効）
    vi.setSystemTime(baseTime + 179 * 24 * 60 * 60 * 1000)
    expect(await verifyOrderToken('order_001', token)).toBe(true)
  })
})

describe('verifyOrderToken — 旧形式', () => {
  it('旧形式の不正トークンは false', async () => {
    // ドットを含まないトークン（旧形式扱い）でも不正な値は false
    expect(await verifyOrderToken('order_001', 'invalid-legacy-token')).toBe(false)
  })

  it('2026-12-15 以降は旧形式を拒否', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    // ドットなしトークン = 旧形式判定 → cutoff 後なので false
    expect(await verifyOrderToken('order_001', 'anytokenwithnodot')).toBe(false)
  })
})
