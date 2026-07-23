import { NextResponse } from 'next/server'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyBearer } from '@/lib/safeCompare'
import { applyOrderException, classifyException, listPosByStatus, syncOrderProcurement, transitionPo } from '@/lib/pos'
import type { RoasterRecord } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 48h 無応答の発注を timeout にし、注文を §6.3 の例外（T1/T2/T3）へ昇格させる。
// GSI by-status（"PO#pending" × gsiSk=timeoutAt）を Query するので Scan は使わない。
export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  let timedOut = 0
  let skipped = 0

  try {
    const expired = await listPosByStatus('pending', now)

    for (const po of expired) {
      try {
        const updated = await transitionPo(po.roasterId, po.poKey, ['pending'], 'timeout')
        if (!updated) {
          skipped += 1 // 直前に焙煎者が応答した
          continue
        }
        timedOut += 1

        await syncOrderProcurement(po.orderId, po.beanId, 'timeout')

        const roasterRes = await getDocClient().send(
          new GetCommand({ TableName: TABLE.ROASTERS, Key: { roasterId: po.roasterId } }),
        )
        await applyOrderException(po.orderId, {
          type: classifyException(roasterRes.Item as RoasterRecord | undefined),
          beanId: po.beanId,
          roasterId: po.roasterId,
          reason: 'timeout',
        })
      } catch (err) {
        skipped += 1
        Sentry.captureException(err, {
          tags: { route: 'cron/po-timeouts', orderId: po.orderId, roasterId: po.roasterId },
        })
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'cron/po-timeouts', step: 'query' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ timedOut, skipped })
}
