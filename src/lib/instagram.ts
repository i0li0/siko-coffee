import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient, TABLE } from '@/lib/db';

export interface InstagramPost {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
}

const FIELDS = 'id,media_type,media_url,thumbnail_url,permalink';
const LIMIT = 8;
const TOKEN_KEY = 'INSTAGRAM_ACCESS_TOKEN';

async function getToken(): Promise<string | undefined> {
  try {
    const result = await getDocClient().send(
      new GetCommand({
        TableName: TABLE.CONFIG,
        Key: { configKey: TOKEN_KEY },
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
