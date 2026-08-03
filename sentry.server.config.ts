import * as Sentry from '@sentry/nextjs';
import { getStage, tracesSampleRateFor } from './src/lib/stage';

// 🔴 ステージ判定に `VERCEL_ENV` を直接使わないこと（Pour Over 1）。
// AWS には `VERCEL_ENV` が無いため、以前の `VERCEL_ENV === 'production'` 判定では
// **AWS 本番で tracesSampleRate が 0＝サーバ側 Performance が完全に無効**になり、
// environment も誤ったタグが付いていた。移行の前提だった
// 「Vercel Speed Insights は Sentry Performance で代替する」が黙って崩れる。
const stage = getStage() ?? 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: stage,

  // 本番のみサンプリング率 10%（ノイズを抑える）。
  // 📌 値は変わっていない。**この式が3ファイルの正解だった**ので、Pour Over C-2 で
  // `tracesSampleRateFor()` に切り出し、edge と client をこちらへ寄せた。
  tracesSampleRate: tracesSampleRateFor(stage),

  // 開発環境はデバッグログを出す
  debug: false,
});
