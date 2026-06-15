import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { getDocClient, TABLE } from '@/lib/db';
import { verifyBearer } from '@/lib/safeCompare';

export const preferredRegion = ['hnd1'];

const TOKEN_KEY = 'INSTAGRAM_ACCESS_TOKEN';

export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDocClient();

  // 現在のトークンを DynamoDB → env var の順で取得
  let currentToken: string | undefined;
  try {
    const result = await db.send(
      new GetCommand({ TableName: TABLE.CONFIG, Key: { configKey: TOKEN_KEY } }),
    );
    currentToken = result.Item?.value as string | undefined;
  } catch {
    // テーブルが未作成 or 項目なし → env var にフォールバック
  }
  if (!currentToken) currentToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!currentToken) {
    return NextResponse.json({ error: 'No Instagram token found' }, { status: 500 });
  }

  // Instagram Graph API でトークンをリフレッシュ
  const refreshUrl =
    `https://graph.instagram.com/refresh_access_token` +
    `?grant_type=ig_refresh_token&access_token=${currentToken}`;

  const res = await fetch(refreshUrl);
  if (!res.ok) {
    const detail = await res.text();
    console.error('Instagram refresh failed:', res.status, detail);
    return NextResponse.json({ error: 'Refresh failed', detail }, { status: 502 });
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  const { access_token: newToken, expires_in: expiresIn } = data;

  // 新しいトークンを DynamoDB に保存
  const refreshedAt = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: TABLE.CONFIG,
      Item: { configKey: TOKEN_KEY, value: newToken, expiresIn, refreshedAt },
    }),
  );

  console.log(`Instagram token refreshed. Expires in ${expiresIn}s (~${Math.floor(expiresIn / 86400)} days)`);
  return NextResponse.json({ success: true, expiresIn, refreshedAt });
}
