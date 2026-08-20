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
//    cronLog.ts を import しないのは、あれが `@sentry/nextjs` を引き込む Next 側のコードだから。
// 🔴 **【2026-08-20 に方針を1つ緩めた】** ここには元々「node 組み込み以外に依存しない」と
//    書いてあったが、**禁止の理由は「Next 側のコードを引き込まない」ことであって
//    「依存を持たない」ことではなかった**（教訓55: 禁止も理由を失うと腐る）。
//    C-6 の対処で `@aws-sdk/client-cloudfront` が要るため、方針を実際の理由に沿って
//    **「Next 側（`src/app` / `src/lib` の Next 依存コード）を import しない」**に書き直す。
//    AWS SDK は Lambda ランタイムと同じ層の依存なので、この禁止の射程には入らない。
//
// 🔑 **なぜ CloudFront の無効化まで、専用の関数を作らずここでやるのか（C-6）**
// ① **新しい Lambda を作れば新しいアラームが要る**。そして**新規アラームは必ず1回
//    `INSUFFICIENT_DATA → OK` の遷移を作る**＝ S-3（アラーム遷移ゼロが7日連続）の
//    観測面をわざわざ増やすことになる。ここに相乗りすれば `cron-relay-errors` が
//    そのまま効く。
// ② `retries: 2` とログ形式（`[cron] relay …`）をそのまま継承できる。
// ③ 「4本のスケジュールが1つの中継関数を共有する」という**この関数の元々の設計思想**
//    そのままで、増えるのは event の 1 フィールドだけ。
// 📌 **循環参照を避けるためでもある。** distribution の ID は `sst.aws.Nextjs` が
//    作り終えて初めて確定するので、**Web の Lambda 自身の環境変数には入れられない**
//    （自分自身を参照することになる）。この関数は web の後に作られるので渡せる。
// ⚠️ したがって**この関数自身の失敗は Sentry に出ない**。CloudWatch の Errors メトリクスに
//    アラームを張ること（Pour Over 10 の対象に含める）。

import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';

import { signRequest } from './sigv4';

/** 中継してよいパスの許可リスト。**イベントの中身をそのまま URL にしない**ための封じ込め。 */
const ALLOWED_PATHS = [
  '/api/cron/instagram-refresh',
  '/api/cron/cleanup-pending',
  '/api/cron/release-reservations',
  '/api/cron/po-timeouts',
] as const;

/**
 * CloudFront から消してよいパスの許可リスト（C-6）。
 * 🔴 **`/*` を入れてはいけない。** 月1,000パスの無料枠を一気に食う上、
 *    静的アセットまで落として無用なオリジン負荷を作る。**HTML だけを狙う。**
 */
const ALLOWED_INVALIDATION_PATHS = ['/'] as const;

// server Lambda の timeout（30秒）より少しだけ長く待つ。ここが先に切れると
// 「アプリが遅い」のか「中継が諦めた」のかが分からなくなる。
const REQUEST_TIMEOUT_MS = 35_000;

const PREFIX = '[cron] relay';

export interface CronRelayEvent {
  /** 中継先の cron ルート。 */
  path?: string;
  /**
   * CloudFront から削除するパス（C-6）。`path` とは排他ではなく、両方指定してもよい。
   * 指定した場合は**無効化を先に実行する**（オリジンを温めてから配り直す順序）。
   */
  invalidatePaths?: readonly string[];
}

export interface CronRelayResult {
  /** 中継した cron ルートの HTTP ステータス（`path` を指定したときだけ）。 */
  status?: number;
  /** 作成した無効化の ID（`invalidatePaths` を指定したときだけ）。 */
  invalidationId?: string;
}

export async function handler(event: CronRelayEvent): Promise<CronRelayResult> {
  const path = event?.path;
  const invalidatePaths = event?.invalidatePaths ?? [];

  // スケジュール定義のミスは黙って成功させない（＝「動いているのに何もしない」を作らない）。
  if (!path && invalidatePaths.length === 0) {
    throw new Error(
      `${PREFIX} event has neither path nor invalidatePaths: ${JSON.stringify(event)}`,
    );
  }

  const result: CronRelayResult = {};
  if (invalidatePaths.length > 0) {
    result.invalidationId = await invalidate(invalidatePaths);
  }
  if (!path) return result;

  if (!ALLOWED_PATHS.includes(path as (typeof ALLOWED_PATHS)[number])) {
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
  result.status = res.status;
  return result;
}

/**
 * CloudFront のエッジキャッシュから HTML を落とす（C-6）。
 *
 * 🔴 **なぜ要るのか。** OpenNext は ISR の応答に
 * `s-maxage=2, stale-while-revalidate=2592000` を**ハードコードで**付ける
 * （`@opennextjs/aws` の `core/routing/util.js`）。CloudFront は SWR を尊重するので、
 * **アクセスの少ないエッジは最大30日前の HTML を配り続ける**。
 * トップの Instagram セクションが持つ署名付き画像URLの寿命は**約5日**しかないため、
 * 陳腐化が5日を超えたエッジでは `/_next/image` が upstream 403 を受けて **500 を返す**
 * （2026-08-20 に本番で発報）。
 *
 * 🔑 **なぜ「定期的に消す」で直るのか。** SWR は `next.config.ts` からも `revalidate` からも
 * 変えられず、ヘッダを書き換えるには origin-response の Lambda@Edge が要る
 * ＝ **C-7（Lambda@Edge の同時実行枯渇）を自分で増やす**ことになる。
 * 無効化なら**全エッジのコピーを消せる**ので、陳腐化の上限を cron の間隔で押さえられる。
 * 6時間間隔 ≪ 署名の寿命5日。
 *
 * 📌 **ISR 側の再検証は要らない。** ISR の実体は S3 で全エッジ共有、しかも日次で
 * トラフィックがある限り 1時間の `revalidate` で背景更新される。腐るのはエッジのコピーだけ。
 * 📌 無効化は**月1,000パスまで無料**。1日4回 × 1パス ＝ 月120で収まる。
 */
async function invalidate(paths: readonly string[]): Promise<string> {
  const unknown = paths.filter(
    (p) => !ALLOWED_INVALIDATION_PATHS.includes(p as (typeof ALLOWED_INVALIDATION_PATHS)[number]),
  );
  if (unknown.length > 0) {
    throw new Error(`${PREFIX} unknown invalidation path: ${JSON.stringify(unknown)}`);
  }

  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!distributionId) {
    throw new Error(`${PREFIX} missing environment variables: CLOUDFRONT_DISTRIBUTION_ID`);
  }

  const startedAt = Date.now();
  console.log(`${PREFIX} invalidate start distribution=${distributionId} paths=${paths.join(',')}`);

  const client = new CloudFrontClient({});
  const res = await client.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        // CloudFront が重複要求を弾くための一意キー。再試行で二重に作らないよう
        // 「同じ分」なら同じ参照になる粒度にしてある（Scheduler の retries: 2 対策）。
        CallerReference: `cron-invalidate-${Math.floor(Date.now() / 60_000)}`,
        Paths: { Quantity: paths.length, Items: [...paths] },
      },
    }),
  );

  const id = res.Invalidation?.Id;
  // 🔴 ID が返らないのは異常。成功として扱うと「動いているのに何もしていない」になる。
  if (!id) {
    throw new Error(`${PREFIX} invalidate returned no invalidation id`);
  }
  console.log(
    `${PREFIX} invalidate done ${Date.now() - startedAt}ms id=${id} status=${res.Invalidation?.Status}`,
  );
  return id;
}
