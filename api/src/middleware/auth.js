// api/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      name: user.name 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Extract user from request
async function getUserFromRequest(req) {
  try {
    // Check for JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (decoded) {
        // Get fresh user data from database
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true
          }
        });
        
        if (user && user.isActive) {
          return user;
        }
      }
    }

    // Fallback to API key for backward compatibility (will be removed later)
    const adminKey = req.headers['x-admin-key'];
    if (adminKey === process.env.ADMIN_KEY) {
      // Return a system admin user for API key access
      return {
        id: 'system',
        email: 'system@admin',
        name: 'System Admin',
        role: 'ADMIN',
        isActive: true
      };
    }

    return null;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// Middleware: Require any authenticated user (admin or agent)
export async function authGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  req.user = user;
  next();
}

// Middleware: Require admin role
export async function adminGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  req.user = user;
  next();
}

// Middleware: Require admin role specifically for unlock
export async function unlockGuard(req, res, next) {
  const user = await getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ 
      error: 'Only administrators can unlock orders',
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