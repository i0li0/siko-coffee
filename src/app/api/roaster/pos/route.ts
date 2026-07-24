import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireRoaster } from '@/lib/roasterAuth'
import { listPosForRoaster, sweepPoTimeouts } from '@/lib/pos'
import type { PoStatus } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

const VALID: PoStatus[] = ['auto_approved', 'pending', 'accepted', 'declined', 'timeout']

// GET /api/roaster/pos?status=pending — 自分宛の発注一覧（§6.2）。
// pos は roasterId が PK なので PK Query で引ける（orders の Scan は使わない・§11.2⑨）。
export async function GET(req: NextRequest) {
  const authed = await requireRoaster()
  if (!authed.ok) return authed.response

  const statusParam = req.nextUrl.searchParams.get('status')
  if (statusParam && !VALID.includes(statusParam as PoStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // 期限切れの発注をここで拾って timeout 化しておく（Hobby の cron は日次までのため・§14.3）。
  // 失敗しても一覧は返す。
  try {
    await sweepPoTimeouts()
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'roaster/pos', step: 'sweep' } })
  }

  try {
    const pos = await listPosForRoaster(authed.roaster.roasterId, (statusParam as PoStatus) ?? undefined)
    // 要対応（pending）の件数はベル表示に使う（§6.2.1 UX原則）
    return NextResponse.json({ pos, pendingCount: pos.filter((p) => p.poStatus === 'pending').length })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'roaster/pos', method: 'GET' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
