import { describe, it, expect } from 'vitest'
import { decideOAuthSignIn } from '@/lib/oauthLinking'

describe('decideOAuthSignIn', () => {
  it('プロバイダ未検証メールは拒否（なりすまし防止）', () => {
    const d = decideOAuthSignIn({
      provider: 'google',
      providerEmailVerified: false,
      email: 'a@example.com',
      existingUserExists: false,
      existingUserEmailVerified: null,
    })
    expect(d).toEqual({ ok: false, reason: 'provider_unverified' })
  })

  it('メール無しは拒否（メールキー設計のため必須）', () => {
    const d = decideOAuthSignIn({
      provider: 'line',
      providerEmailVerified: true,
      email: null,
      existingUserExists: false,
      existingUserEmailVerified: null,
    })
    expect(d).toEqual({ ok: false, reason: 'no_email' })
  })

  it('空白のみのメールも拒否', () => {
    const d = decideOAuthSignIn({
      provider: 'google',
      providerEmailVerified: true,
      email: '   ',
      existingUserExists: false,
      existingUserEmailVerified: null,
    })
    expect(d).toEqual({ ok: false, reason: 'no_email' })
  })

  it('新規ユーザー（既存なし）は許可', () => {
    const d = decideOAuthSignIn({
      provider: 'google',
      providerEmailVerified: true,
      email: 'new@example.com',
      existingUserExists: false,
      existingUserEmailVerified: null,
    })
    expect(d).toEqual({ ok: true })
  })

  it('既存が確認済みなら自動リンク許可', () => {
    const d = decideOAuthSignIn({
      provider: 'google',
      providerEmailVerified: true,
      email: 'verified@example.com',
      existingUserExists: true,
      existingUserEmailVerified: new Date(),
    })
    expect(d).toEqual({ ok: true })
  })

  it('既存が未確認なら自動リンク拒否（pre-account-hijacking 防止）', () => {
    const d = decideOAuthSignIn({
      provider: 'google',
      providerEmailVerified: true,
      email: 'squatted@example.com',
      existingUserExists: true,
      existingUserEmailVerified: null,
    })
    expect(d).toEqual({ ok: false, reason: 'link_unverified' })
  })

  it('emailVerified が文字列(ISO)でも確認済みとして扱う', () => {
    const d = decideOAuthSignIn({
      provider: 'line',
      providerEmailVerified: true,
      email: 'verified@example.com',
      existingUserExists: true,
      existingUserEmailVerified: '2026-01-01T00:00:00.000Z',
    })
    expect(d).toEqual({ ok: true })
  })
})
