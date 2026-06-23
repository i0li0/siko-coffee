import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { auth } from '@/lib/auth'
import { TABLE } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/verification-email'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const session = await auth()

  // ログイン中はセッションのメールへ再送（従来動作）。
  if (session?.user?.email) {
    const { allowed, retryAfter } = await checkGeneralRateLimit(
      `${ip}:${session.user.email}`,
      { prefix: 'resendVerify', maxAttempts: 3, windowMs: 10 * 60 * 1000 },
    )
    if (!allowed) {
      return NextResponse.json(
        { error: '再送の上限に達しました。しばらくしてから再試行してください' },
        { status: 429, headers: { 'Retry-After': String(retryAfter ?? 600) } },
      )
    }

    const sent = await sendVerificationEmail(session.user.email)
    if (!sent) {
      return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // 未ログイン時はメール未確認ユーザーの再送導線（ログインがブロックされた直後など）。
  // ユーザー列挙を防ぐため、存在有無・確認状態にかかわらず常に同じレスポンスを返す。
  const body = await request.json().catch(() => ({}))
  const rawEmail = typeof body.email === 'string' ? body.email : ''
  if (!EMAIL_RE.test(rawEmail) || rawEmail.length > 254) {
    return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400 })
  }
  const email = rawEmail.toLowerCase().trim()

  const { allowed, retryAfter } = await checkGeneralRateLimit(
    `${ip}:${email}`,
    { prefix: 'resendVerifyPublic', maxAttempts: 3, windowMs: 10 * 60 * 1000 },
  )
  if (!allowed) {
    return NextResponse.json(
      { error: '再送の上限に達しました。しばらくしてから再試行してください' },
      { status: 429, headers: { 'Retry-After': String(retryAfter ?? 600) } },
    )
  }

  // 既存かつ未確認のユーザーにのみ実際に送信する（見知らぬ宛先へのメール送出を避ける）。
  // 応答は常に { ok: true } のため列挙はできない。
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
    if (user && !user.emailVerified) {
      await sendVerificationEmail(email)
    }
  } catch {
    // 失敗してもレスポンスは変えない（列挙防止・フェイルサイレント）。
  }

  return NextResponse.json({ ok: true })
}
