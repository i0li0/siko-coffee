import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000

// グローバル（全IP合算）の上限。単一共有パスワードのため、
// 多数のIPからの分散ブルートフォースを IP 別制限だけでは防げない。
// 正規管理者は数回しか失敗しないため、閾値は高めに設定する。
const GLOBAL_MAX_ATTEMPTS = 20
const GLOBAL_KEY = '__global__'

function key(ip: string) {
  return `rateLimit#${ip}`
}

interface Entry {
  count: number
  firstAttempt: number
  lockedUntil: number
}

// 「項目なし」は null を返すが、DynamoDB エラーは throw する。
// 呼び出し側でエラーをフェイルクローズ（ログイン拒否）扱いにするため、ここで握りつぶさない。
async function getEntry(configKey: string): Promise<Entry | null> {
  const res = await getDocClient().send(
    new GetCommand({ TableName: TABLE.CONFIG, Key: { configKey } })
  )
  if (!res.Item) return null
  return res.Item as Entry
}

async function putEntry(configKey: string, entry: Entry): Promise<void> {
  const ttl = Math.ceil((Math.max(entry.lockedUntil, entry.firstAttempt + WINDOW_MS) + 60_000) / 1000)
  try {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE.CONFIG,
        Item: { configKey, ...entry, ttl },
      })
    )
  } catch {
    // 書き込み失敗は best-effort（次回 checkLimit が読めなければフェイルクローズ側で守る）
  }
}

async function checkLimit(configKey: string, maxAttempts: number): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now()
  // DB 未設定（CI / ローカル等）は永続ストアが無いためレート制限をスキップする。
  // 「設定済みなのに障害」のときだけフェイルクローズしたいので、両者を区別する。
  if (!isDbConfigured()) return { allowed: true }
  let entry: Entry | null
  try {
    entry = await getEntry(configKey)
  } catch {
    // DynamoDB 障害時はフェイルクローズ（ブルートフォースを許さない）。
    // 管理データ自体が DynamoDB 上にあるため、障害中にログインできなくても実害はない。
    return { allowed: false, retryAfter: 60 }
  }
  if (!entry) return { allowed: true }

  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) }
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    return { allowed: true }
  }

  if (entry.count >= maxAttempts) {
    const lockedUntil = now + LOCKOUT_MS
    await putEntry(configKey, { ...entry, lockedUntil })
    return { allowed: false, retryAfter: Math.ceil(LOCKOUT_MS / 1000) }
  }

  return { allowed: true }
}

async function recordLimitFailure(configKey: string, maxAttempts: number): Promise<void> {
  if (!isDbConfigured()) return
  const now = Date.now()
  let entry: Entry | null
  try {
    entry = await getEntry(configKey)
  } catch {
    // 読み取り失敗時は新規エントリ作成にフォールバック（best-effort）。
    entry = null
  }
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    await putEntry(configKey, { count: 1, firstAttempt: now, lockedUntil: 0 })
    return
  }
  const count = entry.count + 1
  const lockedUntil = count >= maxAttempts ? now + LOCKOUT_MS : 0
  await putEntry(configKey, { ...entry, count, lockedUntil })
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  return checkLimit(key(ip), MAX_ATTEMPTS)
}

export async function recordFailure(ip: string): Promise<void> {
  return recordLimitFailure(key(ip), MAX_ATTEMPTS)
}

// IP に依存しない全体の失敗カウンタ。Botnet 等での分散総当たりを抑止する。
export async function checkGlobalRateLimit(): Promise<{ allowed: boolean; retryAfter?: number }> {
  return checkLimit(key(GLOBAL_KEY), GLOBAL_MAX_ATTEMPTS)
}

export async function recordGlobalFailure(): Promise<void> {
  return recordLimitFailure(key(GLOBAL_KEY), GLOBAL_MAX_ATTEMPTS)
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
