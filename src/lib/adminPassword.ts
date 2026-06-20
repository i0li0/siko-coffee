import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const LEGACY_SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyScrypt(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expectedHex] = parts
  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== KEY_LEN) return false

  const actual = scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS)
  if (actual.length === expected.length && timingSafeEqual(actual, expected)) return true

  const legacy = scryptSync(password, salt, KEY_LEN, LEGACY_SCRYPT_PARAMS)
  if (legacy.length === expected.length && timingSafeEqual(legacy, expected)) return true

  return false
}

export function checkAdminPassword(password: string): boolean {
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (!hash?.startsWith('scrypt:')) return false
  return verifyScrypt(password, hash)
}
