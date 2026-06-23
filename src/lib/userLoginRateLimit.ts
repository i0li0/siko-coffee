import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'

// 一般ユーザーのログイン総当たり対策（失敗ベースのロックアウト）。
// 管理者用 adminRateLimit と同じ設計だが、公開ログインのため閾値を調整している。
//
// - IP 別: クレデンシャルスタッフィング（多数アカウントへの試行）を抑止。
//   共有 NAT（オフィス/モバイル回線）で正規ユーザーが巻き込まれにくいよう高めの閾値。
// - メール別: 特定アカウントを狙った（IP を変えての）総当たりを抑止。
//   メール別ロックは攻撃者によるアカウント・ロックアウト DoS を招くため、
//   閾値はやや高め・ロック時間は短め（15分）に留める。
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000
const IP_MAX_ATTEMPTS = 20
const EMAIL_MAX_ATTEMPTS = 8

function ipKey(ip: string) {
  return `userLoginRL#ip#${ip}`
}
function emailKey(email: string) {
  return `userLoginRL#email#${email}`
}

interface Entry {
  count: number
  firstAttempt: number
  lockedUntil: number
}

// 「項目なし」は null を返すが、DynamoDB エラーは throw する。
// 呼び出し側でフェイルクローズ（ログイン拒否）扱いにするため握りつぶさない。
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
      new PutCommand({ TableName: TABLE.CONFIG, Item: { configKey, ...entry, ttl } })
    )
  } catch {
    // 書き込み失敗は best-effort（次回 check で読めなければフェイルクローズ側で守る）
  }
}

async function checkLimit(configKey: string, maxAttempts: number): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now()
  // DB 未設定（CI / ローカル等）は永続ストアが無いためレート制限をスキップする。
  if (!isDbConfigured()) return { allowed: true }
  let entry: Entry | null
  try {
    entry = await getEntry(configKey)
  } catch {
    // DynamoDB 障害時はフェイルクローズ（総当たりを許さない）。
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

async function recordFailure(configKey: string, maxAttempts: number): Promise<void> {
  if (!isDbConfigured()) return
  const now = Date.now()
  let entry: Entry | null
  try {
    entry = await getEntry(configKey)
  } catch {
    entry = null // 読み取り失敗時は新規作成にフォールバック（best-effort）
  }
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    await putEntry(configKey, { count: 1, firstAttempt: now, lockedUntil: 0 })
    return
  }
  const count = entry.count + 1
  const lockedUntil = count >= maxAttempts ? now + LOCKOUT_MS : 0
  await putEntry(configKey, { ...entry, count, lockedUntil })
}

async function reset(configKey: string): Promise<void> {
  if (!isDbConfigured()) return
  try {
    await getDocClient().send(
      new DeleteCommand({ TableName: TABLE.CONFIG, Key: { configKey } })
    )
  } catch {
    // フェイルサイレント
  }
}

// IP・メールのいずれかがロックされていればログインを拒否する。
export async function checkLoginAllowed(ip: string, email: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const [ipRes, emailRes] = await Promise.all([
    checkLimit(ipKey(ip), IP_MAX_ATTEMPTS),
    checkLimit(emailKey(email), EMAIL_MAX_ATTEMPTS),
  ])
  if (!ipRes.allowed || !emailRes.allowed) {
    return { allowed: false, retryAfter: Math.max(ipRes.retryAfter ?? 0, emailRes.retryAfter ?? 0) || 60 }
  }
  return { allowed: true }
}

// ログイン失敗（ユーザー不在・パスワード不一致）時に IP・メール両方の失敗を記録する。
export async function recordLoginFailure(ip: string, email: string): Promise<void> {
  await Promise.all([
    recordFailure(ipKey(ip), IP_MAX_ATTEMPTS),
    recordFailure(emailKey(email), EMAIL_MAX_ATTEMPTS),
  ])
}

// パスワード検証成功時に失敗カウンタをクリアする。
export async function clearLoginFailures(ip: string, email: string): Promise<void> {
  await Promise.all([reset(ipKey(ip)), reset(emailKey(email))])
}
