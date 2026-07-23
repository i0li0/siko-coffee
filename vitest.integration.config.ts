import { defineConfig } from 'vitest/config'
import path from 'path'

// preview の実テーブルに対して走らせる結合テスト（通常の `vitest run` には含めない）。
// 実行: VERCEL_ENV=preview npx vitest run --config vitest.integration.config.ts
// ※ AWS 資格情報が必要。書き込むのは siko-coffee-preview-* のみ、後始末まで各テストで行う。
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
