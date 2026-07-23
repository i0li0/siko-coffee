import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getDocClient, TABLE } from '@/lib/db'
import type { RoasterMetricsRecord } from '@/types/platform'

// 計測ロールアップ（docs/blend-platform-plan.md §11.2⑦）。
// 集計 Scan を避けるため、イベント（仕入れ/廃棄/paid/返金）の都度に原子 ADD で積む。

type MetricDeltas = Partial<
  Pick<RoasterMetricsRecord, 'gmvYen' | 'orderCount' | 'lostCount' | 'purchasedG' | 'soldG' | 'wastedG'>
>

// 月キー（yyyy-mm）は JST 基準。会計・運用の締めが日本時間のため。
export function currentMetricsMonth(now: Date = new Date()): string {
  const jst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).format(now)
  return jst.slice(0, 7) // "2026-07"
}

// 指定月のカウンタを原子加算する。アイテムが無ければ ADD が 0 起点で作る。
export async function addRoasterMetrics(
  roasterId: string,
  deltas: MetricDeltas,
  month: string = currentMetricsMonth(),
): Promise<void> {
  const entries = Object.entries(deltas).filter(([, v]) => typeof v === 'number' && v !== 0)
  if (entries.length === 0) return

  const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
  const values: Record<string, number | string> = { ':updatedAt': new Date().toISOString() }
  const adds = entries.map(([key, value], i) => {
    names[`#m${i}`] = key
    values[`:m${i}`] = value as number
    return `#m${i} :m${i}`
  })

  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE.ROASTER_METRICS,
      Key: { roasterId, month },
      UpdateExpression: `SET #updatedAt = :updatedAt ADD ${adds.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  )
}
