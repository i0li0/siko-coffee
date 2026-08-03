// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { getStage, tracesSampleRateFor } from "./src/lib/stage";

Sentry.init({
  dsn: "https://bb8c86c5e9b6040ca4817af77d74f269@o4511541920858112.ingest.us.sentry.io/4511541925642240",

  // このファイルは Sentry ウィザードの生成物のままで **environment が無かった**ため、
  // middleware / edge ルート由来のイベントがステージ不明で記録されていた
  // （sentry.server.config.ts だけが environment を持つ状態）。Pour Over 1 で揃える。
  environment: getStage() ?? 'development',

  // ✅ Pour Over C-2（2026-08-03）で server と揃えた。**旧値は全ステージ 100%** で、
  // これはウィザード既定の残りであって意図した差ではなかった。率の決定は
  // `tracesSampleRateFor()` に集約してある（3ファイルが再び食い違わないように）。
  tracesSampleRate: tracesSampleRateFor(getStage()),

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
