import { QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE, isDbConfigured } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { FEEDBACK_GSI, type FeedbackStatus } from '@/lib/feedback'

export const preferredRegion = ['hnd1']

const VALID_STATUS: FeedbackStatus[] = ['new', 'read', 'archived']

// GET /api/admin/feedback?status=new|read|archived
// GSI(list-index) で新着降順 Query。Scan は使わない。
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  if (!isDbConfigured()) return NextResponse.json([])

  const status = request.nextUrl.searchParams.get('status')

  try {
    const result = await getDocClient().send(new QueryCommand({
      TableName: TABLE.FEEDBACK,
      IndexName: FEEDBACK_GSI.NAME,
      KeyConditionExpression: 'gsiPk = :pk',
      ExpressionAttributeValues: {
        ':pk': FEEDBACK_GSI.PK,
        ...(status && VALID_STATUS.includes(status as FeedbackStatus) ? { ':st': status } : {}),
      },
      ...(status && VALID_STATUS.includes(status as FeedbackStatus)
        ? { FilterExpression: '#s = :st', ExpressionAttributeNames: { '#s': 'status' } }
        : {}),
      ScanIndexForward: false, // createdAt 降順（新着が先頭）
    }))
    return NextResponse.json(result.Items ?? [])
  } catch (err) {
    console.error('Feedback GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/admin/feedback  { feedbackId, status }
export async function PATCH(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const { feedbackId, status } = body

  if (!feedbackId || !VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: 'feedbackId と有効な status が必要です' }, { status: 400 })
  }

  try {
    await getDocClient().send(new UpdateCommand({
      TableName: TABLE.FEEDBACK,
      Key: { feedbackId },
      UpdateExpression: 'SET #s = :st',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':st': status },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feedback PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/feedback?feedbackId=UUID
export async function DELETE(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const feedbackId = request.nextUrl.searchParams.get('feedbackId')
  if (!feedbackId) {
    return NextResponse.json({ error: 'feedbackId が必要です' }, { status: 400 })
  }

  try {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE.FEEDBACK,
      Key: { feedbackId },
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Feedback DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
