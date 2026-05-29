import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import type { Product } from '@/types/product';

export const preferredRegion = ['hnd1'];
export const revalidate = 3600;

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

export async function GET() {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: 'siko-coffee-products',
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
