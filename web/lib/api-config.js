// Server-side API configuration
// This file is used by Next.js API routes (server-side only)
// DO NOT use NEXT_PUBLIC_ variables here - those are for client-side code

export const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
