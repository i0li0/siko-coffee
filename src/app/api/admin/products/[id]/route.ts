import { UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// PUT /api/admin/products/[id] — 商品の更新（部分更新）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 更新を許可するフィールドと正規化
  const editable: Record<string, (v: unknown) => unknown> = {
    name: (v) => String(v),
    nameJp: (v) => String(v),
    price: (v) => Number(v),
    description: (v) => String(v),
    type: (v) => String(v),
    isPublic: (v) => Boolean(v),
    canCustomize: (v) => Boolean(v),
    status: (v) => (['active', 'paused', 'discontinued'].includes(String(v)) ? String(v) : 'active'),
    recipe: (v) => String(v),
    unit: (v) => String(v),
    sortOrder: (v) => Number(v),
  }

  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const sets: string[] = []
  let i = 0
  for (const [key, normalize] of Object.entries(editable)) {
    if (key in body) {
      const nk = `#k${i}`
      const vk = `:v${i}`
      names[nk] = key
      values[vk] = normalize(body[key])
      sets.push(`${nk} = ${vk}`)
      i++
    }
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  try {
    const updated = await getDocClient().send(new UpdateCommand({
      TableName: TABLE.PRODUCTS,
      Key: { id },
      ConditionExpression: 'attribute_exists(id)',
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }))
    return NextResponse.json(updated.Attributes)
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    console.error('Product PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/products/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { id } = await params

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE.PRODUCTS,
      Key: { id },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Product DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
