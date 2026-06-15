import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, isDbConfigured, TABLE } from '@/lib/db'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000

function key(ip: string) {
  return `rateLimit#${ip}`
}

interface Entry {
  count: number
  firstAttempt: number
  lockedUntil: number
}

async function getEntry(ip: string): Promise<Entry | null> {
  try {
    const res = await getDocClient().send(
      new GetCommand({ TableName: TABLE.CONFIG, Key: { configKey: key(ip) } })
    )
    if (!res.Item) return null
    return res.Item as Entry
  } catch {
    return null
  }
}

async function putEntry(ip: string, entry: Entry): Promise<void> {
  const ttl = Math.ceil((Math.max(entry.lockedUntil, entry.firstAttempt + WINDOW_MS) + 60_000) / 1000)
  try {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE.CONFIG,
        Item: { configKey: key(ip), ...entry, ttl },
      })
    )
  } catch {
    // DynamoDB 障害時はフェイルオープン（ログイン試行を止めない）
  }
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  // AWS 認証情報が無い環境（CI のモック実行など）では DynamoDB を呼ばず、
  // フェイルオープンでレート制限をスキップする。
  if (!isDbConfigured()) return { allowed: true }

  const now = Date.now()
  const entry = await getEntry(ip)
  if (!entry) return { allowed: true }

  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) }
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    return { allowed: true }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_MS
    await putEntry(ip, { ...entry, lockedUntil })
    return { allowed: false, retryAfter: Math.ceil(LOCKOUT_MS / 1000) }
  }

  return { allowed: true }
}

export async function recordFailure(ip: string): Promise<void> {
  if (!isDbConfigured()) return

  const now = Date.now()
  const entry = await getEntry(ip)
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    await putEntry(ip, { count: 1, firstAttempt: now, lockedUntil: 0 })
    return
  }
  const count = entry.count + 1
  const lockedUntil = count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0
  await putEntry(ip, { ...entry, count, lockedUntil })
}

export async function resetFailures(ip: string): Promise<void> {
  if (!isDbConfigured()) return

  try {
    await getDocClient().send(
      new DeleteCommand({ TableName: TABLE.CONFIG, Key: { configKey: key(ip) } })
    )
  } catch {
    // フェイルサイレント
  }
}
