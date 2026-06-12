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
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.cdninstagram.com https://cdninstagram.com https://www.google-analytics.com",
      "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com",
      "frame-ancestors 'none'",
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
