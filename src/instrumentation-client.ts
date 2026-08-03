// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { getClientStage } from "@/lib/stage";

Sentry.init({
  dsn: "https://bb8c86c5e9b6040ca4817af77d74f269@o4511541920858112.ingest.us.sentry.io/4511541925642240",

  // Pour Over C-1。server / edge は Pour Over 1 で environment を持ったが、
  // **ここだけ残っていた**（`STAGE` も `VERCEL_ENV` も `NEXT_PUBLIC_` が無く
  // ブラウザ用バンドルに入らないため、別タスクに切り出されていた）。
  // 値は `next.config.ts` の `env` がビルド時に焼き込む。未設定なら 'development'
  // ＝ server / edge と同じ既定値に揃える。
  environment: getClientStage() ?? 'development',

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
