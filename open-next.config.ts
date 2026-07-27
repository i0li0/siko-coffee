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

    // 🔴 sharp のインストール条件を**明示的に上書きする**。既定のままだと
    // next/image が一切最適化されず、原本をそのまま返す（2026-07-27 に stage dev で実測。
    // Vercel 4KB/webp ↔ AWS 222KB/png ＝約53倍）。原因は2段構えで、どちらも無言で失敗する:
    //
    // ① OpenNext 4.1.0 の既定は **sharp@0.32.6**。0.32 系はネイティブバイナリを
    //    インストール時に prebuild-install が取得する方式で、その判定材料は
    //    `npm_config_platform`。OpenNext が渡すのは `--os=linux`（npm の optional
    //    依存フィルタ用）であって `--platform` ではないため、**ビルドしたマシンの
    //    プラットフォーム（macOS）向けバイナリが選ばれる**。実際、stage dev の Lambda には
    //    `sharp/build/Release/sharp-darwin-arm64v8.node` が入っていた（Linux arm64 の
    //    Lambda に macOS バイナリ）。`--platform=linux` を足しても解消しないことを実測済み。
    // ② 0.35 系に上げると `@img/sharp-<os>-<cpu>` の optional 依存で解決されるようになるが、
    //    これらは package.json に `libc: glibc` を持つ。**npm 10 は `--libc` を解釈しない**ため
    //    macOS からは glibc 前提のパッケージを選べず、黙って `@img/sharp-wasm32` に落ちる。
    //    `--libc` が効くのは **npm 11 以降**（実測: npm 10.9.2 → wasm32 / npm 11.18.0 →
    //    `@img/sharp-linux-arm64` + `@img/sharp-libvips-linux-arm64`）。
    //
    // そしてこれが表に出ない理由が③:
    // ③ Next.js の `imageOptimizer()` は変換中の例外を握りつぶして**原本をそのまま返す**
    //    （node_modules/next/dist/server/image-optimizer.js の
    //    「If we fail to optimize, fallback to the original image」）。ログも出さない。
    //    そのため sharp が require できなくても CloudWatch には何も残らず、
    //    パラメータ検証（不正な w は 400）だけは正常に動くため「Lambda は動いている」ように見える。
    //    応答の `cache-control: max-age=14400` は失敗経路が使う `minimumCacheTTL` そのもので、
    //    最適化成功時の値ではない＝フォールバックしている確かな指紋。
    //
    // ⚠️ **`npm` は 11 以降が必須**。10 系でビルドすると wasm32 に落ちたまま
    //    デプロイが成功してしまう（OpenNext の installDependencies は失敗をログに出すだけで
    //    ビルドを止めない）。ビルド後に `npm run verify:image-optimizer` で必ず検証すること。
    // ⚠️ arch は SST が作る Lambda（arm64）と一致させること。片方だけ変えると再発する。
    install: {
      // 下限指定（固定しない）。Next 16.2.11 の optional 依存は `sharp: ^0.34.5`、
      // package.json の overrides は `^0.35.3`（#69 の脆弱性対応）なので、それに揃える。
      packages: ['sharp@^0.35.3'],
      os: 'linux',
      arch: 'arm64',
      libc: 'glibc',
      nodeVersion: '24', // Lambda ランタイム nodejs24.x に合わせる
    },
  },

  // ウォーマーは**使わない**。Hobby からの移行でトラフィックが極小のため、
  // 常時 Lambda を温める費用対効果が無い（コールドスタートを許容する）。
  // 必要になったら 'aws-lambda' に変えて IaC 側でスケジュールを付ける。
  warmer: {
    invokeFunction: 'dummy',
  },
}

export default config
