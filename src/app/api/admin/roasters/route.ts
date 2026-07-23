import { NextRequest, NextResponse } from 'next/server'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import type { RoasterRecord, RoasterStatus } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

const VALID_STATUSES: RoasterStatus[] = ['pending', 'active', 'paused', 'withdrawn', 'selling_out']

// GET /api/admin/roasters?status=pending — ステータス別一覧（GSI by-status・Scan回避）
// 既定は承認待ち（pending）＝承認キュー。updatedAt 降順。
export async function GET(req: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const statusParam = (req.nextUrl.searchParams.get('status') ?? 'pending') as RoasterStatus
  if (!VALID_STATUSES.includes(statusParam)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    const result = await getDocClient().send(
      new QueryCommand({
        TableName: TABLE.ROASTERS,
        IndexName: 'by-status',
        KeyConditionExpression: '#s = :s',
        ExpressionAttributeNames: { '#s': 'status' }, // status は予約語
        ExpressionAttributeValues: { ':s': statusParam },
        ScanIndexForward: false, // updatedAt 降順
      }),
    )
    return NextResponse.json((result.Items ?? []) as RoasterRecord[])
  } catch (err) {
    console.error('Admin roasters GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
