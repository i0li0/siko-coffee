import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { requireRoaster } from '@/lib/roasterAuth'
import { beanUpdateSchema } from '@/lib/validation'
import type { BeanRecord } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// PATCH /api/roaster/beans/[beanId] — 価格/週上限/リードタイム/ON-OFF 等の部分更新（§6.1.2）
// 所有者（roasterId 一致）のみ。read-modify-write ＋ ConditionExpression でオーナー保証。
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ beanId: string }> },
) {
  const authed = await requireRoaster()
  if (!authed.ok) return authed.response

  const { beanId } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = beanUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const db = getDocClient()

  try {
    const current = await db.send(new GetCommand({ TableName: TABLE.BEANS, Key: { beanId } }))
    const bean = current.Item as BeanRecord | undefined
    // 未存在・他人の豆は同じ 404（存在を漏らさない）
    if (!bean || bean.roasterId !== authed.roaster.roasterId) {
      return NextResponse.json({ error: 'Bean not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const merged: BeanRecord = {
      ...bean,
      ...parsed.data,
      updatedAt: now,
    }
    // 公開カタログキーを orderStatus に応じて付け直す（off=カタログから外す＝sparse・§11.6）
    if (merged.orderStatus === 'off') {
      delete merged.gsiPk
      delete merged.gsiSk
    } else {
      merged.gsiPk = 'BEAN#PUBLIC'
      merged.gsiSk = merged.createdAt
    }

    await db.send(
      new PutCommand({
        TableName: TABLE.BEANS,
        Item: merged,
        ConditionExpression: 'roasterId = :rid', // オーナー保証（競合で所有者が変わっていたら失敗）
        ExpressionAttributeValues: { ':rid': authed.roaster.roasterId },
      }),
    )
    return NextResponse.json(merged)
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Bean not found' }, { status: 404 })
    }
    Sentry.captureException(err, { tags: { route: 'roaster/beans/[beanId]', method: 'PATCH' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
