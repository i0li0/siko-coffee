import { NextResponse } from 'next/server'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { verifyAdminSession } from '@/lib/adminAuth'
import { getDocClient, TABLE } from '@/lib/db'

export async function GET() {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const doc = getDocClient()
  const items: Record<string, unknown>[] = []
  let lastKey: Record<string, unknown> | undefined

  do {
    const result = await doc.send(
      new ScanCommand({
        TableName: TABLE.AUTH,
        FilterExpression: '#t = :user',
        ExpressionAttributeNames: { '#t': 'type', '#n': 'name' },
        ExpressionAttributeValues: { ':user': 'USER' },
        ProjectionExpression: 'id, email, #n, createdAt, emailVerified',
        ExclusiveStartKey: lastKey,
      })
    )
    if (result.Items) items.push(...result.Items)
    lastKey = result.LastEvaluatedKey
  } while (lastKey)

  items.sort((a, b) =>
    ((b.createdAt as string) ?? '').localeCompare((a.createdAt as string) ?? '')
  )

  return NextResponse.json({
    total: items.length,
    users: items.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      createdAt: u.createdAt ?? null,
      emailVerified: u.emailVerified ?? null,
    })),
  })
}
