import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import type { BlendAdminItem } from '@/types/admin'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// GET /api/admin/blends — 全ブレンド（未公開含む）、新しい順
export async function GET() {
  const denied = await verifyAdminToken()
  if (denied) return denied

  try {
    const result = await getDocClient().send(new ScanCommand({
      TableName: TABLE.BLENDS,
    }))

    const blends = (result.Items ?? []).map((item) => ({
      id: item.id as string,
      name: (item.name as string) ?? '',
      ratios: (item.ratios as number[]) ?? [],
      by: (item.by as string) ?? 'Anonymous',
      publish: Boolean(item.publish),
      bought: (item.bought as number) ?? 0,
      comment: (item.comment as string | undefined) ?? undefined,
      createdAt: (item.createdAt as string | undefined) ?? undefined,
    })) as BlendAdminItem[]

    blends.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    return NextResponse.json(blends)
  } catch (err) {
    console.error('Blends GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
