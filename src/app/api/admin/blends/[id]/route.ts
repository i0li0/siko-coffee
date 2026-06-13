import { UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// PATCH /api/admin/blends/[id]  body: { publish }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { id } = await params

  let publish: boolean
  try {
    const body = await request.json()
    publish = Boolean(body.publish)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const updated = await getDocClient().send(new UpdateCommand({
      TableName: TABLE.BLENDS,
      Key: { id },
      ConditionExpression: 'attribute_exists(id)',
      UpdateExpression: 'SET #pub = :pub',
      ExpressionAttributeNames: { '#pub': 'publish' },
      ExpressionAttributeValues: { ':pub': publish },
      ReturnValues: 'ALL_NEW',
    }))
    return NextResponse.json(updated.Attributes)
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Blend not found' }, { status: 404 })
    }
    console.error('Blend PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/blends/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { id } = await params

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE.BLENDS,
      Key: { id },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Blend DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
