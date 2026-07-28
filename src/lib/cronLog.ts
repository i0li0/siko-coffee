// cron 4本の観測性を1か所に集約する（Pour Over 2）。
//
// 8（cron → sst.aws.Cron ＋ 中継 Lambda）を終えると Vercel のダッシュボードは
// 使えなくなり、**CloudWatch Logs が唯一の観測手段**になる。Sentry は DSN 未設定・
// ネットワーク遮断・CSP で静かに落ちうるので、**必ず stdout/stderr にも出す**。
//
// 出力は CloudWatch Logs Insights で絞り込めるよう `[cron] <route> <event>` を先頭に置く。
//   fields @message | filter @message like /^\[cron\]/
//
// Sentry の `tags.route` は既存の値（`cron/...`）をそのまま使う。ここを変えると
// 既存の Sentry 側の検索・アラートが外れるため、route 引数には `cron/po-timeouts` の
// 形式をそのまま渡すこと。

import * as Sentry from '@sentry/nextjs';

const PREFIX = '[cron]';

/** 実行開始を記録し、経過時間の起点（ms）を返す。 */
export function cronStart(route: string): number {
  console.log(`${PREFIX} ${route} start`);
  return Date.now();
}

/** 正常終了を件数つきで記録する。「動いたが 0 件」と「動いていない」を区別できるようにする。 */
export function cronDone(
  route: string,
  startedAt: number,
  result: Record<string, unknown> = {},
): void {
  console.log(`${PREFIX} ${route} done ${Date.now() - startedAt}ms ${JSON.stringify(result)}`);
}

/** 例外での失敗。console.error と Sentry の両方へ出す。 */
export function cronFail(
  route: string,
  startedAt: number,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  console.error(`${PREFIX} ${route} fail ${Date.now() - startedAt}ms`, extra ?? {}, err);
  Sentry.captureException(err, { tags: { route }, extra });
}

/** 失敗ではないが黙って進めたくない状態（フォールバックした、期限が近い等）。 */
export function cronWarn(
  route: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  console.warn(`${PREFIX} ${route} warn ${message}`, extra ?? {});
  Sentry.captureMessage(`${route}: ${message}`, { level: 'warning', tags: { route }, extra });
}

/**
 * 例外は起きていないが失敗している場合（外部 API が非 200、前提データが無い等）。
 * 握り潰すと「静かに動かなくなる」ため、例外と同じ扱いで通知する。
 */
export function cronAlert(
  route: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  console.error(`${PREFIX} ${route} alert ${message}`, extra ?? {});
  Sentry.captureMessage(`${route}: ${message}`, { level: 'error', tags: { route }, extra });
}
