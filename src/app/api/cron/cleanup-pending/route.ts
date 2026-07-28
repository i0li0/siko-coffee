import { ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { getDocClient, TABLE } from '@/lib/db';
import { verifyBearer } from '@/lib/safeCompare';
import { cronStart, cronDone, cronFail } from '@/lib/cronLog';

export const preferredRegion = ['hnd1'];

const ROUTE = 'cron/cleanup-pending';

// 24時間以上前の pending（決済未完了）注文を掃除するバックストップ。
// 通常は checkout.session.expired webhook が削除するが、取りこぼし対策として日次実行する。
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = cronStart(ROUTE);
  const db = getDocClient();
  const cutoff = Date.now() - MAX_AGE_MS;
  let deleted = 0;
  let skipped = 0;

  try {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.ORDERS,
      FilterExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending' },
    }));

    const stale = (result.Items ?? []).filter((o) => {
      const created = o.createdAt ? new Date(o.createdAt as string).getTime() : 0;
      return created > 0 && created < cutoff;
    });

    for (const o of stale) {
      try {
        await db.send(new DeleteCommand({
          TableName: TABLE.ORDERS,
          Key: { id: o.id as string },
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':pending': 'pending' },
        }));
        deleted++;
      } catch (err) {
        // 条件不一致（paid 等に更新済み）はスキップ＝正常。それ以外（スロットリング・
        // 権限不足など）まで黙って捨てると「毎回 deleted:0」の理由が分からなくなる。
        if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
          skipped++;
        } else {
          cronFail(ROUTE, startedAt, err, { orderId: o.id, phase: 'delete' });
        }
      }
    }
  } catch (err) {
    cronFail(ROUTE, startedAt, err, { phase: 'scan' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  cronDone(ROUTE, startedAt, { deleted, skipped });
  return NextResponse.json({ deleted });
}
