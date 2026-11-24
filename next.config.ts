import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ['/upload/:path*', '/api/:path*', '/s/:path*'].map((source) => ({
      source,
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }));
  },
  images: {
    minimumCacheTTL: 2592000,
    qualities: [75, 80],
    dangerouslyAllowLocalIP: process.env.NODE_ENV === 'development',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
