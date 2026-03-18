import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent SSR from bundling @vladmandic/human (which would pull in @tensorflow/tfjs-node).
  // The library is only used client-side via dynamic import inside init().
  serverExternalPackages: ['@vladmandic/human'],

  // Security headers for production
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // Image optimization — allow data URIs and blob URLs used by camera capture
  images: {
    unoptimized: true, // Photos are data URIs / blobs, not remote URLs
  },
};

export default nextConfig;
