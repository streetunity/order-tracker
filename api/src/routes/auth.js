// api/src/routes/auth.js
/**
 * Authentication Routes
 * Handles login, logout, and session management
 */

import { Router } from 'express';
import { authGuard, optionalAuth, generateToken } from '../middleware/auth.js';
import { comparePassword } from '../utils/password.js';

export function createAuthRouter(prisma) {
  const router = Router();

  /**
   * POST /auth/login
   * User login endpoint
   */
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Check if user is active
      if (!user.isActive) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }
      
      // Verify password
      const isValid = await comparePassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });
      
      // Generate token
      const token = generateToken(user);
      
      // Return user data and token
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (e) {
      console.error('Login error:', e);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  /**
   * GET /auth/me
   * Get current authenticated user
   */
  router.get('/me', authGuard, async (req, res) => {
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    });
  });

  /**
   * POST /auth/logout
   * Logout endpoint (mainly for tracking)
   */
  router.post('/logout', authGuard, async (req, res) => {
    // Could implement token blacklist here if needed
    res.json({ message: 'Logged out successfully' });
  });

  /**
   * GET /auth/check
   * Check authentication status
   */
  router.get('/check', optionalAuth, (req, res) => {
    if (req.user) {
      res.json({
        authenticated: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
          role: req.user.role
        }
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  return router;
}

export default createAuthRouter;
