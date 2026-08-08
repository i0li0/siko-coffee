// CSP の `connect-src` の組み立て。
//
// 🔴 **ここを独立したモジュールにしてあるのは、テストするため。**
// `next.config.ts` の中に直接書くと、`withSentryConfig` などの副作用があって
// 単体テストから読めない。`src/lib/stage.ts` と同じ理由・同じ形。
//
// 🔑 **この形の不具合は2回起きている。**
//   1回目: 外部画像を next/image で出すのに `remotePatterns` だけ直して
//          CSP の `img-src` を直さなかった（`feedback-nextimage-csp`）。
//   2回目: Pour Over 4 で保存先を Vercel Blob → S3 に移したとき、
//          `img-src` に `*.cloudfront.net` は足したのに **`connect-src`（送信側）が抜けた**。
//          **表示は通るのでテストでも目視でも気づかず**、2026-08-08 に本番で
//          S-5（アイコンのアップロード）を実際にやって初めて出た。
//          ブラウザは presigned URL への PUT を送信前に止め、UI には
//          「アップロードに失敗しました」としか出ない。
//
// ＝ **保存先を変えたら CSP の「取得側（img-src）」と「送信側（connect-src）」の
//    両方を見る。** 片方だけ直すと、動く経路と動かない経路が混ざって切り分けが遅れる。

// 🔴🔴 **この値は「ビルド時」に決まる。実行時ではない。**
// Next は `next.config.ts` の `headers()` を **ビルド時に評価して
// `.next/routes-manifest.json` に焼き込む**（2026-08-08 に実測。env を外して
// **再ビルド**しないと消えない＝実行時に env を外しても header は変わらなかった）。
//
// ＝ **`AVATAR_UPLOAD_BUCKET` がビルドのプロセスに入っていることが前提**。
// 今は `sst.config.ts` の `environment` に `STAGE` と並んでおり、`buildApp` が
// ビルドの env に流している（C-1 で確認済み）。
// ⚠️ **ここが将来変わると、CSP から S3 のオリジンが黙って消えてアップロードだけ壊れる。**
// 症状は UI の「アップロードに失敗しました」だけで、サーバ側には何も出ない。
// **デプロイ後に本番の CSP ヘッダを実際に引いて確かめること**（下のコマンド）。
//
//   curl -sS -o /dev/null -D - https://www.sikocoffee.com/account \
//     | grep -io 'content-security-policy:.*' | tr ';' '\n' | grep -i connect-src

/** presigned URL は仮想ホスト形式で払い出される。`src/lib/avatarStorage.ts` の REGION と揃える。 */
export const AVATAR_UPLOAD_REGION = 'ap-northeast-1';

/** 常に許可する送信先。ホストが確定しているものはワイルドカードにしない。 */
const STATIC_CONNECT_SRC = [
  "'self'",
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
  // Sentry の ingest。これが無いとブラウザ側の Sentry イベントは CSP で全てブロックされ、
  // **クライアント由来のエラーだけが静かに失われる**（2026-07-27 に本番で実測）。
  // DSN は src/instrumentation-client.ts 固定なのでホストも固定できる。
  'https://o4511541920858112.ingest.us.sentry.io',
] as const;

/**
 * `connect-src` ディレクティブを組み立てる。
 *
 * 🔑 **アップロード先の S3 はワイルドカードにしない。**
 * `img-src` は配信元の CloudFront ドメインがデプロイ出力で確定しないため
 * `*.cloudfront.net` を許しているが、**`connect-src` は「出ていく先」**なので、
 * `*.s3.<region>.amazonaws.com` を許すと**任意の S3 バケットへ送信できてしまう**
 * ＝ 情報を持ち出す経路になる。バケット名はビルド時に `AVATAR_UPLOAD_BUCKET` として
 * 入っている（`sst.config.ts` の `environment` に `STAGE` と並んでいる）ので1ホストに固定する。
 *
 * ⚠️ 未設定なら**足さない**。ローカルや Vercel では `isAvatarStorageConfigured()` が
 * false になりアップロードの導線自体が無い（503）ため、緩める理由が無い。
 */
export function buildConnectSrc(
  env: Record<string, string | undefined> = process.env,
): string {
  const bucket = env.AVATAR_UPLOAD_BUCKET;
  const origins: string[] = [...STATIC_CONNECT_SRC];
  if (bucket) {
    origins.push(`https://${bucket}.s3.${AVATAR_UPLOAD_REGION}.amazonaws.com`);
  }
  return `connect-src ${origins.join(' ')}`;
}
