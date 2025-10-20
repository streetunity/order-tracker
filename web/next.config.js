/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Removed 'output: standalone' - not needed for non-Docker deployments
  // This fixes the missing prerender-manifest.json issue
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
