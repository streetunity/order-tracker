/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  // Prevent Next.js from trying to statically generate API routes
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
  async rewrites() {
    // Use the API URL from environment variable
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
