const SESSION_DURATION_SEC = 60 * 60 * 24 * 7 // 7 days

// Edge ランタイム（middleware）でも動くよう Buffer を使わず WebCrypto + base64url ヘルパで実装する。
// トークン形式は従来と完全に同一なので、既存セッションはそのまま有効。
function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4)
  const bin = atob(s + '='.repeat(pad))
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set')
  return secret
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function createSessionToken(): Promise<string> {
  const sessionId = crypto.randomUUID()
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SEC
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ sessionId, exp })))
  const key = await getKey(getSecret())
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const dotIndex = token.lastIndexOf('.')
    if (dotIndex === -1) return false
    const payload = token.slice(0, dotIndex)
    const sig = token.slice(dotIndex + 1)
    if (!payload || !sig) return false

    const key = await getKey(getSecret())
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(payload)
    )
    if (!valid) return false

    const { exp } = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)))
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}
