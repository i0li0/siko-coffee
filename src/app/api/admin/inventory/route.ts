import { ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'

export const preferredRegion = ['hnd1']

// GET /api/admin/inventory
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const result = await getDocClient().send(new ScanCommand({
      TableName: TABLE.INVENTORY,
    }))
    return NextResponse.json(result.Items ?? [])
  } catch (err) {
    console.error('Inventory GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/inventory — 新規豆の登録 or 仕入れ記録
// body: { beanId?, name, origin?, purchaseAmount (g), purchasePrice, date }
// beanId が省略された場合は新規登録（UUID生成）
// beanId が指定された場合は既存豆への仕入れ加算
export async function POST(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const body = await request.json()
    const { beanId, name, origin, purchaseAmount, alertThreshold } = body

    if (!name || purchaseAmount === undefined) {
      return NextResponse.json({ error: 'name and purchaseAmount are required' }, { status: 400 })
    }

    const id = beanId ?? randomUUID()

    if (beanId) {
      await getDocClient().send(new UpdateCommand({
        TableName: TABLE.INVENTORY,
        Key: { beanId: id },
        UpdateExpression: 'SET currentStock = currentStock + :amount, updatedAt = :now',
        ExpressionAttributeValues: {
          ':amount': Number(purchaseAmount),
          ':now': new Date().toISOString(),
        },
      }))
      return NextResponse.json({ beanId: id, added: Number(purchaseAmount) })
    }

    const item = {
      beanId: id,
      name,
      origin: origin ?? '',
      currentStock: Number(purchaseAmount),
      alertThreshold: alertThreshold ?? 500,
      updatedAt: new Date().toISOString(),
    }

    await getDocClient().send(new PutCommand({
      TableName: TABLE.INVENTORY,
      Item: item,
    }))

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('Inventory POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/admin/inventory — 在庫量の直接更新（使用量の記録など）
// body: { beanId, currentStock }
export async function PATCH(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const { beanId, currentStock } = await request.json()

    if (!beanId || currentStock === undefined) {
      return NextResponse.json({ error: 'beanId and currentStock are required' }, { status: 400 })
    }

    await getDocClient().send(new UpdateCommand({
      TableName: TABLE.INVENTORY,
      Key: { beanId },
      UpdateExpression: 'SET currentStock = :stock, updatedAt = :now',
      ExpressionAttributeValues: {
        ':stock': Number(currentStock),
        ':now': new Date().toISOString(),
      },
    }))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Inventory PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/inventory?beanId=xxx
export async function DELETE(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const beanId = request.nextUrl.searchParams.get('beanId')

  if (!beanId) {
    return NextResponse.json({ error: 'beanId is required' }, { status: 400 })
  }

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE.INVENTORY,
      Key: { beanId },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Inventory DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
