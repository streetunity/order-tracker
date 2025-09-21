/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    unoptimized: true
  },
  publicRuntimeConfig: {
    API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  }
};
module.exports = nextConfig;