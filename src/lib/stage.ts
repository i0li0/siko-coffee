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
