// api/src/middleware/apiKeyAuth.js
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Hash a raw API key for storage / lookup. Only the hash is ever persisted.
export function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// Generate a new API key. Returns the raw key (shown once to the partner),
// its hash (stored), and a short prefix (stored for display/identification).
// Caller performs the prisma.apiKey.create().
export function generateApiKey(label = 'smt') {
  const raw = `${label}_${crypto.randomBytes(24).toString('hex')}`;
  return { raw, keyHash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

// Middleware: require a valid, active, read-scoped API key.
// Expects header: Authorization: Bearer <key>
export async function apiKeyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'API key required' });
    }

    const rawKey = authHeader.substring(7).trim();
    if (!rawKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await prisma.apiKey.findUnique({ where: { keyHash } });

    if (!apiKey || !apiKey.isActive) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    const scopes = (apiKey.scopes || '').split(',').map((s) => s.trim());
    if (!scopes.includes('read')) {
      return res.status(403).json({ error: 'API key lacks read scope' });
    }

    // Non-blocking last-used stamp; logging must never fail the request.
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    req.apiKey = { id: apiKey.id, label: apiKey.label, scopes };
    next();
  } catch (err) {
    console.error('API key auth error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
}
