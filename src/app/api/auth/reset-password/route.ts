import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from '@/lib/db'
import { consumeResetToken } from '@/lib/reset-token'
import { checkPassword } from '@/lib/passwordPolicy'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { clearLoginFailures } from '@/lib/userLoginRateLimit'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const { allowed, retryAfter } = await checkGeneralRateLimit(ip, {
    prefix: 'resetPassword',
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!allowed) {
    return NextResponse.json(
      { error: '試行回数が上限に達しました。しばらくしてから再試行してください' },
      { status: 429, headers: { 'Retry-After': String(retryAfter ?? 900) } },
    )
  }

  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: 'リンクが無効です。再度お試しください' }, { status: 400 })
  }

  // パスワード検証はトークン消費の前に行う（弱いパスワードでトークンを無駄に消費させない）。
  const pw = await checkPassword(password)
  if (!pw.ok) {
    return NextResponse.json({ error: pw.error }, { status: 400 })
  }

  const email = await consumeResetToken(token)
  if (!email) {
    return NextResponse.json({ error: 'リンクの有効期限が切れているか、無効です。再度お試しください' }, { status: 400 })
  }

  const userResult = await client.send(
    new QueryCommand({
      TableName: TABLE.AUTH,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: { ':pk': `USER#${email}`, ':sk': `USER#${email}` },
      Limit: 1,
    })
  )
  const user = userResult.Items?.[0]
  if (!user) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 400 })
  }

  const hashedPassword = await hash(password, 12)
  await client.send(
    new UpdateCommand({
      TableName: TABLE.AUTH,
      Key: { pk: user.pk, sk: user.sk },
      // リセットリンクの所有＝メール所有の証明なので emailVerified も確定させる
      // （register 時は null で保存されるため if_not_exists ではなく明示上書き）。
      UpdateExpression: 'SET hashedPassword = :p, emailVerified = :now, updatedAt = :now',
      ExpressionAttributeValues: { ':p': hashedPassword, ':now': new Date().toISOString() },
    })
  )

  // 再設定成功でロックアウトを解除する。
  await clearLoginFailures(ip, email)

  return NextResponse.json({ ok: true })
}
