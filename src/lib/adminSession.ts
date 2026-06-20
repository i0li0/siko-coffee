import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'

const SESSION_DURATION_SEC = 60 * 60 * 24 // 24 hours

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

function sessionKey(sessionId: string) {
  return `session#${sessionId}`
}

async function parseAndVerifySignature(token: string): Promise<{ sessionId: string; exp: number } | null> {
  try {
    const dotIndex = token.lastIndexOf('.')
    if (dotIndex === -1) return null
    const payload = token.slice(0, dotIndex)
    const sig = token.slice(dotIndex + 1)
    if (!payload || !sig) return null

    const key = await getKey(getSecret())
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(payload)
    )
    if (!valid) return null

    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)))
    if (typeof data.exp !== 'number' || data.exp <= Math.floor(Date.now() / 1000)) return null
    if (typeof data.sessionId !== 'string') return null
    return data
  } catch {
    return null
  }
}

export async function createSessionToken(): Promise<string> {
  const sessionId = crypto.randomUUID()
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SEC
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ sessionId, exp })))
  const key = await getKey(getSecret())
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))

  if (isDbConfigured()) {
    const ttl = exp + 60
    await getDocClient().send(new PutCommand({
      TableName: TABLE.CONFIG,
      Item: { configKey: sessionKey(sessionId), ttl },
    }))
  }

  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`
}

// middleware 用: HMAC 署名 + 有効期限のみ検証（DB アクセスなし）
export async function verifySessionToken(token: string): Promise<boolean> {
  return (await parseAndVerifySignature(token)) !== null
}

// API route 用: 署名検証 + DB 存在チェック（サーバー側失効対応）
export async function verifySessionStrict(token: string): Promise<boolean> {
  const data = await parseAndVerifySignature(token)
  if (!data) return false
  if (!isDbConfigured()) return true

  try {
    const res = await getDocClient().send(new GetCommand({
      TableName: TABLE.CONFIG,
      Key: { configKey: sessionKey(data.sessionId) },
    }))
    return Boolean(res.Item)
  } catch {
    return false
  }
}

export async function revokeSession(token: string): Promise<void> {
  const data = await parseAndVerifySignature(token)
  if (!data || !isDbConfigured()) return

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE.CONFIG,
      Key: { configKey: sessionKey(data.sessionId) },
    }))
  } catch {
    // best-effort
  }
}
