import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { verifyBearer } from '@/lib/safeCompare'
import { sweepExpiredReservations } from '@/lib/reservations'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 失効した在庫確保（held のまま期限切れ）を戻す（§11.2⑤・§13.4）。
// DynamoDB のネイティブTTLは最大48h遅れるうえ、削除されると reservedG を戻せなくなるため、
// TTL は保険で、戻しはこの経路が担う。GSI by-expire を Query するので Scan は使わない。
// ※ Vercel Hobby の cron は日次までのため、これは**バックストップ**。実際の適時性は
//   チェックアウト時の sweep（在庫が要る瞬間に自己修復）が担う（§14.3）。
export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json({ released: await sweepExpiredReservations() })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'cron/release-reservations' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
