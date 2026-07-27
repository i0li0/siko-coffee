import type { OpenNextConfig } from '@opennextjs/aws/types/open-next'

// OpenNext（Vercel → AWS 移行・docs/aws-migration-feasibility.md Phase 1）のビルド設定。
//
// 既定値のままでもビルドは通るが、**暗黙の既定に依存せず明示する**ために置いている。
// 移行の動機が AWS 学習である以上、どの Lambda が何のために生成されるかが
// コードから読めること自体に価値がある。値はすべて `@opennextjs/aws/types/open-next`
// の型で有効性を確認済み。
//
// 生成物（`npx @opennextjs/aws build` → `.open-next/`）:
//   server-functions/default    … SSR / API ルート / middleware を実行する Lambda
//   image-optimization-function … next/image の最適化 Lambda（sharp を自動同梱）
//   revalidation-function       … ISR 再検証を SQS 経由で処理する Lambda
//   warmer-function             … コールドスタート緩和（下記のとおり無効化）
//   assets/ , cache/            … S3 へ配る静的アセットとキャッシュ
//   open-next.output.json       … CloudFront の behavior とオリジンの対応表
const config: OpenNextConfig = {
  default: {
    override: {
      // ISR まわりは AWS 既定の組み合わせをそのまま使う（いずれも既定値の明示）。
      // 本プロジェクトは `'use cache'` 未使用で、revalidate は `/` の1時間と
      // `/api/menu` 程度しか無いため、既定で十分。
      queue: 'sqs',
      incrementalCache: 's3',
      tagCache: 'dynamodb',
    },
  },

  imageOptimization: {
    // 最適化対象の画像は S3（assets）から読む。外部画像は next.config.ts の
    // remotePatterns 側で許可している（Instagram CDN / Vercel Blob）。
    // ⚠️ Vercel Blob は移行時に S3 へ移すため、その際 remotePatterns も更新すること。
    loader: 's3',
  },

  // ウォーマーは**使わない**。Hobby からの移行でトラフィックが極小のため、
  // 常時 Lambda を温める費用対効果が無い（コールドスタートを許容する）。
  // 必要になったら 'aws-lambda' に変えて IaC 側でスケジュールを付ける。
  warmer: {
    invokeFunction: 'dummy',
  },
}

export default config
