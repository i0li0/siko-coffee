import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getSessionRoaster } from '@/lib/roasterAuth'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// GET /api/account/roaster — 自分の焙煎者状態（UI 出し分け用・§13.1）
// 未昇格なら { roaster: null }。ログイン必須。
export async function GET() {
  try {
    const ctx = await getSessionRoaster()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ roaster: ctx.roaster })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'account/roaster' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
