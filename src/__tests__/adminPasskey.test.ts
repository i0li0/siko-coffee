import { describe, it, expect, beforeEach } from 'vitest'
import {
  signChallenge,
  verifyChallengeCookie,
  getRpConfig,
  createChallengeToken,
  consumeChallengeToken,
} from '@/lib/adminPasskey'

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = 'test-secret-32-chars-long-enough!'
  delete process.env.WEBAUTHN_RP_ID
  delete process.env.WEBAUTHN_RP_NAME
  delete process.env.WEBAUTHN_ORIGIN
  // DB 未設定（CI）では署名Cookieフォールバック経路を検証する
  delete process.env.AWS_ACCESS_KEY_ID
  delete process.env.AWS_SECRET_ACCESS_KEY
})

describe('signChallenge / verifyChallengeCookie', () => {
  it('署名したチャレンジは検証で同じ値が取り出せる', () => {
    const cookie = signChallenge('abc123')
    expect(verifyChallengeCookie(cookie)).toBe('abc123')
  })

  it('改ざんされた Cookie は null', () => {
    const cookie = signChallenge('abc123')
    expect(verifyChallengeCookie(cookie.slice(0, -4) + 'XXXX')).toBeNull()
  })

  it('undefined / 空文字は null', () => {
    expect(verifyChallengeCookie(undefined)).toBeNull()
    expect(verifyChallengeCookie('')).toBeNull()
  })

  it('ドットを含まない文字列は null', () => {
    expect(verifyChallengeCookie('notacookie')).toBeNull()
  })

  it('期限切れのチャレンジは null', () => {
    const cookie = signChallenge('abc123', -1)
    expect(verifyChallengeCookie(cookie)).toBeNull()
  })

  it('別のシークレットで署名された Cookie は null', () => {
    const cookie = signChallenge('abc123')
    process.env.ADMIN_SESSION_SECRET = 'different-secret-also-long-enough!!'
    expect(verifyChallengeCookie(cookie)).toBeNull()
  })
})

describe('createChallengeToken / consumeChallengeToken (DB未設定=署名Cookieフォールバック)', () => {
  it('発行したトークンは消費で同じ値が取り出せる', async () => {
    const token = await createChallengeToken('chal-xyz')
    expect(token.startsWith('sig.')).toBe(true)
    expect(await consumeChallengeToken(token)).toBe('chal-xyz')
  })

  it('改ざんトークンは null', async () => {
    const token = await createChallengeToken('chal-xyz')
    expect(await consumeChallengeToken(token.slice(0, -4) + 'XXXX')).toBeNull()
  })

  it('期限切れトークンは null', async () => {
    const token = await createChallengeToken('chal-xyz', -1)
    expect(await consumeChallengeToken(token)).toBeNull()
  })

  it('未知のプレフィックス / undefined は null', async () => {
    expect(await consumeChallengeToken('xx.zzz')).toBeNull()
    expect(await consumeChallengeToken(undefined)).toBeNull()
  })
})

describe('getRpConfig', () => {
  it('env 未設定時はリクエスト URL から導出する', () => {
    const cfg = getRpConfig('https://www.sikocoffee.com/api/admin/passkey/login')
    expect(cfg.rpID).toBe('www.sikocoffee.com')
    expect(cfg.origin).toBe('https://www.sikocoffee.com')
    expect(cfg.rpName).toBe('Sikō Coffee')
  })

  it('env が優先される', () => {
    process.env.WEBAUTHN_RP_ID = 'sikocoffee.com'
    process.env.WEBAUTHN_ORIGIN = 'https://sikocoffee.com'
    process.env.WEBAUTHN_RP_NAME = 'Custom'
    const cfg = getRpConfig('https://localhost:3000/x')
    expect(cfg.rpID).toBe('sikocoffee.com')
    expect(cfg.origin).toBe('https://sikocoffee.com')
    expect(cfg.rpName).toBe('Custom')
  })
})
