import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Uploaded photos are served from Supabase Storage, so that host has to be
    // allowed. Matched by wildcard rather than read from an environment
    // variable: remotePatterns is evaluated at build time, so a deploy that ran
    // before the variable existed would silently refuse to render uploads.
    // Bundled samples come from /public and need no entry here.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
