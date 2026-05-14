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
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });
      
      // Generate token
      const token = generateToken(user);
      
      // Return user data and token (including createdAt and lastLogin)
      res.json({
        token,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          createdAt: updatedUser.createdAt,
          lastLogin: updatedUser.lastLogin,
          alertEmailsEnabled: updatedUser.alertEmailsEnabled
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
    
    // Fetch fresh user data including createdAt and lastLogin
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        lastLogin: true,
        alertEmailsEnabled: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        alertEmailsEnabled: user.alertEmailsEnabled
      }
    });
  });

  // Generate system token for cron jobs (SUPER_ADMIN only)
  router.post('/generate-system-token', async (req, res) => {
    try {
      // SECURITY: Only SUPER_ADMIN may generate system tokens.
      // Role comparison must use the uppercase value matching stored roles.
      if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin access required' });
      }

      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required to generate system token' });
      }

      // Verify admin credentials again for security
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user || user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin user not found' });
      }

      const isValid = await comparePassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate a long-lived token (you can adjust expiry in auth.js if needed)
      const token = generateToken(user);

      res.json({
        token,
        message: 'System token generated successfully. Store this securely for cron jobs.',
        warning: 'This token has Super Admin privileges. Keep it safe!'
      });
    } catch (e) {
      console.error('Generate system token error:', e);
      res.status(500).json({ error: 'Failed to generate system token' });
    }
  });

  // Change password
  router.post('/change-password', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify current password
      const isValid = await comparePassword(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      });

      res.json({ message: 'Password changed successfully' });
    } catch (e) {
      console.error('Change password error:', e);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Logout (client-side token removal, but we can track it)
  router.post('/logout', async (req, res) => {
    // Could implement token blacklist here if needed
    res.json({ message: 'Logged out successfully' });
  });

  // Check authentication status  
  router.get('/check', async (req, res) => {
    // This endpoint can be called without auth
    // The middleware should add req.user if a valid token is present
    if (req.user) {
      // Fetch fresh user data including createdAt and lastLogin
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          lastLogin: true,
          alertEmailsEnabled: true
        }
      });
      
      if (!user) {
        return res.json({ authenticated: false });
      }
      
      res.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          alertEmailsEnabled: user.alertEmailsEnabled
        }
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  return router;
}

export default createAuthRouter;
