import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import { adminRoasterUpdateSchema } from '@/lib/validation'
import type { RoasterRecord, RoasterStatus } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 許可するステータス遷移（承認＝pending→active、却下＝pending→withdrawn ほか）
const TRANSITIONS: Record<RoasterStatus, RoasterStatus[]> = {
  pending: ['active', 'withdrawn'],
  active: ['paused', 'withdrawn', 'selling_out'],
  paused: ['active', 'withdrawn', 'selling_out'],
  selling_out: ['withdrawn'],
  withdrawn: [],
}

// PATCH /api/admin/roasters/[roasterId]  body: { status } — 承認/停止/退会（§6.1.1 / §13.2）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roasterId: string }> },
) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const { roasterId } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = adminRoasterUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const next = parsed.data.status

  const db = getDocClient()

  try {
    const current = await db.send(new GetCommand({ TableName: TABLE.ROASTERS, Key: { roasterId } }))
    const roaster = current.Item as RoasterRecord | undefined
    if (!roaster) {
      return NextResponse.json({ error: 'Roaster not found' }, { status: 404 })
    }
    if (roaster.status === next) {
      return NextResponse.json(roaster) // 冪等: 変化なし
    }
    if (!TRANSITIONS[roaster.status].includes(next)) {
      return NextResponse.json(
        { error: `Invalid transition: ${roaster.status} → ${next}` },
        { status: 409 },
      )
    }

    const now = new Date().toISOString()
    const updated = await db.send(
      new UpdateCommand({
        TableName: TABLE.ROASTERS,
        Key: { roasterId },
        UpdateExpression: 'SET #s = :next, updatedAt = :now',
        // 取得〜更新間の競合を防ぐ（現在ステータスが変わっていたら失敗）
        ConditionExpression: '#s = :from',
        ExpressionAttributeNames: { '#s': 'status' }, // status は予約語
        ExpressionAttributeValues: { ':next': next, ':from': roaster.status, ':now': now },
        ReturnValues: 'ALL_NEW',
      }),
    )
    return NextResponse.json(updated.Attributes as RoasterRecord)
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Roaster status changed concurrently, retry' }, { status: 409 })
    }
    Sentry.captureException(err, { tags: { route: 'admin/roasters/[roasterId]' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
