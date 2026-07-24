import { NextResponse } from 'next/server'
import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import type { BeanRecord, RoasterRecord } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// 公開カタログに出す1件の形（内部指標＝週上限などは出さない）
export interface CatalogBean {
  beanId: string
  name: string
  greenOrigin: string
  roastLevel: BeanRecord['roastLevel']
  pricePer100g: number
  leadTimeDays: number
  roasterId: string
  roasterName: string
}

// GET /api/beans — 公開カタログ（§11.6 / §14.4）
// GSI list-index（gsiPk="BEAN#PUBLIC"）を新着降順で引き、焙煎者が active の豆だけ返す。
// list-index は sparse（orderStatus!=="off" のみ載る）＝"paused" も混じるので on に絞る。
// 焙煎者の状態は forward Get（roasters BatchGet）で解決＝クライアント値は信用しない（§11.4）。
export async function GET() {
  try {
    const db = getDocClient()

    const result = await db.send(
      new QueryCommand({
        TableName: TABLE.BEANS,
        IndexName: 'list-index',
        KeyConditionExpression: 'gsiPk = :pk',
        ExpressionAttributeValues: { ':pk': 'BEAN#PUBLIC' },
        ScanIndexForward: false, // createdAt 降順（新着）
      }),
    )

    // 受注中（on）だけ公開。paused は index に残るが表には出さない。
    const candidates = ((result.Items ?? []) as BeanRecord[]).filter((b) => b.orderStatus === 'on')
    if (candidates.length === 0) return NextResponse.json({ beans: [] })

    // 焙煎者を1回の BatchGet で解決し、active のものだけ通す
    const roasterIds = [...new Set(candidates.map((b) => b.roasterId))]
    const roasterMap = new Map<string, RoasterRecord>()
    // BatchGet は1回100件まで（カタログ規模なら十分だが念のため分割）
    for (let i = 0; i < roasterIds.length; i += 100) {
      const chunk = roasterIds.slice(i, i + 100)
      const res = await db.send(
        new BatchGetCommand({
          RequestItems: { [TABLE.ROASTERS]: { Keys: chunk.map((roasterId) => ({ roasterId })) } },
        }),
      )
      for (const item of (res.Responses?.[TABLE.ROASTERS] ?? []) as RoasterRecord[]) {
        roasterMap.set(item.roasterId, item)
      }
    }

    const beans: CatalogBean[] = candidates
      .filter((b) => roasterMap.get(b.roasterId)?.status === 'active')
      .map((b) => ({
        beanId: b.beanId,
        name: b.name,
        greenOrigin: b.greenOrigin,
        roastLevel: b.roastLevel,
        pricePer100g: b.pricePer100g,
        leadTimeDays: b.leadTimeDays,
        roasterId: b.roasterId,
        roasterName: roasterMap.get(b.roasterId)!.displayName,
      }))

    return NextResponse.json({ beans })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'api/beans' } })
    return NextResponse.json({ beans: [] })
  }
}
