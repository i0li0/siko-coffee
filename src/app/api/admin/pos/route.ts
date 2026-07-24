import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { verifyAdminToken } from '@/lib/adminAuth'
import { listPosByStatus, sweepPoTimeouts } from '@/lib/pos'
import type { PoStatus } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

const VALID: PoStatus[] = ['auto_approved', 'pending', 'accepted', 'declined', 'timeout']

// GET /api/admin/pos?status=pending — 全焙煎者の発注ダッシュボード（例外の監視・§13.2）。
// GSI by-status を Query（Scan 回避）。既定は要対応の pending。
export async function GET(req: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const status = (req.nextUrl.searchParams.get('status') ?? 'pending') as PoStatus
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // 期限切れの発注を拾って timeout 化してから返す（Hobby の cron は日次までのため・§14.3）
  try {
    await sweepPoTimeouts()
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'admin/pos', step: 'sweep' } })
  }

  try {
    return NextResponse.json({ pos: await listPosByStatus(status) })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'admin/pos', method: 'GET' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
