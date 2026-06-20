import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from '@/lib/db'
import { consumeVerificationToken } from '@/lib/verification-token'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const { allowed } = await checkGeneralRateLimit(ip, {
    prefix: 'verifyEmail',
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!allowed) {
    return NextResponse.redirect(new URL('/verify-email?status=rate-limited', request.url))
  }

  const token = request.nextUrl.searchParams.get('token')
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.redirect(new URL('/verify-email?status=invalid', request.url))
  }

  const email = await consumeVerificationToken(token)
  if (!email) {
    return NextResponse.redirect(new URL('/verify-email?status=expired', request.url))
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
    return NextResponse.redirect(new URL('/verify-email?status=error', request.url))
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
