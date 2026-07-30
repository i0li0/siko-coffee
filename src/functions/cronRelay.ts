// cron の中継 Lambda（Pour Over 8）。
//
// EventBridge Scheduler → **この関数** → server Lambda の Function URL（SigV4）→ cron ルート。
//
// 🔑 **なぜ中継が要るのか**
// EventBridge（Scheduler / Rules のいずれも）は任意の HTTPS を **SigV4 では叩けない**
// （Rules の API Destinations が対応する認証は API key / Basic / OAuth のみ）。
// Pour Over 5 で Function URL を `AWS_IAM` にした以上、**署名できる実行主体**が要る。
// それがこの関数で、Lambda 実行ロールの一時資格情報でそのまま署名する。
//
// 🔑 **なぜ CloudFront ではなく Function URL を直接叩くのか**
// CloudFront のオリジン ReadTimeout が **実測 30 秒**しかなく、しかも WAF（Pour Over 6）の
// 評価も挟まる。cron はブラウザ向けの経路に相乗りする理由がないので、CDN を経由しない。
// ⚠️ ただし **server Lambda 側の timeout も 30 秒**なので、実行予算はまだ 30 秒のまま。
//    ここを伸ばすなら `sst.config.ts` の `server.timeout` を上げる（CloudFront 経由の
//    ブラウザ requests は CF 側の 30 秒で切れるため、web の挙動は変わらない）。別作業。
//
// 🔑 **認可は2重**。①Function URL の IAM 認証（この関数のロールでしか叩けない）
// ②`CRON_SECRET`。②は Vercel 時代から cron ルートが持っている検査で、soak 期間は
// Vercel 側の cron も同じ秘密を使い続ける。
//
// ⚠️ **`Authorization` は SigV4 が占有する**ので、秘密は `x-cron-secret` で渡す
// （`src/lib/cronAuth.ts` が両形式を受ける）。このヘッダは**署名対象に含めている**ので、
// 経路上で差し替えられれば署名検証で落ちる。
//
// 📌 ログは `[cron]` 接頭辞を `src/lib/cronLog.ts` と揃えてある。CloudWatch Logs Insights の
//    `filter @message like /^\[cron\]/` で**アプリ側とこの中継を一度に**拾えるようにするため。
//    cronLog.ts を import しないのは、あれが `@sentry/nextjs` を引き込む Next 側のコードで、
//    この関数は node 組み込み以外に依存しない方針だから（sigv4.ts の冒頭に理由）。
// ⚠️ したがって**この関数自身の失敗は Sentry に出ない**。CloudWatch の Errors メトリクスに
//    アラームを張ること（Pour Over 10 の対象に含める）。

import { signRequest } from './sigv4';

/** 中継してよいパスの許可リスト。**イベントの中身をそのまま URL にしない**ための封じ込め。 */
const ALLOWED_PATHS = [
  '/api/cron/instagram-refresh',
  '/api/cron/cleanup-pending',
  '/api/cron/release-reservations',
  '/api/cron/po-timeouts',
] as const;

// server Lambda の timeout（30秒）より少しだけ長く待つ。ここが先に切れると
// 「アプリが遅い」のか「中継が諦めた」のかが分からなくなる。
const REQUEST_TIMEOUT_MS = 35_000;

const PREFIX = '[cron] relay';

export interface CronRelayEvent {
  path?: string;
}

export async function handler(event: CronRelayEvent): Promise<{ status: number }> {
  const path = event?.path;
  if (!path || !ALLOWED_PATHS.includes(path as (typeof ALLOWED_PATHS)[number])) {
    // スケジュール定義のミスは黙って成功させない（＝「動いているのに何もしない」を作らない）。
    throw new Error(`${PREFIX} unknown path in event: ${JSON.stringify(path)}`);
  }

  const targetUrl = process.env.CRON_TARGET_URL;
  const secret = process.env.CRON_SECRET;
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  // 設定漏れは 401/403 として現れると原因が分かりにくいので、ここで名指しで落とす。
  const missing = Object.entries({
    CRON_TARGET_URL: targetUrl,
    CRON_SECRET: secret,
    AWS_REGION: region,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`${PREFIX} missing environment variables: ${missing.join(', ')}`);
  }

  const url = new URL(path, targetUrl).toString();
  const headers = signRequest({
    method: 'GET',
    url,
    headers: { 'x-cron-secret': secret! },
    region: region!,
    service: 'lambda',
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      sessionToken,
    },
  });

  const startedAt = Date.now();
  console.log(`${PREFIX} ${path} start`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${PREFIX} ${path} fail ${Date.now() - startedAt}ms`, err);
    throw err;
  }

  // 本文は cron ルートの件数 JSON（`{"released":0,"reconciled":0}` など）。
  // 秘密は含まれないので、そのまま CloudWatch に残して「0件」の裏を取れるようにする。
  const body = (await res.text()).slice(0, 500);

  // 🔴 **2xx 以外は例外にする。** ここで握り潰すと Scheduler は成功として扱い、
  // 「毎回きちんと呼ばれているのに毎回 401」が無言で続く。
  if (!res.ok) {
    console.error(`${PREFIX} ${path} fail ${Date.now() - startedAt}ms status=${res.status} ${body}`);
    throw new Error(`${PREFIX} ${path} returned ${res.status}: ${body}`);
  }

  console.log(`${PREFIX} ${path} done ${Date.now() - startedAt}ms status=${res.status} ${body}`);
  return { status: res.status };
}
