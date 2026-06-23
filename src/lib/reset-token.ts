import { randomBytes } from 'crypto'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from './db'

// パスワード再設定トークン。メール確認トークン(verification-token)と同設計だが、
// 用途を分離し、有効期限を短く（1時間）している。
const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

const TOKEN_TTL_SECONDS = 60 * 60 // 1h

export async function createResetToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS

  await client.send(
    new PutCommand({
      TableName: TABLE.AUTH,
      Item: {
        pk: `RESET#${token}`,
        sk: `RESET#${token}`,
        email,
        token,
        expires,
        ttl: expires + 60, // DynamoDB TTL で自動削除（exp は明示チェックする）
        type: 'PASSWORD_RESET_TOKEN',
        GSI1PK: `RESET#${email}`,
        GSI1SK: `RESET#${token}`,
      },
    })
  )

  return token
}

// 取得と同時に削除（単回消費）。期限切れは null。
export async function consumeResetToken(token: string): Promise<string | null> {
  const res = await client.send(
    new DeleteCommand({
      TableName: TABLE.AUTH,
      Key: { pk: `RESET#${token}`, sk: `RESET#${token}` },
      ReturnValues: 'ALL_OLD',
    })
  )
  const item = res.Attributes
  if (!item) return null
  if (typeof item.expires !== 'number' || item.expires < Math.floor(Date.now() / 1000)) return null
  return item.email as string
}

export async function deleteResetTokensForEmail(email: string): Promise<void> {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE.AUTH,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `RESET#${email}` },
    })
  )
  for (const item of result.Items ?? []) {
    await client.send(
      new DeleteCommand({ TableName: TABLE.AUTH, Key: { pk: item.pk, sk: item.sk } })
    )
  }
}
