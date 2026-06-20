import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'

const CONFIG_KEY = 'totp_secret'

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
