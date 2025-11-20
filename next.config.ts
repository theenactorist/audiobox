import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  optimizeFonts: true,
  images: {
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
  },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
      ],
    },
  ],
};

export default nextConfig;
