import { NextRequest, NextResponse } from 'next/server'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth'
import { getDocClient, TABLE } from '@/lib/db'
import { checkGeneralRateLimit, getClientIp } from '@/lib/rateLimit'
import { roasterApplySchema } from '@/lib/validation'
import type { RoasterRecord } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// POST /api/roaster/apply — 焙煎者昇格を申請（§6.1.1 / §13.2）
// buyer（ログイン必須）→ roasters に status="pending" で作成。admin 承認で active に上がる。
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = await checkGeneralRateLimit(ip, { prefix: 'roaster-apply', maxAttempts: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = roasterApplySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { displayName, licenseType, licenseNo, licenseExpiry, invoiceRegNo, termsVersion, optIns } = parsed.data
  const now = new Date().toISOString()

  const item: RoasterRecord = {
    roasterId: userId,
    displayName,
    status: 'pending',
    licenseType,
    licenseNo,
    ...(licenseExpiry ? { licenseExpiry } : {}),
    ...(invoiceRegNo ? { invoiceRegNo } : {}),
    termsVersion,
    termsAgreedAt: now,
    optIns,
    createdAt: now,
    updatedAt: now,
    // 許可（permit）のみ GSI license-expiry に載せる（sparse・§11.6）
    ...(licenseType === 'permit' ? { licenseGsiPk: 'LICENSE' as const } : {}),
  }

  try {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE.ROASTERS,
        Item: item,
        // 既存レコード（申請済み/承認済み）を上書きしない
        ConditionExpression: 'attribute_not_exists(roasterId)',
      }),
    )
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Already applied or already a roaster' }, { status: 409 })
    }
    Sentry.captureException(err, { tags: { route: 'roaster/apply' } })
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }

  return NextResponse.json({ roaster: item }, { status: 201 })
}
