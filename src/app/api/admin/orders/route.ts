import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import type { OrderRecord } from '@/types/admin'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// GET /api/admin/orders?status=paid
// 決済済みの注文を新しい順で返す（pending = 未決済の事前保存は除外）。
export async function GET(request: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const status = request.nextUrl.searchParams.get('status')

  try {
    const result = await getDocClient().send(new ScanCommand({
      TableName: TABLE.ORDERS,
    }))

    let orders = (result.Items ?? []) as OrderRecord[]

    // 未決済の事前保存は管理対象外
    orders = orders.filter((o) => o.status && o.status !== 'pending')

    if (status) {
      orders = orders.filter((o) => o.status === status)
    }

    orders.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    return NextResponse.json(orders)
  } catch (err) {
    console.error('Orders GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
