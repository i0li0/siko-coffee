import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/password-reset-email'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)

  const body = await request.json().catch(() => ({}))
  const rawEmail = typeof body.email === 'string' ? body.email : ''
  if (!EMAIL_RE.test(rawEmail) || rawEmail.length > 254) {
    return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400 })
  }
  const email = rawEmail.toLowerCase().trim()

  const { allowed, retryAfter } = await checkGeneralRateLimit(
    `${ip}:${email}`,
    { prefix: 'forgotPassword', maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  )
  if (!allowed) {
    return NextResponse.json(
      { error: '試行回数が上限に達しました。しばらくしてから再試行してください' },
      { status: 429, headers: { 'Retry-After': String(retryAfter ?? 900) } },
    )
  }

  // ユーザー列挙を防ぐため、存在有無にかかわらず常に同じレスポンスを返す。
  // 実際の送信は既存ユーザーにのみ行う。
  try {
    const res = await client.send(
      new QueryCommand({
        TableName: TABLE.AUTH,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${email}`, ':sk': `USER#${email}` },
        Limit: 1,
      })
    )
    const user = res.Items?.[0]
    // hashedPassword を持つ（＝パスワードログイン可能な）ユーザーにのみ送る。
    if (user?.hashedPassword) {
      await sendPasswordResetEmail(email)
    }
  } catch {
    // 失敗してもレスポンスは変えない（列挙防止・フェイルサイレント）。
  }

  return NextResponse.json({ ok: true })
}
