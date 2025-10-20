import express from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, validatePassword } from '../utils/password.js';
import { 
  canCreateRole, 
  canEditRole, 
  canDeactivateUser,
  isValidRole,
  getRoleDisplayName,
  getAssignableRoles,
  isAdminOrHigher
} from '../utils/roleHelpers.js';

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

  // Get assignable roles for current user
  router.get('/roles/assignable', async (req, res) => {
    try {
      const roles = getAssignableRoles(req.user.role);
      const rolesWithDisplayNames = roles.map(role => ({
        value: role,
        label: getRoleDisplayName(role),
        canAssign: canCreateRole(req.user.role, role)
      }));
      res.json(rolesWithDisplayNames);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create new user (Admin or higher)
  router.post('/', async (req, res) => {
    try {
      // Check if requester has admin privileges or higher
      if (!isAdminOrHigher(req.user.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { email, name, password, role = 'AGENT' } = req.body;
      
      if (!email || !name || !password) {
        return res.status(400).json({ error: 'Email, name, and password are required' });
      }

      // Validate role
      const targetRole = role.toUpperCase();
      if (!isValidRole(targetRole)) {
        return res.status(400).json({ error: `Invalid role: ${role}` });
      }

      // Check if requester can create users with this role
      if (!canCreateRole(req.user.role, targetRole)) {
        return res.status(403).json({ 
          error: `You cannot create users with role ${getRoleDisplayName(targetRole)}. You can only create: ${getAssignableRoles(req.user.role).map(getRoleDisplayName).join(', ')}`
        });
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
            role: targetRole,
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

  // Update user (Admin or higher with role hierarchy)
  router.patch('/:id', async (req, res) => {
    try {
      // Check if requester has admin privileges or higher
      if (!isAdminOrHigher(req.user.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const original = await prisma.user.findUnique({
        where: { id: req.params.id }
      });
      
      if (!original) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if requester can edit this user based on role hierarchy
      // Exception: users can always edit themselves (except their role)
      const isSelfEdit = req.params.id === req.user.id;
      if (!isSelfEdit && !canEditRole(req.user.role, original.role)) {
        return res.status(403).json({ 
          error: `You cannot edit users with role ${getRoleDisplayName(original.role)}`
        });
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
      
      // Handle role changes with hierarchy checks
      if (role !== undefined && role.toUpperCase() !== original.role) {
        const targetRole = role.toUpperCase();

        // Users cannot change their own role
        if (isSelfEdit) {
          return res.status(403).json({ error: 'You cannot change your own role' });
        }

        // Validate role
        if (!isValidRole(targetRole)) {
          return res.status(400).json({ error: `Invalid role: ${role}` });
        }

        // Check if requester can assign this new role
        if (!canCreateRole(req.user.role, targetRole)) {
          return res.status(403).json({ 
            error: `You cannot assign role ${getRoleDisplayName(targetRole)}. You can only assign: ${getAssignableRoles(req.user.role).map(getRoleDisplayName).join(', ')}`
          });
        }

        data.role = targetRole;
        changes.push({
          field: 'role',
          oldValue: original.role,
          newValue: targetRole
        });
      }
      
      // Handle isActive changes (deactivation requires hierarchy check)
      if (isActive !== undefined && isActive !== original.isActive) {
        // Users cannot deactivate themselves
        if (isSelfEdit) {
          return res.status(403).json({ error: 'You cannot deactivate your own account' });
        }

        // Check if requester can deactivate this user based on role hierarchy
        if (!canDeactivateUser(req.user.role, original.role)) {
          return res.status(403).json({ 
            error: `You cannot deactivate users with role ${getRoleDisplayName(original.role)}`
          });
        }

        data.isActive = isActive;
        changes.push({
          field: 'isActive',
          oldValue: String(original.isActive),
          newValue: String(isActive)
        });
      }
      
      // Handle password update (users can update their own password)
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

  // Delete user (soft delete by deactivating) - Admin or higher with hierarchy check
  router.delete('/:id', async (req, res) => {
    try {
      // Prevent hard deletes - return error
      return res.status(400).json({ 
        error: 'Cannot permanently delete users. Use PATCH to deactivate instead.',
        hint: 'Send PATCH /:id with { "isActive": false } to deactivate a user'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createUsersRouter;