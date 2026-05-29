import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';

const FIELDS = 'id,media_type,media_url,thumbnail_url,permalink';
const LIMIT = 8;

export const preferredRegion = ['hnd1'];
// 1時間キャッシュ。リフレッシュ後の新トークンは次のキャッシュ更新時から有効になる
export const revalidate = 3600;

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

/** DynamoDB → env var の順でトークンを取得 */
async function getToken(): Promise<string | undefined> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: 'siko-coffee-config',
        Key: { configKey: 'INSTAGRAM_ACCESS_TOKEN' },
      }),
    );
    if (result.Item?.value) return result.Item.value as string;
  } catch {
    // テーブル未作成 or 項目なし → env var にフォールバック
  }
  return process.env.INSTAGRAM_ACCESS_TOKEN;
}

export async function GET() {
  const token = await getToken();
  if (!token) return NextResponse.json([]);

  try {
    const url =
      `https://graph.instagram.com/me/media` +
      `?fields=${FIELDS}&limit=${LIMIT}&access_token=${token}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) {
      console.error('Instagram API error:', res.status, await res.text());
      return NextResponse.json([]);
    }

    const json = await res.json();
    return NextResponse.json(json.data ?? []);
  } catch (err) {
    console.error('Instagram fetch error:', err);
    return NextResponse.json([]);
  }
}
