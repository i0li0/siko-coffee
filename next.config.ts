import type { NextConfig } from 'next';
import path from 'path';
import fs from 'fs';
import { withSentryConfig } from '@sentry/nextjs';

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
      // Sentry の ingest を許可する。これが無いとブラウザ側の Sentry イベントは
      // CSP で全てブロックされる（2026-07-27 に本番でも起きていたことを実測）。
      // DSN は src/instrumentation-client.ts にハードコードされており、送信自体は
      // 常に試みられていたため、**クライアント由来のエラーだけが静かに失われていた**。
      // ホストは DSN 固定なのでワイルドカードにせず限定する。
      "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://o4511541920858112.ingest.us.sentry.io",
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
