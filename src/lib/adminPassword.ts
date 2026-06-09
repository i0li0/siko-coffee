import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }
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
  const actual = scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS)
  const expected = Buffer.from(expectedHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function checkAdminPassword(password: string): boolean {
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (hash?.startsWith('scrypt:')) {
    return verifyScrypt(password, hash)
  }
  // Plaintext fallback for migration
  const plain = process.env.ADMIN_PASSWORD ?? ''
  if (!plain) return false
  try {
    const a = Buffer.from(password)
    const b = Buffer.from(plain)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
