import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'

const CONFIG_KEY = 'totp_secret'
const LAST_STEP_KEY = 'totp_last_step'

export async function getTotpSecret(): Promise<string | null> {
  if (isDbConfigured()) {
    try {
      const res = await getDocClient().send(new GetCommand({
        TableName: TABLE.CONFIG,
        Key: { configKey: CONFIG_KEY },
      }))
      if (res.Item?.secret) return res.Item.secret as string
    } catch {
      // fall through to env var
    }
  }

  return process.env.ADMIN_TOTP_SECRET || null
}

export async function saveTotpSecret(secret: string): Promise<void> {
  if (!isDbConfigured()) return
  await getDocClient().send(new PutCommand({
    TableName: TABLE.CONFIG,
    Item: { configKey: CONFIG_KEY, secret },
  }))
}

export async function deleteTotpSecret(): Promise<void> {
  if (!isDbConfigured()) return
  await getDocClient().send(new DeleteCommand({
    TableName: TABLE.CONFIG,
    Key: { configKey: CONFIG_KEY },
  }))
}

// TOTP リプレイ防止: 直近で受理した time step を記録/参照する。
// 同一コードの再利用（フィッシング/MITM での即時リプレイ）を弾くため、
// 受理時の timeStep 以下のコードは以後拒否する。
export async function getLastUsedTotpStep(): Promise<number | null> {
  if (!isDbConfigured()) return null
  try {
    const res = await getDocClient().send(new GetCommand({
      TableName: TABLE.CONFIG,
      Key: { configKey: LAST_STEP_KEY },
    }))
    const step = res.Item?.step
    return typeof step === 'number' ? step : null
  } catch {
    return null
  }
}

export async function setLastUsedTotpStep(step: number): Promise<void> {
  if (!isDbConfigured()) return
  try {
    await getDocClient().send(new PutCommand({
      TableName: TABLE.CONFIG,
      Item: { configKey: LAST_STEP_KEY, step },
    }))
  } catch {
    // best-effort
  }
}
