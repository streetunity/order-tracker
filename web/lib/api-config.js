// Server-side API configuration
// This file is used by Next.js API routes (server-side only)
// DO NOT use NEXT_PUBLIC_ variables here - those are for client-side code

// For server-side API calls (Next.js API routes running on the same server),
// we should call the backend directly via localhost since both services
// run on the same machine. This bypasses Nginx and avoids domain-related issues.
//
// The flow is:
// - Client (browser) -> Nginx -> Next.js frontend (port 3000)
// - Next.js API route (server-side) -> Backend directly (localhost:4000)
//
// This is why we default to localhost:4000 - the server-side code doesn't
// need to go through the public domain/reverse proxy.

export const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';
