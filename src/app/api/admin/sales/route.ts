import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'

export const preferredRegion = ['hnd1']

const client = new DynamoDBClient({ region: 'ap-northeast-1' })
const docClient = DynamoDBDocumentClient.from(client)

// GET /api/admin/sales?date=YYYY-MM-DD  or  ?month=YYYY-MM
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { searchParams } = request.nextUrl
  const date = searchParams.get('date')
  const month = searchParams.get('month')

  try {
    if (date) {
      const result = await docClient.send(new QueryCommand({
        TableName: 'siko-coffee-sales',
        KeyConditionExpression: '#date = :date',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':date': date },
      }))
      return NextResponse.json(result.Items ?? [])
    }

    if (month) {
      // パーティションキー（date）は完全一致のみのため Scan + Filter で月集計
      const result = await docClient.send(new ScanCommand({
        TableName: 'siko-coffee-sales',
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

    await docClient.send(new PutCommand({
      TableName: 'siko-coffee-sales',
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
    await docClient.send(new DeleteCommand({
      TableName: 'siko-coffee-sales',
      Key: { date, id },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Sales DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
