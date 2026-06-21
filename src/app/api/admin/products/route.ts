import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'
import { createProductSchema } from '@/lib/validation'
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
export async function POST(request: Request) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const raw = await request.json()
    const parsed = createProductSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    }

    const { recipe, unit, sortOrder, ...rest } = parsed.data
    const item: Product = {
      id: randomUUID(),
      ...rest,
      ...(recipe ? { recipe } : {}),
      ...(unit ? { unit } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
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
