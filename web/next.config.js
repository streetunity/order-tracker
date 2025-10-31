/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable static optimization for fully dynamic authenticated app
  experimental: {
    appDir: true,
  },
  // Skip static page generation at build time
  // This is an authenticated app - everything should be dynamic
  output: 'standalone',
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  images: {
    unoptimized: true
  },
  publicRuntimeConfig: {
    API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  },
  async rewrites() {
    // Use the correct backend URL based on environment
    const API_URL = process.env.NODE_ENV === 'production' 
      ? 'http://localhost:4000'  // In production, backend runs on same server
      : 'http://localhost:4000';
    
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
