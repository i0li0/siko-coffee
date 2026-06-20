import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'

interface RateLimitConfig {
  /** Prefix for DynamoDB key (e.g. "register", "resendVerify") */
  prefix: string
  /** Max requests allowed in the window */
  maxAttempts: number
  /** Window duration in milliseconds */
  windowMs: number
}

export async function checkGeneralRateLimit(
  identifier: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (!isDbConfigured()) return { allowed: true }

  const key = `rate#${config.prefix}#${identifier}`
  const now = Date.now()

  try {
    const res = await getDocClient().send(
      new GetCommand({ TableName: TABLE.CONFIG, Key: { configKey: key } })
    )
    const item = res.Item as { count: number; windowStart: number } | undefined

    if (item && now - item.windowStart < config.windowMs) {
      if (item.count >= config.maxAttempts) {
        const retryAfter = Math.ceil((item.windowStart + config.windowMs - now) / 1000)
        return { allowed: false, retryAfter }
      }
      await getDocClient().send(
        new PutCommand({
          TableName: TABLE.CONFIG,
          Item: {
            configKey: key,
            count: item.count + 1,
            windowStart: item.windowStart,
            ttl: Math.ceil((item.windowStart + config.windowMs + 60_000) / 1000),
          },
        })
      )
    } else {
      await getDocClient().send(
        new PutCommand({
          TableName: TABLE.CONFIG,
          Item: {
            configKey: key,
            count: 1,
            windowStart: now,
            ttl: Math.ceil((now + config.windowMs + 60_000) / 1000),
          },
        })
      )
    }

    return { allowed: true }
  } catch {
    return { allowed: false, retryAfter: 60 }
  }
}

export function getClientIp(headers: Headers): string {
  return headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}
