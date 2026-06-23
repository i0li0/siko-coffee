import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validatePasswordStrength, isPasswordBreached, checkPassword } from '@/lib/passwordPolicy'

describe('validatePasswordStrength', () => {
  it('8文字未満は拒否', () => {
    expect(validatePasswordStrength('short1').ok).toBe(false)
  })

  it('72文字超は拒否', () => {
    expect(validatePasswordStrength('a'.repeat(73)).ok).toBe(false)
  })

  it('よくあるパスワードは拒否', () => {
    expect(validatePasswordStrength('password').ok).toBe(false)
    expect(validatePasswordStrength('Password').ok).toBe(false) // 大文字小文字無視
    expect(validatePasswordStrength('12345678').ok).toBe(false)
  })

  it('同一文字の繰り返しは拒否', () => {
    expect(validatePasswordStrength('aaaaaaaa').ok).toBe(false)
  })

  it('メールのローカル部を含むパスワードは拒否', () => {
    expect(validatePasswordStrength('tanaka-secret', { email: 'tanaka@example.com' }).ok).toBe(false)
  })

  it('名前を含むパスワードは拒否', () => {
    expect(validatePasswordStrength('yamada-coffee', { name: 'Yamada' }).ok).toBe(false)
  })

  it('十分に強いパスワードは許可', () => {
    expect(validatePasswordStrength('Tr0ub4dour&3xtra').ok).toBe(true)
  })
})

describe('isPasswordBreached (HIBP k-anonymity)', () => {
  const realFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  it('レスポンスのサフィックスに一致したら漏洩扱い', async () => {
    // "password" の SHA-1 は 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8（接頭5=5BAA6）
    const suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'
    global.fetch = vi.fn(async () => new Response(`${suffix}:12345\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`)) as unknown as typeof fetch
    expect(await isPasswordBreached('password')).toBe(true)
  })

  it('一致しなければ安全扱い', async () => {
    global.fetch = vi.fn(async () => new Response('ABCDEF0123456789ABCDEF0123456789ABC:9')) as unknown as typeof fetch
    expect(await isPasswordBreached('a-very-unique-passphrase-x9')).toBe(false)
  })

  it('外部エラー時はフェイルオープン（false）', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network') }) as unknown as typeof fetch
    expect(await isPasswordBreached('whatever-strong-1')).toBe(false)
  })
})

describe('checkPassword', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  it('強度NGなら流出チェックせず即NG', async () => {
    const spy = vi.fn()
    global.fetch = spy as unknown as typeof fetch
    const res = await checkPassword('password')
    expect(res.ok).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('強度OK＋未流出なら許可', async () => {
    global.fetch = vi.fn(async () => new Response('ABCDEF0123456789ABCDEF0123456789ABC:9')) as unknown as typeof fetch
    const res = await checkPassword('Tr0ub4dour&3xtra')
    expect(res.ok).toBe(true)
  })
})
