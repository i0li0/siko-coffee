import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

export async function GET() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: 'siko-coffee-products',
    }),
  );

  return NextResponse.json(result.Items ?? []);
}
