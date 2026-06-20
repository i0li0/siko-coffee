import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/verification-email'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

export async function POST(request: NextRequest) {
  const { email, password, name } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'メールアドレスとパスワードは必須です' }, { status: 400 })
  }

  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上で入力してください' }, { status: 400 })
  }

  const existing = await client.send(
    new QueryCommand({
      TableName: TABLE.AUTH,
      IndexName: 'GSI1',
      KeyConditionExpression: '#pk = :pk AND #sk = :sk',
      ExpressionAttributeNames: { '#pk': 'GSI1PK', '#sk': 'GSI1SK' },
      ExpressionAttributeValues: {
        ':pk': `USER#${email}`,
        ':sk': `USER#${email}`,
      },
      Limit: 1,
    })
  )

  if (existing.Items && existing.Items.length > 0) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 })
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
        email,
        name: name || null,
        hashedPassword,
        emailVerified: null,
        type: 'USER',
        GSI1PK: `USER#${email}`,
        GSI1SK: `USER#${email}`,
        createdAt: new Date().toISOString(),
      },
    })
  )

  sendVerificationEmail(email).catch(() => {})

  return NextResponse.json({ ok: true }, { status: 201 })
}
