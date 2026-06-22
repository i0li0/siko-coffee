import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'

const CONFIG_KEY = 'passkey_credentials'

export interface StoredCredential {
  /** base64url-encoded credential ID */
  id: string
  /** base64url-encoded COSE public key */
  publicKey: string
  /** signature counter for replay detection */
  counter: number
  transports?: string[]
  label: string
  createdAt: number
  /** 最終認証成功時刻（不審な利用検知用） */
  lastUsedAt?: number
}

// 管理者は少数のため、認証情報は CONFIG テーブルの 1 アイテムに配列で保持する。
// （read-modify-write の競合は単一管理者運用では許容範囲）
export async function getCredentials(): Promise<StoredCredential[]> {
  if (!isDbConfigured()) return []
  try {
    const res = await getDocClient().send(
      new GetCommand({ TableName: TABLE.CONFIG, Key: { configKey: CONFIG_KEY } })
    )
    return (res.Item?.credentials as StoredCredential[]) ?? []
  } catch {
    return []
  }
}

async function saveCredentials(creds: StoredCredential[]): Promise<void> {
  if (!isDbConfigured()) return
  await getDocClient().send(
    new PutCommand({ TableName: TABLE.CONFIG, Item: { configKey: CONFIG_KEY, credentials: creds } })
  )
}

export async function addCredential(cred: StoredCredential): Promise<void> {
  const creds = await getCredentials()
  if (creds.some(c => c.id === cred.id)) return // 既登録なら何もしない
  creds.push(cred)
  await saveCredentials(creds)
}

export async function removeCredential(id: string): Promise<void> {
  const creds = await getCredentials()
  await saveCredentials(creds.filter(c => c.id !== id))
}

// 認証成功時に counter と最終利用時刻を更新する。
export async function recordCredentialUse(id: string, counter: number): Promise<void> {
  const creds = await getCredentials()
  const target = creds.find(c => c.id === id)
  if (!target) return
  target.counter = counter
  target.lastUsedAt = Date.now()
  await saveCredentials(creds)
}

// ===== Relying Party 設定 =====
// 環境変数で上書きできるが、未設定時はリクエスト元から導出するため
// localhost / preview / 本番のいずれでも追加設定なしで動作する。
export function getRpConfig(requestUrl: string): { rpID: string; rpName: string; origin: string } {
  const rpName = process.env.WEBAUTHN_RP_NAME || 'Sikō Coffee'
  const origin = process.env.WEBAUTHN_ORIGIN || new URL(requestUrl).origin
  const rpID = process.env.WEBAUTHN_RP_ID || new URL(origin).hostname
  return { rpID, rpName, origin }
}

// ===== チャレンジ用署名付き Cookie =====
// WebAuthn のチャレンジはサーバーが発行した未知の乱数である必要がある。
// DynamoDB に依存せず改ざん不可にするため、HMAC 署名 + 有効期限付き Cookie で保持する。
function challengeSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set')
  return secret
}

export function signChallenge(challenge: string, ttlSec = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const payload = Buffer.from(JSON.stringify({ challenge, exp })).toString('base64url')
  const sig = createHmac('sha256', challengeSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyChallengeCookie(value: string | undefined): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot === -1) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  if (!payload || !sig) return null

  const expected = createHmac('sha256', challengeSecret()).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.exp !== 'number' || data.exp <= Math.floor(Date.now() / 1000)) return null
    if (typeof data.challenge !== 'string') return null
    return data.challenge
  } catch {
    return null
  }
}

export const CHALLENGE_COOKIE = 'pk_challenge'

// ===== 単回消費チャレンジ（リプレイ防止の強化）=====
// 署名Cookieはステートレスのため、同期パスキー(counter=0)では同一アサーションの
// リプレイを counter で検出できない。本番(DB有)ではチャレンジを DynamoDB に保存し、
// 検証時に「取得と同時に削除（atomic）」して単回消費にする。
// DB 未設定（ローカル等）は従来の署名Cookieにフォールバックする。
const CHALLENGE_PREFIX = 'passkeyChallenge#'

export async function createChallengeToken(challenge: string, ttlSec = 300): Promise<string> {
  if (isDbConfigured()) {
    const id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    try {
      await getDocClient().send(new PutCommand({
        TableName: TABLE.CONFIG,
        Item: { configKey: CHALLENGE_PREFIX + id, challenge, exp: now + ttlSec, ttl: now + ttlSec + 60 },
      }))
      return `db.${id}`
    } catch {
      // DB 書き込み失敗時は署名Cookieにフォールバック
    }
  }
  return `sig.${signChallenge(challenge, ttlSec)}`
}

export async function consumeChallengeToken(value: string | undefined): Promise<string | null> {
  if (!value) return null

  if (value.startsWith('db.')) {
    if (!isDbConfigured()) return null
    const key = CHALLENGE_PREFIX + value.slice(3)
    try {
      // DeleteCommand + ReturnValues:ALL_OLD で「取得と削除」を不可分に行う。
      // 並行リクエストでも item を受け取れるのは1回だけ＝リプレイ不可。
      const res = await getDocClient().send(new DeleteCommand({
        TableName: TABLE.CONFIG,
        Key: { configKey: key },
        ReturnValues: 'ALL_OLD',
      }))
      const item = res.Attributes
      if (!item || typeof item.challenge !== 'string') return null
      // DynamoDB の TTL 削除は遅延するため exp を明示チェックする。
      if (typeof item.exp !== 'number' || item.exp <= Math.floor(Date.now() / 1000)) return null
      return item.challenge
    } catch {
      return null
    }
  }

  if (value.startsWith('sig.')) {
    return verifyChallengeCookie(value.slice(4))
  }

  return null
}
