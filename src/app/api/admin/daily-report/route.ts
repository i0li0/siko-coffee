import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { DRINK_UNIT_PRICE, BEAN_PRICE_PER_100G } from '@/lib/constants'
import { randomUUID } from 'crypto'

export const preferredRegion = ['hnd1']

// GET /api/admin/daily-report?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const date = request.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  try {
    const db = getDocClient()
    const [salesRes, expensesRes] = await Promise.all([
      db.send(new QueryCommand({
        TableName: TABLE.SALES,
        KeyConditionExpression: '#date = :date',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':date': date },
      })),
      db.send(new QueryCommand({
        TableName: TABLE.EXPENSES,
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
    const db = getDocClient()
    const puts: Promise<unknown>[] = []

    if (Number(drinkCount) > 0) {
      puts.push(db.send(new PutCommand({
        TableName: TABLE.SALES,
        Item: {
          date,
          id: randomUUID(),
          type: 'drink',
          quantity: Number(drinkCount),
          amount: Number(drinkCount) * DRINK_UNIT_PRICE,
          customers: Number(customers) || 0,
          ...(memo && { memo }),
          createdAt: now,
        },
      })))
    }

    if (Number(beanGrams) > 0) {
      puts.push(db.send(new PutCommand({
        TableName: TABLE.SALES,
        Item: {
          date,
          id: randomUUID(),
          type: 'beans',
          quantity: Number(beanGrams),
          amount: Math.round((Number(beanGrams) / 100) * BEAN_PRICE_PER_100G),
          createdAt: now,
        },
      })))
    }

    if (Number(suppliesCost) > 0) {
      puts.push(db.send(new PutCommand({
        TableName: TABLE.EXPENSES,
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
