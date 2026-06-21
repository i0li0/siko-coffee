import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/verification-email'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { notifySlack } from '@/lib/slackNotify'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const { allowed, retryAfter } = await checkGeneralRateLimit(ip, {
    prefix: 'register',
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!allowed) {
    return NextResponse.json(
      { error: '登録の試行回数が上限に達しました。しばらくしてから再試行してください' },
      { status: 429, headers: { 'Retry-After': String(retryAfter ?? 900) } },
    )
  }

  const { email, password, name } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'メールアドレスとパスワードは必須です' }, { status: 400 })
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400 })
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: 'パスワードは8〜72文字で入力してください' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()

  const existing = await client.send(
    new QueryCommand({
      TableName: TABLE.AUTH,
      IndexName: 'GSI1',
      KeyConditionExpression: '#pk = :pk AND #sk = :sk',
      ExpressionAttributeNames: { '#pk': 'GSI1PK', '#sk': 'GSI1SK' },
      ExpressionAttributeValues: {
        ':pk': `USER#${normalizedEmail}`,
        ':sk': `USER#${normalizedEmail}`,
      },
      Limit: 1,
    })
  )

  if (existing.Items && existing.Items.length > 0) {
    // ユーザー列挙を防ぐため、既存でも同じレスポンスを返す
    sendVerificationEmail(normalizedEmail).catch(() => {})
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  const id = crypto.randomUUID()
  const hashedPassword = await hash(password, 12)

  await client.send(
    new PutCommand({
      TableName: TABLE.AUTH,
      Item: {
        pk: `USER#${id}`,
        sk: `USER#${id}`,
        id,
        email: normalizedEmail,
        name: typeof name === 'string' ? name.slice(0, 100) : null,
        hashedPassword,
        emailVerified: null,
        type: 'USER',
        GSI1PK: `USER#${normalizedEmail}`,
        GSI1SK: `USER#${normalizedEmail}`,
        createdAt: new Date().toISOString(),
      },
    })
  )

  sendVerificationEmail(normalizedEmail).catch(() => {})
  notifySlack(`🆕 新規ユーザー登録: ${normalizedEmail}`)

  return NextResponse.json({ ok: true }, { status: 201 })
}
