import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, '../../..'),
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
