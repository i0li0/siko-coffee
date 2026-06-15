import { ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getDocClient, TABLE } from '@/lib/db';
import { verifyBearer } from '@/lib/safeCompare';

export const preferredRegion = ['hnd1'];

// 24時間以上前の pending（決済未完了）注文を掃除するバックストップ。
// 通常は checkout.session.expired webhook が削除するが、取りこぼし対策として日次実行する。
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDocClient();
  const cutoff = Date.now() - MAX_AGE_MS;
  let deleted = 0;

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
      } catch {
        // 条件不一致（paid 等に更新済み）はスキップ
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'cron/cleanup-pending' } });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ deleted });
}
