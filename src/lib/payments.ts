// オンライン決済の受付可否を一箇所で判定する。
//
// フェイルクローズ設計: `PAYMENTS_ENABLED === 'true'` のときだけ決済を受け付ける。
// 環境変数の設定漏れ・消失時は「停止」側に倒れるため、意図せず課金が走ることがない。
//
// 経緯: AWS 移行期間中（docs/aws-migration-feasibility.md Phase 0）、Vercel Hobby プランの
// 商用利用制限を回避するためオンライン決済を意図的に停止する。再開時は本番環境の
// `PAYMENTS_ENABLED` に 'true' を設定して再デプロイする。
export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === 'true';
}

// 停止中に利用者へ提示する文言。checkout 系 API のエラー応答としてそのまま画面に出る。
export const PAYMENTS_DISABLED_MESSAGE =
  'ただいまオンライン販売を一時停止しています。再開までしばらくお待ちください。';

// 購入導線の見出しとして使う短い表示（SalesSuspendedNotice の見出し）。
export const PAYMENTS_DISABLED_HEADING = 'オンライン販売 一時停止中';

// 購入ボタンなど、文字数の限られる箇所に出す停止表示。
export const PAYMENTS_DISABLED_LABEL = '販売停止中';
