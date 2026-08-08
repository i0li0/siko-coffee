import type { NextConfig } from 'next';
import path from 'path';
import fs from 'fs';
import { withSentryConfig } from '@sentry/nextjs';
import { buildConnectSrc } from './src/lib/csp';

// Worktree is at <repo>/.claude/worktrees/<name>, so 3 levels up is the repo root.
// In the main repo __dirname === repo root, so resolve('../..') won't exist but
// node_modules will be right here — either way we need the dir that owns node_modules.
function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 4; i++) {
    const nm = path.join(dir, 'node_modules');
    try {
      fs.statSync(nm);
      return dir;
    } catch {}
    dir = path.dirname(dir);
  }
  return __dirname;
}

// 本番では 'unsafe-eval' を排除する（Next 本番ランタイムは eval 不要）。
// 'unsafe-inline' は静的プリレンダ済みページのインラインスクリプト用に維持する。
// （nonce で完全排除するには全ページを動的レンダリングする必要があり、トレードオフが大きい）
// 開発時のみ HMR / React Refresh のため eval とインラインを許可する。
const isProd = process.env.NODE_ENV === 'production';
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com";

// 🔴🔴 アイコンのアップロード先（S3）を connect-src に入れる（Pour Over 4 / soak の S-5）。
//
// **2026-08-08 に本番で S-5 を実施して発覚した。** ブラウザは presigned URL への PUT を
// 送る前に CSP で止めており、UI は「アップロードに失敗しました」としか出ていなかった。
// 4（Vercel Blob → S3）でストレージは移したが CSP を直しておらず、
// `img-src` に `*.cloudfront.net` は足してあったので**表示だけは通っていた**。
// 組み立てとテストは `src/lib/csp.ts`（理由と再発の経緯もそこに書いてある）。
const connectSrc = buildConnectSrc();

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // アバターは CloudFront（Pour Over 4 で Vercel Blob から移行）。
      // ⚠️ ホストを1つに絞れないのは、配信元がステージごとの CloudFront ドメインで、
      // **ビルド時にはまだ確定していない**ため（URL はデプロイの出力）。
      // img-src はスクリプトを実行しないので、この範囲の緩さは許容する。
      // 12（独自ドメイン）以降に `avatars.sikocoffee.com` へ寄せれば1ホストに絞れる。
      "img-src 'self' data: blob: https://*.cdninstagram.com https://cdninstagram.com https://www.google-analytics.com https://*.cloudfront.net",
      // 送信先の許可リスト。組み立ては上の `connectSrc` に集約してある
      // （アイコンのアップロード先 S3 を**ビルド時に1ホストだけ**足すため）。
      connectSrc,
      // Sentry Session Replay は blob: から Worker を生成する。worker-src 未指定だと
      // script-src にフォールバックし blob: が無いためブロックされる。
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // X-Powered-By: Next.js の情報開示を抑止する（フレームワーク露出を避ける）。
  poweredByHeader: false,
  // クライアント側 Sentry のステージタグ（Pour Over C-1）。
  //
  // `src/lib/stage.ts` の `getStage()` は `STAGE ?? VERCEL_ENV` を**実行時**に読むが、
  // どちらも `NEXT_PUBLIC_` 接頭辞が無く**ブラウザ用バンドルには入らない**。
  // そのため `src/instrumentation-client.ts` だけが environment を持てず、
  // **クライアント由来の Sentry イベントがステージ不明のまま**記録されていた。
  // soak 期間（Pour Over 14）は AWS と Vercel の両方が本番を担うので、
  // タグが無いと **どちらで起きたエラーなのかが区別できない**。
  //
  // 🔑 **同じ式をビルド時に評価して焼き込む**（実行時の `getStage()` と意味を揃える）。
  // AWS: SST が build プロセスへ `STAGE` を渡す（`buildApp` が `environment` を build の
  // env に流し込むことをソースで確認済み）。Vercel: ビルド時に `VERCEL_ENV` が入る。
  // 読み出しは `getClientStage()` に集約してある。
  //
  // 📌 Vercel が自動公開する `NEXT_PUBLIC_VERCEL_ENV` は**使わない**。あれはプロジェクト設定の
  // トグル依存で「必ずある」と言い切れず、`isVercelPlatform()` の `VERCEL` と同じ弱さを持つ。
  // 🔴 Pour Over 16⑥ では `?? process.env.VERCEL_ENV` をここでも消す。
  env: {
    NEXT_PUBLIC_STAGE: process.env.STAGE ?? process.env.VERCEL_ENV ?? '',
  },
  turbopack: {
    root: repoRoot(),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'instagram.com' },
      { protocol: 'https', hostname: 'cdninstagram.com' },
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      // アバターの配信元（Pour Over 4）。CSP の img-src と**必ず両方**そろえる。
      { protocol: 'https', hostname: '**.cloudfront.net' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  // www(canonical) 以外のホストを www へ正規化するリダイレクト。
  // Vercel のエッジ「リダイレクトドメイン」は HSTS に includeSubDomains/preload を付けず、
  // headers() も通らない。各ホストを「配信ドメイン」に変更しここでリダイレクトすることで、
  // 上の securityHeaders（完全な HSTS）がリダイレクト応答にも適用され、
  // かつドメイン正規化の設定をコード一箇所に集約できる。
  // - apex(sikocoffee.com): HSTS preload 要件を満たすため必須。
  // - siko-coffee.vercel.app: 検索エンジンへの重複インデックスを防止。
  //
  // ⚠️ value は必ず `^...$` で明示的にアンカーすること（OpenNext issue #1202）。
  // Next.js 本体は `new RegExp('^' + value + '$')` と**自前でアンカーする**ため素の
  // 'sikocoffee.com' でも apex だけに一致するが、OpenNext(AWS) は
  // `new RegExp(value).test(host)` と**アンカーせずに**評価するため、同じ値が
  // 'www.sikocoffee.com' にも部分一致し **apex 正規化が www を自分自身へ 308 で送り続ける
  // ＝サイト全体が無限リダイレクトで停止する**。明示アンカーは Next.js 側では
  // `^^...$$`（ゼロ幅アサーションの重複＝無害）になるだけなので、両方で正しく動く。
  // ドットもエスケープし、任意1文字として振る舞わないようにする。
  // この不変条件は src/__tests__/hostRedirects.test.ts が両エンジンの意味論で検証している。
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: '^sikocoffee\\.com$' }],
        destination: 'https://www.sikocoffee.com/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: '^siko-coffee\\.vercel\\.app$' }],
        destination: 'https://www.sikocoffee.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // DSN が未設定の場合はソースマップアップロードをスキップ
  silent: !process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
