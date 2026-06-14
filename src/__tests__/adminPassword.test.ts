import { describe, it, expect, beforeEach } from 'vitest'
import { hashPassword, checkAdminPassword } from '@/lib/adminPassword'

describe('hashPassword', () => {
  it('scrypt: プレフィックスを返す', () => {
    const hash = hashPassword('password123')
    expect(hash).toMatch(/^scrypt:[a-f0-9]+:[a-f0-9]+$/)
  })

  it('同じパスワードでも毎回異なるハッシュ（salt が変わる）', () => {
    const h1 = hashPassword('same')
    const h2 = hashPassword('same')
    expect(h1).not.toBe(h2)
  })
})

describe('checkAdminPassword', () => {
  beforeEach(() => {
    delete process.env.ADMIN_PASSWORD_HASH
    delete process.env.ADMIN_PASSWORD
  })

  it('ADMIN_PASSWORD_HASH（scrypt）が一致すれば true', () => {
    process.env.ADMIN_PASSWORD_HASH = hashPassword('correct')
    expect(checkAdminPassword('correct')).toBe(true)
  })

  it('ADMIN_PASSWORD_HASH（scrypt）が不一致なら false', () => {
    process.env.ADMIN_PASSWORD_HASH = hashPassword('correct')
    expect(checkAdminPassword('wrong')).toBe(false)
  })

  it('env が未設定なら false', () => {
    expect(checkAdminPassword('anything')).toBe(false)
  })

  it('長さが違う平文パスワードは false（timing-safe）', () => {
    process.env.ADMIN_PASSWORD = 'short'
    expect(checkAdminPassword('toolongpassword')).toBe(false)
  })
})
