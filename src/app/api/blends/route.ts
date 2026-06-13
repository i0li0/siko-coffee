import { NextResponse } from 'next/server';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as Sentry from '@sentry/nextjs';
import { getDocClient, TABLE } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const preferredRegion = ['hnd1'];

export async function GET() {
  try {
    const res = await getDocClient().send(new ScanCommand({
      TableName: TABLE.BLENDS,
      FilterExpression: '#pub = :true',
      ExpressionAttributeNames: { '#pub': 'publish' },
      ExpressionAttributeValues: { ':true': true },
      Limit: 20,
    }));

    const blends = (res.Items ?? []).map((item) => ({
      id: item.id as string,
      name: item.name as string,
      ratios: item.ratios as number[],
      by: item.by as string,
      bought: (item.bought as number) ?? 0,
      comment: (item.comment as string | undefined) ?? undefined,
    }));

    return NextResponse.json({ blends });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'api/blends' } });
    return NextResponse.json({ blends: [] });
  }
}
