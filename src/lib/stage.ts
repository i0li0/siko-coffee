// 実行ステージの判定を1か所に集約する（Pour Over 1: VERCEL_ENV → STAGE）。
//
// AWS では SST が `STAGE`（= `$app.stage`）を注入し、Vercel では `VERCEL_ENV` が入る。
// 切替後の soak 期間（Pour Over 14）は **AWS と Vercel の両方が本番を担う**ため、
// どちらの環境変数でも正しく本番判定できる必要がある。そのため `STAGE` を優先しつつ
// `VERCEL_ENV` にフォールバックする。Vercel 解約（Pour Over 15〜16）の際に
// `VERCEL_ENV` の一行を消せば移行が完了する。
//
// 🔴 **判定はフェイルクローズ**。どちらも未設定なら「本番ではない」と扱う。
// 以前は `src/lib/db.ts` が `VERCEL_ENV === 'preview'` だけを見ており、
// **未設定時に本番テーブルを向く**フェイルオープンだった（AWS には VERCEL_ENV が
// 無いため、暫定で sst.config.ts から 'preview' を注入して凌いでいた）。
//
// 📌 Vercel にカスタム環境は無く `VERCEL_ENV` は production / preview / development の
// 3値しか取らない（2026-07-28 確認）ため、`=== 'production'` の単純判定で過不足ない。
//
// あわせて「Vercel の上で動いているか」（＝ステージではなく**プラットフォーム**の判定）も
// ここに置く。どちらも Vercel 解約（Pour Over 16）でまとめて消える一群だからで、
// 撤去のとき探し回らずに済むようにしている。

/**
 * 実行中のステージ名。未設定なら `undefined`（＝本番ではない）。
 *
 * AWS では SST のステージ名（`production` / `dev` など）、
 * Vercel では `production` / `preview` / `development` が入る。
 */
export function getStage(): string | undefined {
  return process.env.STAGE ?? process.env.VERCEL_ENV;
}

/**
 * 本番ステージかどうか。**未設定は本番ではない**（フェイルクローズ）。
 *
 * 本番データ（DynamoDB の `siko-coffee-*` テーブル）へ触れてよいかの判定は
 * 必ずこれを使う。
 */
export function isProductionStage(): boolean {
  return getStage() === 'production';
}

/**
 * **ブラウザ側**の実行ステージ名。未設定なら `undefined`。
 *
 * 🔴 **`getStage()` はクライアントでは使えない。** Next.js がブラウザ用バンドルへ埋め込むのは
 * `NEXT_PUBLIC_` 接頭辞の付いた値だけで、`STAGE` も `VERCEL_ENV` も**サーバ専用**だからである。
 * クライアントで `getStage()` を呼ぶと **例外は出ず静かに `undefined`** になり、
 * 「ステージ不明」が事故ではなく既定値のように見えてしまう。関数を分けているのはそのため。
 *
 * 値の供給元は `next.config.ts` の `env` で、**ビルド時に `STAGE ?? VERCEL_ENV` を焼き込む**
 * （＝ `getStage()` と同じ式を、実行時ではなくビルド時に評価している）。
 * AWS では SST が build プロセスへ `STAGE` を渡し（`base-ssr-site.ts` の `buildApp` が
 * `environment` を build の env に流し込む）、Vercel ではビルド時に `VERCEL_ENV` が入る。
 *
 * 📌 **Vercel の `NEXT_PUBLIC_VERCEL_ENV` には頼っていない。** あれはシステム環境変数の
 * 自動公開トグルに依存し、`isVercelPlatform()` の `VERCEL` と同じ「必ずあるとは言い切れない」
 * 性質を持つ。ビルド時に自前で焼き込めば、その不確かさを持ち込まずに済む。
 *
 * 🔴 Vercel 解約（Pour Over 16）では `next.config.ts` の `?? process.env.VERCEL_ENV` も
 * 併せて消す（撤去リストの⑥）。
 */
export function getClientStage(): string | undefined {
  // `next.config.ts` の `env` は string しか受け付けないので、未設定は `''` で来る。
  return process.env.NEXT_PUBLIC_STAGE || undefined;
}

/**
 * Sentry の `tracesSampleRate`（Pour Over C-2）。**本番 10% / それ以外 0%**。
 *
 * 🔴 **3つの Sentry 設定はウィザードの生成物から出発したため、率がばらばらだった**:
 * `sentry.server.config.ts` だけが `stage === 'production' ? 0.1 : 0` で、
 * `sentry.edge.config.ts` と `src/instrumentation-client.ts` は **全ステージ 100%** のまま。
 * 意図した差ではなく既定値の残りである（C-2）。
 *
 * 🔑 **soak（Pour Over 14）ではこれが観測そのものを危険にする。** 本番トラフィックの
 * 大半は脆弱性スキャナで（2026-08-03 実測: 1,050 req/24h のほとんど）、
 * 100% 送信は **Sentry のクォータを、価値の無いトレースで先に使い切る**。
 * クォータが尽きると**本当に見たいエラーが落ちる**＝「観測が必要なときに観測を失う」。
 *
 * 📌 **replay の率はここでは扱わない**（`replaysSessionSampleRate` は元から 10%＝
 * 既に絞られており、C-2 の指摘対象でもない）。1回の変更で複数の変数を動かさない。
 *
 * 引数でステージを受けるのは、**サーバ/エッジは `getStage()`、クライアントは
 * `getClientStage()` と入力が違う**ため。率の決定だけをここへ集約する。
 */
export function tracesSampleRateFor(stage: string | undefined): number {
  return stage === 'production' ? 0.1 : 0;
}

/**
 * Vercel の上で動いているか（Pour Over 3）。**ステージではなくプラットフォームの判定**。
 *
 * `@vercel/analytics` と `@vercel/speed-insights` が読み込む
 * `/_vercel/insights/script.js` / `/_vercel/speed-insights/script.js` は
 * **Vercel のインフラが配信する**もので、アプリのビルド成果物には含まれない。
 * AWS では当然 404 になり、計測もされないのに毎リクエスト取りに行く。
 *
 * 🔑 **`VERCEL` と `VERCEL_ENV` の両方を見る**。意味的には `VERCEL`（＝Vercel 上なら 1）が
 * 正確だが、システム環境変数の注入はプロジェクト設定のトグルに依存するため
 * 「必ずある」とは言い切れない。一方 `VERCEL_ENV` は本番で実際に読めていることが
 * 分かっている（`getStage()` のフォールバックがそれで機能している）。
 * **判定を外して困るのは Vercel 側**（計測が静かに止まり、soak 中の比較材料を失う）なので、
 * 確実にある方を必ず含める。AWS ではどちらも未設定なので偽陽性は起きない。
 *
 * 🔴 Vercel 解約（Pour Over 16）ではこの関数・呼び出し側・`@vercel/analytics` と
 * `@vercel/speed-insights` の依存をまとめて削除する（撤去リストの⑦）。
 */
export function isVercelPlatform(): boolean {
  return Boolean(process.env.VERCEL ?? process.env.VERCEL_ENV);
}
