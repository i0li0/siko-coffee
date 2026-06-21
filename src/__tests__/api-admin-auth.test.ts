import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/adminPassword', () => ({
  checkAdminPassword: vi.fn(),
}))
vi.mock('@/lib/adminRateLimit', () => ({
  checkRateLimit: vi.fn(),
  recordFailure: vi.fn(),
  resetFailures: vi.fn(),
}))
vi.mock('@/lib/adminSession', () => ({
  createSessionToken: vi.fn(),
  revokeSession: vi.fn(),
}))
vi.mock('@/lib/adminTotp', () => ({
  getTotpSecret: vi.fn(),
}))
vi.mock('otplib', () => ({
  verifySync: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}))

import { POST, DELETE } from '@/app/api/admin/auth/route'
import { checkAdminPassword } from '@/lib/adminPassword'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/adminRateLimit'
import { createSessionToken, revokeSession } from '@/lib/adminSession'
import { getTotpSecret } from '@/lib/adminTotp'
import { verifySync } from 'otplib'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/auth', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-real-ip': '1.2.3.4' },
  })
}

function makeDeleteRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (cookie) headers.cookie = `admin_session=${cookie}`
  return new NextRequest('http://localhost/api/admin/auth', {
    method: 'DELETE',
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true })
  vi.mocked(getTotpSecret).mockResolvedValue(null)
  vi.mocked(recordFailure).mockResolvedValue(undefined)
  vi.mocked(resetFailures).mockResolvedValue(undefined)
  vi.mocked(revokeSession).mockResolvedValue(undefined)
})

describe('POST /api/admin/auth', () => {
  it('レート制限超過で 429', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 900 })
    const res = await POST(makeRequest({ password: 'x' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('900')
  })

  it('パスワード不一致で 401 + recordFailure', async () => {
    vi.mocked(checkAdminPassword).mockReturnValue(false)
    const res = await POST(makeRequest({ password: 'wrong' }))
    expect(res.status).toBe(401)
    expect(recordFailure).toHaveBeenCalledWith('1.2.3.4')
  })

  it('パスワード正解・TOTP なしでログイン成功', async () => {
    vi.mocked(checkAdminPassword).mockReturnValue(true)
    vi.mocked(createSessionToken).mockResolvedValue('session-token-123')
    const res = await POST(makeRequest({ password: 'correct' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(resetFailures).toHaveBeenCalledWith('1.2.3.4')
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('admin_session=session-token-123')
    expect(setCookie).toContain('HttpOnly')
  })

  it('TOTP 有効でコード未送信時は requireTotp を返す', async () => {
    vi.mocked(checkAdminPassword).mockReturnValue(true)
    vi.mocked(getTotpSecret).mockResolvedValue('JBSWY3DPEHPK3PXP')
    const res = await POST(makeRequest({ password: 'correct' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requireTotp).toBe(true)
  })

  it('TOTP コード不正で 401', async () => {
    vi.mocked(checkAdminPassword).mockReturnValue(true)
    vi.mocked(getTotpSecret).mockResolvedValue('JBSWY3DPEHPK3PXP')
    vi.mocked(verifySync).mockReturnValue({ valid: false } as ReturnType<typeof verifySync>)
    const res = await POST(makeRequest({ password: 'correct', totpCode: '000000' }))
    expect(res.status).toBe(401)
    expect(recordFailure).toHaveBeenCalled()
  })

  it('TOTP コード正解でログイン成功', async () => {
    vi.mocked(checkAdminPassword).mockReturnValue(true)
    vi.mocked(getTotpSecret).mockResolvedValue('JBSWY3DPEHPK3PXP')
    vi.mocked(verifySync).mockReturnValue({ valid: true } as ReturnType<typeof verifySync>)
    vi.mocked(createSessionToken).mockResolvedValue('tok')
    const res = await POST(makeRequest({ password: 'correct', totpCode: '123456' }))
    expect(res.status).toBe(200)
    expect(resetFailures).toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/auth', () => {
  it('セッション Cookie ありで revokeSession を呼ぶ', async () => {
    const res = await DELETE(makeDeleteRequest('my-session'))
    expect(res.status).toBe(200)
    expect(revokeSession).toHaveBeenCalledWith('my-session')
  })

  it('Cookie なしでも 200', async () => {
    const res = await DELETE(makeDeleteRequest())
    expect(res.status).toBe(200)
    expect(revokeSession).not.toHaveBeenCalled()
  })
})
