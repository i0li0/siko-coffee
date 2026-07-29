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
