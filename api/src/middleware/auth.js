// api/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { isSuperAdmin, isAccountantOrHigher, isAdminOrHigher, isManufacturer } from '../utils/roleHelpers.js';

const prisma = new PrismaClient();

// SECURITY: JWT_SECRET must be set via environment variable.
// In production the server will refuse to start without it.
// In development a loud error is logged if it is missing.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Set it in your .env file and restart.');
  } else {
    console.error('\n⚠️  WARNING: JWT_SECRET is not set. Using an insecure fallback — DO NOT use this in production!\n');
  }
}
const SECRET = JWT_SECRET || 'dev-secret-key-change-in-production';

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      name: user.name 
    },
    SECRET,
    { expiresIn: '7d' }
  );
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (error) {
    return null;
  }
}

// Extract user from request
async function getUserFromRequest(req) {
  try {
    let token = null;
    
    // Check for JWT token in Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Also check for x-auth-token header (used by frontend)
    if (!token && req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
    }
    
    if (token) {
      const decoded = verifyToken(token);
      
      if (decoded) {
        // Get fresh user data from database, including manufacturer link
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            manufacturer: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });
        
        if (user && user.isActive) {
          return user;
        }
      }
    }

    // NOTE: The legacy x-admin-key / ADMIN_KEY fallback has been removed.
    // It granted SUPER_ADMIN access with no audit trail and no DB isActive check.
    // Use the system user account (system@ordertracker.internal) with a JWT instead.

    return null;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// Middleware: Require any authenticated user
export async function authGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  req.user = user;
  next();
}

// Middleware: Require admin role or higher (ADMIN, ACCOUNTANT, SUPER_ADMIN) - blocks MANUFACTURER
export async function adminGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (isManufacturer(user.role)) {
    return res.status(403).json({ error: 'Access denied. Manufacturers cannot access this resource.' });
  }
  
  if (!isAdminOrHigher(user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  req.user = user;
  next();
}

// Middleware: Require Super Admin only
export async function superAdminGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!isSuperAdmin(user.role)) {
    return res.status(403).json({ 
      error: 'Super Admin access required',
      role: user.role
    });
  }
  
  req.user = user;
  next();
}

// Middleware: Require Accountant or Super Admin
export async function accountantGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!isAccountantOrHigher(user.role)) {
    return res.status(403).json({ 
      error: 'Accountant or Super Admin access required',
      role: user.role
    });
  }
  
  req.user = user;
  next();
}

// Middleware: Require admin role specifically for unlock (backward compatibility)
// This now checks for ADMIN or higher
export async function unlockGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!isAdminOrHigher(user.role)) {
    return res.status(403).json({ 
      error: 'Only administrators can unlock orders',
      role: user.role
    });
  }
  
  req.user = user;
  next();
}

// Middleware: Block manufacturers specifically
export async function nonManufacturerGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (isManufacturer(user.role)) {
    return res.status(403).json({ 
      error: 'Access denied. This resource is not available to manufacturer accounts.',
      role: user.role
    });
  }
  
  req.user = user;
  next();
}

// Optional auth - sets req.user if authenticated but doesn't require it
export async function optionalAuth(req, res, next) {
  const user = await getUserFromRequest(req);
  req.user = user;
  next();
}
