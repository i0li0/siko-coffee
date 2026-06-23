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
      "img-src 'self' data: blob: https://*.cdninstagram.com https://cdninstagram.com https://www.google-analytics.com https://*.public.blob.vercel-storage.com",
      "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot(),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'instagram.com' },
      { protocol: 'https', hostname: 'cdninstagram.com' },
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
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
  // host は完全一致のため、デプロイ毎の一意URL(<hash>.vercel.app)には影響しない。
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'sikocoffee.com' }],
        destination: 'https://www.sikocoffee.com/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'siko-coffee.vercel.app' }],
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
