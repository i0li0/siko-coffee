import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',

  // 本番のみサンプリング率 10%（ノイズを抑える）
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 0,

  // 開発環境はデバッグログを出す
  debug: false,
});
