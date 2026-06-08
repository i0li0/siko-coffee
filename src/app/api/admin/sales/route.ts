import { QueryCommand, ScanCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'

export const preferredRegion = ['hnd1']

// GET /api/admin/sales?date=YYYY-MM-DD  or  ?month=YYYY-MM
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { searchParams } = request.nextUrl
  const date = searchParams.get('date')
  const month = searchParams.get('month')

  try {
    if (date) {
      const result = await getDocClient().send(new QueryCommand({
        TableName: TABLE.SALES,
        KeyConditionExpression: '#date = :date',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':date': date },
      }))
      return NextResponse.json(result.Items ?? [])
    }

    if (month) {
      // パーティションキー（date）は完全一致のみのため Scan + Filter で月集計
      const result = await getDocClient().send(new ScanCommand({
        TableName: TABLE.SALES,
        FilterExpression: 'begins_with(#date, :month)',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':month': month },
      }))
      return NextResponse.json(result.Items ?? [])
    }

    return NextResponse.json({ error: 'date or month parameter required' }, { status: 400 })
  } catch (err) {
    console.error('Sales GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/sales
export async function POST(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const body = await request.json()
    const { date, type, quantity, amount, customers, memo } = body

    if (!date || !type || amount === undefined) {
      return NextResponse.json({ error: 'date, type, amount are required' }, { status: 400 })
    }

    const item = {
      date,
      id: randomUUID(),
      type,
      quantity: quantity ?? 0,
      amount: Number(amount),
      ...(customers !== undefined && { customers: Number(customers) }),
      ...(memo && { memo }),
      createdAt: new Date().toISOString(),
    }

    await getDocClient().send(new PutCommand({
      TableName: TABLE.SALES,
      Item: item,
    }))

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('Sales POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/sales?date=YYYY-MM-DD&id=UUID
export async function DELETE(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { searchParams } = request.nextUrl
  const date = searchParams.get('date')
  const id = searchParams.get('id')

  if (!date || !id) {
    return NextResponse.json({ error: 'date and id are required' }, { status: 400 })
  }

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE.SALES,
      Key: { date, id },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Sales DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
