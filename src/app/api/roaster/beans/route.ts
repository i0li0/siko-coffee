import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { requireRoaster } from '@/lib/roasterAuth'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { beanCreateSchema } from '@/lib/validation'
import type { BeanRecord } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 公開カタログ用 GSI list-index のキーを付与（orderStatus!=="off" のときだけ＝sparse・§11.6）
function publicCatalogKeys(orderStatus: BeanRecord['orderStatus'], createdAt: string) {
  return orderStatus === 'off' ? {} : { gsiPk: 'BEAN#PUBLIC' as const, gsiSk: createdAt }
}

// GET /api/roaster/beans — 自分の掲載豆一覧（GSI by-roaster・新着降順・§11.2③）
export async function GET() {
  const authed = await requireRoaster()
  if (!authed.ok) return authed.response

  try {
    const result = await getDocClient().send(
      new QueryCommand({
        TableName: TABLE.BEANS,
        IndexName: 'by-roaster',
        KeyConditionExpression: 'roasterId = :rid',
        ExpressionAttributeValues: { ':rid': authed.roaster.roasterId },
        ScanIndexForward: false, // createdAt 降順
      }),
    )
    return NextResponse.json((result.Items ?? []) as BeanRecord[])
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'roaster/beans', method: 'GET' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/roaster/beans — 掲載豆の追加（§6.2.1 申告5項目）
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = await checkGeneralRateLimit(ip, { prefix: 'roaster-beans', maxAttempts: 20, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const authed = await requireRoaster()
  if (!authed.ok) return authed.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = beanCreateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { orderStatus, ...rest } = parsed.data
  const item: BeanRecord = {
    beanId: randomUUID(),
    roasterId: authed.roaster.roasterId,
    ...rest,
    orderStatus,
    createdAt: now,
    updatedAt: now,
    ...publicCatalogKeys(orderStatus, now),
  }

  try {
    await getDocClient().send(new PutCommand({ TableName: TABLE.BEANS, Item: item }))
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'roaster/beans', method: 'POST' } })
    return NextResponse.json({ error: 'Failed to create bean' }, { status: 500 })
  }

  return NextResponse.json(item, { status: 201 })
}
