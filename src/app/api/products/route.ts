import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

export async function GET() {
  try {
    const result = await docClient.send(
      new ScanCommand({ TableName: 'siko-coffee-products' }),
    );
    return NextResponse.json(result.Items ?? []);
  } catch (err) {
    console.error('DynamoDB error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
