import type { NextConfig } from 'next';
import path from 'path';
import fs from 'fs';

function findProjectRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, 'node_modules', 'next', 'package.json'))) {
    return dir;
  }
  const parent = path.dirname(dir);
  if (parent === dir) return dir;
  return findProjectRoot(parent);
}

const nextConfig: NextConfig = {
  turbopack: {
    root: findProjectRoot(__dirname),
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
