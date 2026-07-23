import { NextRequest, NextResponse } from 'next/server'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import * as Sentry from '@sentry/nextjs'
import { getDocClient, TABLE } from '@/lib/db'
import { requireRoaster } from '@/lib/roasterAuth'
import { lotUpdateSchema } from '@/lib/validation'
import { addRoasterMetrics } from '@/lib/roasterMetrics'
import type { LotRecord } from '@/types/platform'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// PATCH /api/roaster/lots/[beanId]/[roastDate] — 在庫調整・値引き/廃棄マーク（§7 / §11.2④）
//
// 同時実行の扱い（§9）: このロットの reservedG は決済フロー（TransactWriteItems）が並行して
// 動かす。read-modify-write を素で書くと確保ぶんを踏み潰すため、**読んだ値を条件にした
// 条件付き更新（CAS）**にして、間に割り込みがあれば 409 で弾く（クライアントは再試行）。
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ beanId: string; roastDate: string }> },
) {
  const authed = await requireRoaster()
  if (!authed.ok) return authed.response

  const { beanId, roastDate } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = lotUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { receivedG, wasteG, onHandG, parRankG, freshBy, status } = parsed.data
  const roasterId = authed.roaster.roasterId
  const db = getDocClient()

  try {
    const current = await db.send(
      new GetCommand({ TableName: TABLE.LOTS, Key: { beanId, roastDate } }),
    )
    const lot = current.Item as LotRecord | undefined
    // 未存在・他人のロットは同じ 404（存在を漏らさない）
    if (!lot || lot.roasterId !== roasterId) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 })
    }

    // 数量の遷移を先に計算（receivedG / wasteG / onHandG は排他・lotUpdateSchema で保証）
    let nextOnHandG = lot.onHandG
    if (receivedG !== undefined) nextOnHandG = lot.onHandG + receivedG
    else if (wasteG !== undefined) nextOnHandG = lot.onHandG - wasteG
    else if (onHandG !== undefined) nextOnHandG = onHandG

    if (nextOnHandG < 0) {
      return NextResponse.json({ error: '在庫が不足しています' }, { status: 400 })
    }
    if (nextOnHandG < lot.reservedG) {
      return NextResponse.json(
        { error: `確保済み ${lot.reservedG}g を下回る在庫にはできません` },
        { status: 409 },
      )
    }

    const names: Record<string, string> = {}
    const values: Record<string, string | number> = {}
    const sets: string[] = []
    const set = (attr: string, value: string | number) => {
      names[`#${attr}`] = attr
      values[`:${attr}`] = value
      sets.push(`#${attr} = :${attr}`)
    }

    if (nextOnHandG !== lot.onHandG) {
      set('onHandG', nextOnHandG)
      set('availableG', nextOnHandG - lot.reservedG) // 派生値を維持（§11.2④ の注記）
    }
    if (receivedG !== undefined) set('purchasedG', lot.purchasedG + receivedG)
    if (wasteG !== undefined) set('wastedG', lot.wastedG + wasteG)
    if (parRankG !== undefined) set('parRankG', parRankG)
    if (status !== undefined) set('status', status)
    if (freshBy !== undefined) {
      set('freshBy', freshBy)
      set('gsiSk', freshBy) // GSI by-freshBy のソートキーを追従させる
    }
    set('updatedAt', new Date().toISOString())

    const result = await db.send(
      new UpdateCommand({
        TableName: TABLE.LOTS,
        Key: { beanId, roastDate },
        UpdateExpression: `SET ${sets.join(', ')}`,
        // CAS: 読んだときの数量から動いていないことを条件にする（＋所有者保証）
        ConditionExpression: '#cOnHandG = :cOnHandG AND #cReservedG = :cReservedG AND #cRoasterId = :cRoasterId',
        ExpressionAttributeNames: {
          ...names,
          '#cOnHandG': 'onHandG',
          '#cReservedG': 'reservedG',
          '#cRoasterId': 'roasterId',
        },
        ExpressionAttributeValues: {
          ...values,
          ':cOnHandG': lot.onHandG,
          ':cReservedG': lot.reservedG,
          ':cRoasterId': roasterId,
        },
        ReturnValues: 'ALL_NEW',
      }),
    )

    // 廃棄/追加入荷は実廃棄率（wasted/purchased）の材料（§11.2⑦）。更新成功後にだけ積む。
    if (wasteG !== undefined) await addRoasterMetrics(roasterId, { wastedG: wasteG })
    else if (receivedG !== undefined) await addRoasterMetrics(roasterId, { purchasedG: receivedG })

    return NextResponse.json(result.Attributes as LotRecord)
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json(
        { error: '在庫が同時に更新されました。読み直して再試行してください' },
        { status: 409 },
      )
    }
    Sentry.captureException(err, { tags: { route: 'roaster/lots/[beanId]/[roastDate]', method: 'PATCH' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
