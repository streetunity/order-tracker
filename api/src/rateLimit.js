// api/src/rateLimit.js

// Simple in-memory rate limiter for public endpoints
const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute

export function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  // Clean up old entries
  for (const [key, data] of requestCounts) {
    if (now - data.windowStart > WINDOW_MS) {
      requestCounts.delete(key);
    }
  }
  
  // Check current IP
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, {
      count: 1,
      windowStart: now
    });
    return next();
  }
  
  const ipData = requestCounts.get(ip);
  
  // Reset if window expired
  if (now - ipData.windowStart > WINDOW_MS) {
    ipData.count = 1;
    ipData.windowStart = now;
    return next();
  }
  
  // Check if limit exceeded
  if (ipData.count >= MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.'
    });
  }
  
  // Increment and continue
  ipData.count++;
  next();
}