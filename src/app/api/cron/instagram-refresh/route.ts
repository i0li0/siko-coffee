import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { getDocClient, TABLE } from '@/lib/db';
import { verifyBearer } from '@/lib/safeCompare';
import { cronStart, cronDone, cronFail, cronWarn, cronAlert } from '@/lib/cronLog';

export const preferredRegion = ['hnd1'];

const ROUTE = 'cron/instagram-refresh';
const TOKEN_KEY = 'INSTAGRAM_ACCESS_TOKEN';

// 🔴 このルートが静かに止まると Instagram トークンは**恒久失効**する（60日で切れ、
// 復旧には手動の再認証が要る）。だから成功時も「いつ・あと何日」をログに残し、
// 失敗はすべて console と Sentry の両方へ出す。
const EXPIRY_WARN_DAYS = 14;

export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer {CRON_SECRET} を自動付与する
  if (!verifyBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = cronStart(ROUTE);
  // 例外が起きた地点を Sentry から特定できるようにする（fetch なのか保存なのか）。
  let phase: 'token-read' | 'refresh' | 'persist' = 'token-read';

  try {
    const db = getDocClient();

    // 現在のトークンを DynamoDB → env var の順で取得
    let currentToken: string | undefined;
    try {
      const result = await db.send(
        new GetCommand({ TableName: TABLE.CONFIG, Key: { configKey: TOKEN_KEY } }),
      );
      currentToken = result.Item?.value as string | undefined;
    } catch (err) {
      // テーブルが未作成 or 読めない → env var にフォールバックする。ただし
      // 「項目なし」は例外にならないので、ここに来ている時点で異常。
      cronWarn(ROUTE, 'config table read failed; falling back to env var', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!currentToken) currentToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!currentToken) {
      cronAlert(ROUTE, 'no Instagram token found');
      return NextResponse.json({ error: 'No Instagram token found' }, { status: 500 });
    }

    // Instagram Graph API でトークンをリフレッシュ
    phase = 'refresh';
    const refreshUrl =
      `https://graph.instagram.com/refresh_access_token` +
      `?grant_type=ig_refresh_token&access_token=${currentToken}`;

    const res = await fetch(refreshUrl);
    if (!res.ok) {
      const detail = await res.text();
      cronAlert(ROUTE, 'refresh request failed', { status: res.status, detail });
      return NextResponse.json({ error: 'Refresh failed', detail }, { status: 502 });
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    const { access_token: newToken, expires_in: expiresIn } = data;

    // 新しいトークンを DynamoDB に保存
    phase = 'persist';
    const refreshedAt = new Date().toISOString();
    await db.send(
      new PutCommand({
        TableName: TABLE.CONFIG,
        Item: { configKey: TOKEN_KEY, value: newToken, expiresIn, refreshedAt },
      }),
    );

    const expiresInDays = Math.floor(expiresIn / 86400);
    if (expiresInDays < EXPIRY_WARN_DAYS) {
      cronWarn(ROUTE, 'refreshed token expires soon', { expiresIn, expiresInDays });
    }

    cronDone(ROUTE, startedAt, { expiresIn, expiresInDays, refreshedAt });
    return NextResponse.json({ success: true, expiresIn, refreshedAt });
  } catch (err) {
    cronFail(ROUTE, startedAt, err, { phase });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
