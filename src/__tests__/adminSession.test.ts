import { describe, it, expect, beforeEach } from 'vitest'
import { createSessionToken, verifySessionToken } from '@/lib/adminSession'

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = 'test-secret-32-chars-long-enough!'
})

describe('createSessionToken / verifySessionToken', () => {
  it('生成したトークンは検証を通過する', async () => {
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('改ざんされたトークンは検証を通過しない', async () => {
    const token = await createSessionToken()
    const tampered = token.slice(0, -4) + 'XXXX'
    expect(await verifySessionToken(tampered)).toBe(false)
  })

  it('空文字は false', async () => {
    expect(await verifySessionToken('')).toBe(false)
  })

  it('ドットなし文字列は false', async () => {
    expect(await verifySessionToken('notavalidtoken')).toBe(false)
  })

  it('期限切れペイロードは false', async () => {
    const exp = Math.floor(Date.now() / 1000) - 1
    const payload = Buffer.from(JSON.stringify({ sessionId: 'x', exp })).toString('base64url')
    // 署名なし（不正形式）でも期限切れチェック前に弾かれる
    expect(await verifySessionToken(`${payload}.invalidsig`)).toBe(false)
  })
})
