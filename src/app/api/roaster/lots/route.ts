import { NextRequest, NextResponse } from 'next/server'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { getOwnedBean, requireRoaster } from '@/lib/roasterAuth'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { lotCreateSchema } from '@/lib/validation'
import { addRoasterMetrics } from '@/lib/roasterMetrics'
import type { LotRecord } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// GET /api/roaster/lots?beanId=... — その豆のロット一覧（PK Query・焙煎日の新しい順・§11.2④）
export async function GET(req: NextRequest) {
  const authed = await requireRoaster()
  if (!authed.ok) return authed.response

  const beanId = req.nextUrl.searchParams.get('beanId')
  if (!beanId) {
    return NextResponse.json({ error: 'beanId is required' }, { status: 400 })
  }

  try {
    // 所有者チェック（他人の豆のロットは覗けない）
    const bean = await getOwnedBean(beanId, authed.roaster.roasterId)
    if (!bean) return NextResponse.json({ error: 'Bean not found' }, { status: 404 })

    const result = await getDocClient().send(
      new QueryCommand({
        TableName: TABLE.LOTS,
        KeyConditionExpression: 'beanId = :bid',
        ExpressionAttributeValues: { ':bid': beanId },
        ScanIndexForward: false, // roastDate 降順（新しいロットから）
      }),
    )
    return NextResponse.json((result.Items ?? []) as LotRecord[])
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'roaster/lots', method: 'GET' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/roaster/lots — ロット登録（焙煎日 × onHandG・parRankG・freshBy）
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = await checkGeneralRateLimit(ip, { prefix: 'roaster-lots', maxAttempts: 30, windowMs: 60_000 })
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

  const parsed = lotCreateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { beanId, roastDate, onHandG, parRankG, freshBy, status } = parsed.data
  const roasterId = authed.roaster.roasterId

  try {
    const bean = await getOwnedBean(beanId, roasterId)
    if (!bean) return NextResponse.json({ error: 'Bean not found' }, { status: 404 })

    const now = new Date().toISOString()
    const item: LotRecord = {
      beanId,
      roastDate,
      roasterId,
      onHandG,
      reservedG: 0,
      availableG: onHandG, // = onHandG − reservedG を実体で保持（§11.2④ の注記）
      parRankG,
      freshBy,
      status,
      purchasedG: onHandG,
      soldG: 0,
      wastedG: 0,
      createdAt: now,
      updatedAt: now,
      gsiPk: 'LOT',
      gsiSk: freshBy,
    }

    await getDocClient().send(
      new PutCommand({
        TableName: TABLE.LOTS,
        Item: item,
        // 同じ豆×焙煎日の二重登録を防ぐ。追加入荷は PATCH の receivedG で積む。
        ConditionExpression: 'attribute_not_exists(beanId)',
      }),
    )

    // 仕入れ量は実廃棄率（wasted/purchased）の分母（§11.2⑦）
    await addRoasterMetrics(roasterId, { purchasedG: onHandG })

    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json(
        { error: 'このロット（豆×焙煎日）は既に存在します。追加入荷は PATCH の receivedG を使ってください' },
        { status: 409 },
      )
    }
    Sentry.captureException(err, { tags: { route: 'roaster/lots', method: 'POST' } })
    return NextResponse.json({ error: 'Failed to create lot' }, { status: 500 })
  }
}
