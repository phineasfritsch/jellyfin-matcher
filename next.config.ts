import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Sockets + HTTP share one custom server (server/index.ts); no standalone next start.
  reactStrictMode: true,
};

export default nextConfig;
