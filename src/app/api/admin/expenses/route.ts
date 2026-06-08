import { QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'

export const preferredRegion = ['hnd1']

// GET /api/admin/expenses?yearMonth=YYYY-MM
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const yearMonth = request.nextUrl.searchParams.get('yearMonth')

  if (!yearMonth) {
    return NextResponse.json({ error: 'yearMonth parameter required' }, { status: 400 })
  }

  try {
    const result = await getDocClient().send(new QueryCommand({
      TableName: TABLE.EXPENSES,
      KeyConditionExpression: 'yearMonth = :ym',
      ExpressionAttributeValues: { ':ym': yearMonth },
    }))
    return NextResponse.json(result.Items ?? [])
  } catch (err) {
    console.error('Expenses GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/expenses
export async function POST(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const body = await request.json()
    const { date, category, amount, description, allocationRate } = body

    if (!date || !category || amount === undefined) {
      return NextResponse.json({ error: 'date, category, amount are required' }, { status: 400 })
    }

    const rate = allocationRate ?? 1
    const yearMonth = date.slice(0, 7) // YYYY-MM

    const item = {
      yearMonth,
      id: randomUUID(),
      date,
      category,
      amount: Number(amount),
      description: description ?? '',
      allocationRate: Number(rate),
      allocatedAmount: Math.round(Number(amount) * Number(rate)),
      createdAt: new Date().toISOString(),
    }

    await getDocClient().send(new PutCommand({
      TableName: TABLE.EXPENSES,
      Item: item,
    }))

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('Expenses POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/expenses?yearMonth=YYYY-MM&id=UUID
export async function DELETE(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { searchParams } = request.nextUrl
  const yearMonth = searchParams.get('yearMonth')
  const id = searchParams.get('id')

  if (!yearMonth || !id) {
    return NextResponse.json({ error: 'yearMonth and id are required' }, { status: 400 })
  }

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE.EXPENSES,
      Key: { yearMonth, id },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Expenses DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
