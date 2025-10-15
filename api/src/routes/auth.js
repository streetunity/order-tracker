import express from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, validatePassword } from '../utils/password.js';
import { generateToken, verifyToken } from '../middleware/auth.js';

const prisma = new PrismaClient();

export function createAuthRouter() {
  const router = express.Router();

  // Login
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

  // Get current user
  router.get('/me', async (req, res) => {
    // This requires authGuard middleware to be applied, so req.user should be set
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    });
  });

  // Logout (client-side token removal, but we can track it)
  router.post('/logout', async (req, res) => {
    // Could implement token blacklist here if needed
    res.json({ message: 'Logged out successfully' });
  });

  // Check authentication status  
  router.get('/check', (req, res) => {
    // This endpoint can be called without auth
    // The middleware should add req.user if a valid token is present
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