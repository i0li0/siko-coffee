import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { NextRequest, NextResponse } from 'next/server'
import { getDocClient, TABLE } from '@/lib/db'
import { verifyAdminToken } from '@/lib/adminAuth'
import type { SaleItem, ExpenseItem, InventoryItem } from '@/types/admin'

export const dynamic = 'force-dynamic'
export const preferredRegion = ['hnd1']

// GET /api/admin/dashboard?month=YYYY-MM
//
// ダッシュボードに必要なデータを**1リクエストで**返す集約エンドポイント。
//
// **なぜ作ったか（2026-07-27・AWS Phase 1 で実際に壊れた）**: ダッシュボードは
// 「今月の売上/支出/在庫」＋「12ヶ月ぶんの売上/支出」で **27本の fetch を同時発火**していた。
// AWS では Lambda の同時実行数がアカウント既定の 10 しかなく、これを軽く超えて
// スロットル → Function URL が 429 → クライアントが配列でない値を .reduce して
// `TypeError` → error boundary、という形で画面全体が落ちた。
// クォータを上げても、1画面で27回サーバーレス関数を起こす設計は本番でも重いので、
// 呼び出し側ではなくサーバー側でまとめる。
//
// 副次的な改善: 売上は月ごとに12回 Scan していたのを、**年で1回 Scan** して
// メモリ上で月へ振り分ける形にした（Scan 回数 12 → 1）。
export async function GET(req: NextRequest) {
  const denied = await verifyAdminToken()
  if (denied) return denied

  const month = req.nextUrl.searchParams.get('month') ?? ''
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 })
  }
  const year = month.slice(0, 4)
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

  try {
    const db = getDocClient()

    // 売上: PK が date(YYYY-MM-DD) のため月/年での絞り込みは Scan になる。
    // 1MB を超える場合に取りこぼさないようページングする（既存実装は未対応だった）。
    const salesItems: SaleItem[] = []
    let lastKey: Record<string, unknown> | undefined
    do {
      const res = await db.send(
        new ScanCommand({
          TableName: TABLE.SALES,
          FilterExpression: 'begins_with(#date, :year)',
          ExpressionAttributeNames: { '#date': 'date' },
          ExpressionAttributeValues: { ':year': year },
          ExclusiveStartKey: lastKey,
        }),
      )
      salesItems.push(...((res.Items ?? []) as SaleItem[]))
      lastKey = res.LastEvaluatedKey
    } while (lastKey)

    const yearSales: Record<string, SaleItem[]> = Object.fromEntries(months.map((m) => [m, []]))
    for (const s of salesItems) {
      const key = String(s.date).slice(0, 7)
      yearSales[key]?.push(s)
    }

    // 支出: PK が yearMonth なので月ごとの Query。12回だが**同一 Lambda 内の
    // DynamoDB 呼び出し**であり、Lambda の同時実行は消費しない。
    const expenseResults = await Promise.all(
      months.map((m) =>
        db.send(
          new QueryCommand({
            TableName: TABLE.EXPENSES,
            KeyConditionExpression: 'yearMonth = :ym',
            ExpressionAttributeValues: { ':ym': m },
          }),
        ),
      ),
    )
    const yearExpenses: Record<string, ExpenseItem[]> = {}
    months.forEach((m, i) => {
      yearExpenses[m] = (expenseResults[i].Items ?? []) as ExpenseItem[]
    })

    const inventoryRes = await db.send(new ScanCommand({ TableName: TABLE.INVENTORY }))

    return NextResponse.json({
      monthSales: yearSales[month] ?? [],
      monthExpenses: yearExpenses[month] ?? [],
      inventory: (inventoryRes.Items ?? []) as InventoryItem[],
      yearSales,
      yearExpenses,
    })
  } catch (err) {
    // Sentry だけに送ると DSN 未設定の環境（AWS の dev など）で失敗が**完全に消える**。
    // 2026-07-27 の障害調査で実際に遠回りしたので console にも必ず残す。
    console.error('Dashboard GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
