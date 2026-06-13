import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'
import type { Product } from '@/types/product'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// GET /api/admin/products — 全商品（menu 含む）
export async function GET() {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const result = await getDocClient().send(new ScanCommand({
      TableName: TABLE.PRODUCTS,
    }))
    const items = (result.Items ?? []) as Product[]
    items.sort((a, b) => a.id.localeCompare(b.id))
    return NextResponse.json(items)
  } catch (err) {
    console.error('Products GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/products — 新規商品
export async function POST(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const body = await request.json()
    const { name, nameJp, price, description, type, isPublic, canCustomize } = body

    if (!name || price === undefined || !type) {
      return NextResponse.json({ error: 'name, price, type are required' }, { status: 400 })
    }

    const item: Product = {
      id: randomUUID(),
      name: String(name),
      nameJp: nameJp ? String(nameJp) : '',
      price: Number(price),
      description: description ? String(description) : '',
      type: String(type),
      isPublic: Boolean(isPublic),
      canCustomize: Boolean(canCustomize),
    }

    await getDocClient().send(new PutCommand({
      TableName: TABLE.PRODUCTS,
      Item: item,
    }))

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('Products POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
