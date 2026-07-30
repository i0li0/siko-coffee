import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { cronStart, cronDone, cronFail } from '@/lib/cronLog'
import { reconcileLotReservations, sweepExpiredReservations } from '@/lib/reservations'

const ROUTE = 'cron/release-reservations'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 失効した在庫確保（held のまま期限切れ）を戻す（§11.2⑤・§13.4）。
// DynamoDB のネイティブTTLは最大48h遅れるうえ、削除されると reservedG を戻せなくなるため、
// TTL は保険で、戻しはこの経路が担う。GSI by-expire を Query するので Scan は使わない。
// ※ Vercel Hobby の cron は日次までのため、これは**バックストップ**。実際の適時性は
//   チェックアウト時の sweep（在庫が要る瞬間に自己修復）が担う（§14.3）。
export async function GET(req: Request) {
  // Vercel Cron は `Authorization: Bearer`、AWS の中継 Lambda は `x-cron-secret`（Pour Over 8）。
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = cronStart(ROUTE)
  try {
    const released = await sweepExpiredReservations()
    // sweep のあとに照合をかける。sweep は「確保レコードが在ること」が前提なので、
    // TTL に先に消された孤児 reservedG は sweep では直らない（2026-07-27 に本番で発生）。
    const reconciled = await reconcileLotReservations()
    cronDone(ROUTE, startedAt, { released, reconciled })
    return NextResponse.json({ released, reconciled })
  } catch (err) {
    cronFail(ROUTE, startedAt, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
