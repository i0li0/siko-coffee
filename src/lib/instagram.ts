import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

export interface InstagramPost {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
}

const FIELDS = 'id,media_type,media_url,thumbnail_url,permalink';
const LIMIT = 8;

async function getToken(): Promise<string | undefined> {
  try {
    const client = new DynamoDBClient({ region: 'ap-northeast-1' });
    const docClient = DynamoDBDocumentClient.from(client);
    const result = await docClient.send(
      new GetCommand({
        TableName: 'siko-coffee-config',
        Key: { configKey: 'INSTAGRAM_ACCESS_TOKEN' },
      }),
    );
    if (result.Item?.value) return result.Item.value as string;
  } catch {
    // fallback to env var
  }
  return process.env.INSTAGRAM_ACCESS_TOKEN;
}

export async function fetchInstagramPosts(): Promise<InstagramPost[]> {
  const token = await getToken();
  if (!token) return [];

  try {
    const url =
      `https://graph.instagram.com/me/media` +
      `?fields=${FIELDS}&limit=${LIMIT}&access_token=${token}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}
