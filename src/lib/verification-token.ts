import { randomBytes } from 'crypto'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE } from './db'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

const TOKEN_TTL_SECONDS = 24 * 60 * 60 // 24h

export async function createVerificationToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS

  await client.send(
    new PutCommand({
      TableName: TABLE.AUTH,
      Item: {
        pk: `VERIFY#${token}`,
        sk: `VERIFY#${token}`,
        email,
        token,
        expires,
        type: 'VERIFICATION_TOKEN',
        GSI1PK: `VERIFY#${email}`,
        GSI1SK: `VERIFY#${token}`,
      },
    })
  )

  return token
}

export async function consumeVerificationToken(token: string): Promise<string | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE.AUTH,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: {
        ':pk': `VERIFY#${token}`,
        ':sk': `VERIFY#${token}`,
      },
      Limit: 1,
    })
  )

  const item = result.Items?.[0]
  if (!item) return null

  if (item.expires < Math.floor(Date.now() / 1000)) {
    await client.send(
      new DeleteCommand({
        TableName: TABLE.AUTH,
        Key: { pk: `VERIFY#${token}`, sk: `VERIFY#${token}` },
      })
    )
    return null
  }

  await client.send(
    new DeleteCommand({
      TableName: TABLE.AUTH,
      Key: { pk: `VERIFY#${token}`, sk: `VERIFY#${token}` },
    })
  )

  return item.email as string
}

export async function deleteTokensForEmail(email: string): Promise<void> {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE.AUTH,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `VERIFY#${email}` },
    })
  )

  if (result.Items) {
    for (const item of result.Items) {
      await client.send(
        new DeleteCommand({
          TableName: TABLE.AUTH,
          Key: { pk: item.pk, sk: item.sk },
        })
      )
    }
  }
}
