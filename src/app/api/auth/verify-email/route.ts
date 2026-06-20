import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from '@/lib/db'
import { consumeVerificationToken } from '@/lib/verification-token'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'トークンが必要です' }, { status: 400 })
  }

  const email = await consumeVerificationToken(token)
  if (!email) {
    return NextResponse.json({ error: 'トークンが無効または期限切れです' }, { status: 400 })
  }

  const userResult = await client.send(
    new QueryCommand({
      TableName: TABLE.AUTH,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${email}`,
        ':sk': `USER#${email}`,
      },
      Limit: 1,
    })
  )

  const user = userResult.Items?.[0]
  if (!user) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  }

  await client.send(
    new UpdateCommand({
      TableName: TABLE.AUTH,
      Key: { pk: user.pk, sk: user.sk },
      UpdateExpression: 'SET emailVerified = :now',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
    })
  )

  return NextResponse.redirect(new URL('/verify-email?status=success', request.url))
}
