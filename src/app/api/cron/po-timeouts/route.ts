import { NextResponse } from 'next/server'
import { verifyBearer } from '@/lib/safeCompare'
import { cronStart, cronDone, cronFail } from '@/lib/cronLog'
import { sweepPoTimeouts } from '@/lib/pos'

const ROUTE = 'cron/po-timeouts'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 48h 無応答の発注を timeout にし、注文を §6.3 の例外（T1/T2/T3）へ昇格させる。
// GSI by-status（"PO#pending" × gsiSk=timeoutAt）を Query するので Scan は使わない。
// ※ Vercel Hobby の cron は日次までのため、これは**バックストップ**。実際の適時性は
//   発注一覧の読み取り時 sweep（roaster/pos・admin/pos）が担う。
export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = cronStart(ROUTE)
  try {
    const result = await sweepPoTimeouts()
    cronDone(ROUTE, startedAt, result)
    return NextResponse.json(result)
  } catch (err) {
    cronFail(ROUTE, startedAt, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
