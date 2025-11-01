/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
  images: {
    unoptimized: true
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
