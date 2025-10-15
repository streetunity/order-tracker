import express from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, validatePassword } from '../utils/password.js';

const prisma = new PrismaClient();

export function createUsersRouter() {
  const router = express.Router();

  // List all users
  router.get('/', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get single user
  router.get('/:id', async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(user);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create new user (Admin only)
  router.post('/', async (req, res) => {
    try {
      // Check if requester is admin
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { email, name, password, role = 'AGENT' } = req.body;
      
      if (!email || !name || !password) {
        return res.status(400).json({ error: 'Email, name, and password are required' });
      }
      
      // Validate password
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ error: passwordValidation.message });
      }
      
      // Check if email already exists
      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });
      
      if (existing) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      
      // Hash password
      const hashedPassword = await hashPassword(password);
      
      // Create user with audit log
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            name,
            password: hashedPassword,
            role: role.toUpperCase(),
            isActive: true
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true
          }
        });
        
        await tx.auditLog.create({
          data: {
            entityType: 'User',
            entityId: newUser.id,
            action: 'USER_CREATED',
            metadata: JSON.stringify({
              entity: 'User',
              entityId: newUser.id,
              data: {
                email: newUser.email,
                name: newUser.name,
                role: newUser.role
              }
            }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        
        return newUser;
      });
      
      res.status(201).json(user);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update user (Admin only)
  router.patch('/:id', async (req, res) => {
    try {
      // Check if requester is admin
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const original = await prisma.user.findUnique({
        where: { id: req.params.id }
      });
      
      if (!original) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { name, email, role, isActive, password } = req.body;
      const data = {};
      const changes = [];
      
      if (name !== undefined && name !== original.name) {
        data.name = name;
        changes.push({
          field: 'name',
          oldValue: original.name,
          newValue: name
        });
      }
      
      if (email !== undefined && email.toLowerCase() !== original.email) {
        data.email = email.toLowerCase();
        changes.push({
          field: 'email',
          oldValue: original.email,
          newValue: data.email
        });
      }
      
      if (role !== undefined && role.toUpperCase() !== original.role) {
        data.role = role.toUpperCase();
        changes.push({
          field: 'role',
          oldValue: original.role,
          newValue: data.role
        });
      }
      
      if (isActive !== undefined && isActive !== original.isActive) {
        data.isActive = isActive;
        changes.push({
          field: 'isActive',
          oldValue: String(original.isActive),
          newValue: String(isActive)
        });
      }
      
      // Handle password update
      if (password) {
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
          return res.status(400).json({ error: passwordValidation.message });
        }
        data.password = await hashPassword(password);
        changes.push({
          field: 'password',
          oldValue: '[hidden]',
          newValue: '[changed]'
        });
      }
      
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: req.params.id },
          data,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            updatedAt: true
          }
        });
        
        if (changes.length > 0) {
          await tx.auditLog.create({
            data: {
              entityType: 'User',
              entityId: req.params.id,
              action: 'USER_UPDATED',
              changes: JSON.stringify(changes),
              performedByUserId: req.user.id,
              performedByName: req.user.name
            }
          });
        }
        
        return updated;
      });
      
      res.json(user);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete user (soft delete by deactivating) - Admin only
  router.delete('/:id', async (req, res) => {
    try {
      // Check if requester is admin
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      // Don't allow deleting yourself
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: req.params.id },
          data: { isActive: false }
        });
        
        await tx.auditLog.create({
          data: {
            entityType: 'User',
            entityId: req.params.id,
            action: 'USER_DEACTIVATED',
            metadata: JSON.stringify({ message: 'User account deactivated' }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
      });
      
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createUsersRouter;