const SESSION_DURATION_SEC = 60 * 60 * 24 * 7 // 7 days

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
  const payload = Buffer.from(JSON.stringify({ sessionId, exp })).toString('base64url')
  const key = await getKey(getSecret())
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${Buffer.from(sig).toString('base64url')}`
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
      Buffer.from(sig, 'base64url'),
      new TextEncoder().encode(payload)
    )
    if (!valid) return false

    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}
