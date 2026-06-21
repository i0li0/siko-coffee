import { describe, it, expect } from 'vitest'
import { getClientIp } from '@/lib/rateLimit'

describe('getClientIp', () => {
  it('x-real-ip を優先', () => {
    const h = new Headers({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' })
    expect(getClientIp(h)).toBe('1.2.3.4')
  })

  it('x-forwarded-for のカンマ区切り先頭を使う', () => {
    const h = new Headers({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2' })
    expect(getClientIp(h)).toBe('10.0.0.1')
  })

  it('ヘッダーなしは "unknown"', () => {
    const h = new Headers()
    expect(getClientIp(h)).toBe('unknown')
  })
})
