import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
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

  // GET /users — list all users
  router.get('/', async (req, res) => {
    try {
      const { role } = req.query;
      const where = {};
      if (role) where.role = role;
      const users = await prisma.user.findMany({
        where,
        select: { id: true, email: true, name: true, role: true, isActive: true, showInSalesRepDropdown: true, lastLogin: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      });
      res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /users/sales-reps
  router.get('/sales-reps', async (req, res) => {
    try {
      const salesReps = await prisma.user.findMany({
        where: { isActive: true, showInSalesRepDropdown: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' }
      });
      res.json(salesReps);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /users/search
  router.get('/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || q.length < 1) return res.json([]);
      const users = await prisma.user.findMany({
        where: { isActive: true, OR: [{ name: { contains: q } }, { email: { contains: q } }] },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        take: 10
      });
      res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /users/roles/assignable
  router.get('/roles/assignable', async (req, res) => {
    try {
      const roles = getAssignableRoles(req.user.role);
      res.json(roles.map(role => ({ value: role, label: getRoleDisplayName(role), canAssign: canCreateRole(req.user.role, role) })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /users/email-settings — get current user's email settings
  router.get('/email-settings', async (req, res) => {
    try {
      const settings = await prisma.userEmailSettings.findUnique({
        where: { userId: req.user.id }
      });
      // Return empty defaults if not yet created
      res.json(settings || {
        fromName: '',
        emailSignature: '',
        phoneNumber: '',
        mobileNumber: '',
        title: '',
        invoiceEmailBody: '',
        estimateEmailBody: '',
        reminderEmailBody: '',
      });
    } catch (e) {
      console.error('GET /users/email-settings error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /users/email-settings — upsert current user's email settings
  router.patch('/email-settings', async (req, res) => {
    try {
      const { fromName, emailSignature, phoneNumber, mobileNumber, title, invoiceEmailBody, estimateEmailBody, reminderEmailBody } = req.body;

      const data = {};
      if (fromName         !== undefined) data.fromName         = fromName;
      if (emailSignature   !== undefined) data.emailSignature   = emailSignature;
      if (phoneNumber      !== undefined) data.phoneNumber      = phoneNumber;
      if (mobileNumber     !== undefined) data.mobileNumber     = mobileNumber;
      if (title            !== undefined) data.title            = title;
      if (invoiceEmailBody !== undefined) data.invoiceEmailBody = invoiceEmailBody;
      if (estimateEmailBody!== undefined) data.estimateEmailBody= estimateEmailBody;
      if (reminderEmailBody!== undefined) data.reminderEmailBody= reminderEmailBody;

      const settings = await prisma.userEmailSettings.upsert({
        where:  { userId: req.user.id },
        update: data,
        create: { userId: req.user.id, ...data },
      });

      res.json(settings);
    } catch (e) {
      console.error('PATCH /users/email-settings error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /users/:id
  router.get('/:id', async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, email: true, name: true, role: true, isActive: true, showInSalesRepDropdown: true, lastLogin: true, createdAt: true, updatedAt: true }
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /users/create-system-user
  router.post('/create-system-user', async (req, res) => {
    try {
      if (!isAdminOrHigher(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
      const existing = await prisma.user.findUnique({ where: { email: 'system@ordertracker.internal' } });
      if (existing) return res.status(400).json({ error: 'System user already exists', userId: existing.id });
      const systemPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await hashPassword(systemPassword);
      const systemUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: 'system@ordertracker.internal', name: 'System (Cron Jobs)', password: hashedPassword, role: 'ADMIN', isActive: true, showInSalesRepDropdown: false },
          select: { id: true, email: true, name: true, role: true }
        });
        await tx.auditLog.create({ data: { entityType: 'User', entityId: user.id, action: 'USER_CREATED', metadata: JSON.stringify({ userName: user.name, userEmail: user.email, userRole: user.role }), performedByUserId: req.user.id, performedByName: req.user.name } });
        return user;
      });
      res.json({ success: true, systemUser, credentials: { email: 'system@ordertracker.internal', password: systemPassword }, warning: 'SAVE THESE CREDENTIALS!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /users
  router.post('/', async (req, res) => {
    try {
      if (!isAdminOrHigher(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
      const { email, name, password, role = 'AGENT', showInSalesRepDropdown = true } = req.body;
      if (!email || !name || !password) return res.status(400).json({ error: 'Email, name, and password are required' });
      const targetRole = role.toUpperCase();
      if (!isValidRole(targetRole)) return res.status(400).json({ error: `Invalid role: ${role}` });
      if (!canCreateRole(req.user.role, targetRole)) return res.status(403).json({ error: `You cannot create users with role ${getRoleDisplayName(targetRole)}` });
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) return res.status(400).json({ error: passwordValidation.message });
      const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) return res.status(400).json({ error: 'Email already in use' });
      const hashedPassword = await hashPassword(password);
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { email: email.toLowerCase(), name, password: hashedPassword, role: targetRole, isActive: true, showInSalesRepDropdown },
          select: { id: true, email: true, name: true, role: true, isActive: true, showInSalesRepDropdown: true, createdAt: true }
        });
        await tx.auditLog.create({ data: { entityType: 'User', entityId: newUser.id, action: 'USER_CREATED', metadata: JSON.stringify({ userName: newUser.name, userEmail: newUser.email, userRole: newUser.role }), performedByUserId: req.user.id, performedByName: req.user.name } });
        return newUser;
      });
      res.status(201).json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /users/:id
  router.patch('/:id', async (req, res) => {
    try {
      if (!isAdminOrHigher(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
      const original = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!original) return res.status(404).json({ error: 'User not found' });
      if (original.email === 'system@ordertracker.internal') return res.status(403).json({ error: 'Cannot edit system user' });
      const isSelfEdit = req.params.id === req.user.id;
      if (!isSelfEdit && !canEditRole(req.user.role, original.role)) return res.status(403).json({ error: `You cannot edit users with role ${getRoleDisplayName(original.role)}` });
      const { name, email, role, isActive, showInSalesRepDropdown, password } = req.body;
      const data = {};
      const changes = [];
      if (name !== undefined && name !== original.name)                       { data.name  = name;                    changes.push({ field: 'name',  oldValue: original.name,  newValue: name }); }
      if (email !== undefined && email.toLowerCase() !== original.email)       { data.email = email.toLowerCase();     changes.push({ field: 'email', oldValue: original.email, newValue: data.email }); }
      if (showInSalesRepDropdown !== undefined && showInSalesRepDropdown !== original.showInSalesRepDropdown) { data.showInSalesRepDropdown = showInSalesRepDropdown; changes.push({ field: 'showInSalesRepDropdown', oldValue: String(original.showInSalesRepDropdown), newValue: String(showInSalesRepDropdown) }); }
      if (role !== undefined && role.toUpperCase() !== original.role) {
        const targetRole = role.toUpperCase();
        if (isSelfEdit) return res.status(403).json({ error: 'You cannot change your own role' });
        if (!isValidRole(targetRole)) return res.status(400).json({ error: `Invalid role: ${role}` });
        if (!canCreateRole(req.user.role, targetRole)) return res.status(403).json({ error: `You cannot assign role ${getRoleDisplayName(targetRole)}` });
        data.role = targetRole;
        changes.push({ field: 'role', oldValue: original.role, newValue: targetRole });
      }
      if (isActive !== undefined && isActive !== original.isActive) {
        if (isSelfEdit) return res.status(403).json({ error: 'You cannot deactivate your own account' });
        if (!canDeactivateUser(req.user.role, original.role)) return res.status(403).json({ error: `You cannot deactivate users with role ${getRoleDisplayName(original.role)}` });
        data.isActive = isActive;
        changes.push({ field: 'isActive', oldValue: String(original.isActive), newValue: String(isActive) });
      }
      if (password) {
        const pv = validatePassword(password);
        if (!pv.isValid) return res.status(400).json({ error: pv.message });
        data.password = await hashPassword(password);
        changes.push({ field: 'password', oldValue: '[hidden]', newValue: '[changed]' });
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields to update' });
      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: req.params.id }, data,
          select: { id: true, email: true, name: true, role: true, isActive: true, showInSalesRepDropdown: true, updatedAt: true }
        });
        if (changes.length > 0) {
          let action = 'USER_UPDATED';
          if (changes.some(c => c.field === 'role'))     action = 'USER_ROLE_CHANGED';
          if (changes.some(c => c.field === 'isActive')) action = data.isActive === false ? 'USER_DEACTIVATED' : 'USER_ACTIVATED';
          await tx.auditLog.create({ data: { entityType: 'User', entityId: req.params.id, action, changes: JSON.stringify(changes), metadata: JSON.stringify({ userName: updated.name, userEmail: updated.email, userRole: updated.role, previousRole: original.role, changedFields: changes.map(c => c.field) }), performedByUserId: req.user.id, performedByName: req.user.name } });
        }
        return updated;
      });
      res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /users/:id (soft delete only)
  router.delete('/:id', async (req, res) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (user && user.email === 'system@ordertracker.internal') return res.status(403).json({ error: 'Cannot delete system user' });
      return res.status(400).json({ error: 'Cannot permanently delete users. Use PATCH to deactivate instead.', hint: 'Send PATCH /:id with { "isActive": false } to deactivate a user' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

export default createUsersRouter;
