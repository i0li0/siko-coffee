import type { NextConfig } from 'next';
import path from 'path';

// Worktree is at <repo>/.claude/worktrees/<name>, so 3 levels up is the repo root.
// In the main repo __dirname === repo root, so resolve('../..') won't exist but
// node_modules will be right here — either way we need the dir that owns node_modules.
function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 4; i++) {
    const nm = path.join(dir, 'node_modules');
    try {
      require('fs').statSync(nm);
      return dir;
    } catch {}
    dir = path.dirname(dir);
  }
  return __dirname;
}

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
};

export default nextConfig;
