import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'

export const preferredRegion = ['hnd1']

const client = new DynamoDBClient({ region: 'ap-northeast-1' })
const docClient = DynamoDBDocumentClient.from(client)

// GET /api/admin/daily-report?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const date = request.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  try {
    const [salesRes, expensesRes] = await Promise.all([
      docClient.send(new QueryCommand({
        TableName: 'siko-coffee-sales',
        KeyConditionExpression: '#date = :date',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':date': date },
      })),
      docClient.send(new QueryCommand({
        TableName: 'siko-coffee-expenses',
        KeyConditionExpression: 'yearMonth = :ym',
        FilterExpression: '#date = :date',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':ym': date.slice(0, 7), ':date': date },
      })),
    ])
    return NextResponse.json({ sales: salesRes.Items ?? [], expenses: expensesRes.Items ?? [] })
  } catch (err) {
    console.error('DailyReport GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/daily-report
// 1リクエストでdrink売上・豆売上・消耗品費を一括保存
export async function POST(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const body = await request.json()
    const { date, drinkCount, beanGrams, customers, suppliesCost, memo } = body

    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

    const now = new Date().toISOString()
    const yearMonth = date.slice(0, 7)
    const puts: Promise<unknown>[] = []

    if (Number(drinkCount) > 0) {
      puts.push(docClient.send(new PutCommand({
        TableName: 'siko-coffee-sales',
        Item: {
          date,
          id: randomUUID(),
          type: 'drink',
          quantity: Number(drinkCount),
          amount: Number(drinkCount) * 500,
          customers: Number(customers) || 0,
          ...(memo && { memo }),
          createdAt: now,
        },
      })))
    }

    if (Number(beanGrams) > 0) {
      puts.push(docClient.send(new PutCommand({
        TableName: 'siko-coffee-sales',
        Item: {
          date,
          id: randomUUID(),
          type: 'beans',
          quantity: Number(beanGrams),
          amount: Math.round((Number(beanGrams) / 100) * 1000),
          createdAt: now,
        },
      })))
    }

    if (Number(suppliesCost) > 0) {
      puts.push(docClient.send(new PutCommand({
        TableName: 'siko-coffee-expenses',
        Item: {
          yearMonth,
          id: randomUUID(),
          date,
          category: 'supplies',
          amount: Number(suppliesCost),
          description: '消耗品費（営業日）',
          allocationRate: 1,
          allocatedAmount: Number(suppliesCost),
          createdAt: now,
        },
      })))
    }

    await Promise.all(puts)
    return NextResponse.json({ ok: true, saved: puts.length }, { status: 201 })
  } catch (err) {
    console.error('DailyReport POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
