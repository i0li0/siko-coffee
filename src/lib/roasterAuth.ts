import { NextResponse } from 'next/server'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { auth } from '@/lib/auth'
import { getDocClient, TABLE } from '@/lib/db'
import type { BeanRecord, RoasterRecord } from '@/types/platform'

// 焙煎者の認可（docs/blend-platform-plan.md §13.1）。
// 設計判断: セッションに role/roaster を焼き込まず「都度 roasters を Get」する。
// → 昇格取消・休止・退会が次のリクエストで即時反映される（roasterId = userId）。

// ログインユーザーの焙煎者レコードを取得（未昇格なら roaster=null）。
export async function getSessionRoaster(): Promise<
  { userId: string; roaster: RoasterRecord | null } | null
> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null

  const res = await getDocClient().send(
    new GetCommand({
      TableName: TABLE.ROASTERS,
      Key: { roasterId: userId },
    }),
  )
  return { userId, roaster: (res.Item as RoasterRecord | undefined) ?? null }
}

type RoasterAuthResult =
  | { ok: true; userId: string; roaster: RoasterRecord }
  | { ok: false; response: NextResponse }

// active な焙煎者のみ通すルートガード。
// 使い方:
//   const authed = await requireRoaster()
//   if (!authed.ok) return authed.response
//   const { roaster } = authed
export async function requireRoaster(): Promise<RoasterAuthResult> {
  const ctx = await getSessionRoaster()
  if (!ctx) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!ctx.roaster || ctx.roaster.status !== 'active') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: active roaster required' }, { status: 403 }),
    }
  }
  return { ok: true, userId: ctx.userId, roaster: ctx.roaster }
}

// 自分が所有する豆を取得。他人の豆・未存在はどちらも null（存在を漏らさず 404 に落とす）。
export async function getOwnedBean(beanId: string, roasterId: string): Promise<BeanRecord | null> {
  const res = await getDocClient().send(
    new GetCommand({ TableName: TABLE.BEANS, Key: { beanId } }),
  )
  const bean = res.Item as BeanRecord | undefined
  return bean && bean.roasterId === roasterId ? bean : null
}
