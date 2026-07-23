import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { verifyBearer } from '@/lib/safeCompare'
import { findExpiredReservations, releaseReservation } from '@/lib/reservations'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 失効した在庫確保（held のまま期限切れ）を戻す（§11.2⑤・§13.4）。
// DynamoDB のネイティブTTLは最大48h遅れるうえ、削除されると reservedG を戻せなくなるため、
// **この cron が主・TTL は保険**。GSI by-expire を Query するので Scan は使わない。
export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let released = 0
  let skipped = 0

  try {
    const expired = await findExpiredReservations()
    for (const r of expired) {
      try {
        if (await releaseReservation(r)) released += 1
        else skipped += 1 // 条件不成立＝既に確定/戻し済み
      } catch (err) {
        skipped += 1
        Sentry.captureException(err, {
          tags: { route: 'cron/release-reservations', orderId: r.orderId, lotKey: r.lotKey },
        })
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'cron/release-reservations', step: 'query' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ released, skipped })
}
