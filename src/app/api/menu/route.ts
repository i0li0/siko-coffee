import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { getDocClient, isDbConfigured, TABLE } from '@/lib/db';
import type { Product } from '@/types/product';

export const preferredRegion = ['hnd1'];
export const revalidate = 3600;

export async function GET() {
  // DynamoDB 未設定の環境（CI 等）では空メニューとして正常応答する。
  if (!isDbConfigured()) {
    return NextResponse.json([]);
  }
  try {
    const result = await getDocClient().send(
      new ScanCommand({
        TableName: TABLE.PRODUCTS,
        // type は DynamoDB の予約語なので ExpressionAttributeNames でエスケープ
        FilterExpression: '#type = :menu AND isPublic = :true',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: { ':menu': 'menu', ':true': true },
      }),
    );
    const items = (result.Items ?? []) as Product[];
    return NextResponse.json(items.sort((a, b) => a.id.localeCompare(b.id)));
  } catch (err) {
    console.error('Menu DynamoDB error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
