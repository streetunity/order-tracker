import express from 'express';
import { isManufacturer } from '../utils/roleHelpers.js';

export function createAccountsRouter(prisma) {
  const router = express.Router();

  async function getAccessibleAccountIds(user) {
    // Manufacturers have no access to accounts
    if (isManufacturer(user.role)) return [];
    
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'ACCOUNTANT') return null;
    
    // For agents: Get accounts they have orders for
    const orders = await prisma.order.findMany({
      where: { sku: user.name },
      select: { accountId: true },
      distinct: ['accountId']
    });
    const accountsFromOrders = orders.map(o => o.accountId);
    
    // ALSO get accounts they created themselves (from audit log)
    const accountsCreatedByAgent = await prisma.auditLog.findMany({
      where: {
        entityType: 'Account',
        action: 'ACCOUNT_CREATED',
        performedByUserId: user.id
      },
      select: { entityId: true },
      distinct: ['entityId']
    });
    const accountsCreated = accountsCreatedByAgent.map(log => log.entityId);
    
    // Combine both lists (remove duplicates with Set)
    const allAccessibleAccounts = [...new Set([...accountsFromOrders, ...accountsCreated])];
    
    return allAccessibleAccounts;
  }

  async function canAccessAccount(user, accountId) {
    // Manufacturers have no access to accounts
    if (isManufacturer(user.role)) return false;
    
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'ACCOUNTANT') return true;
    
    // Check if they have an order for this account
    const order = await prisma.order.findFirst({
      where: { accountId: accountId, sku: user.name }
    });
    if (order) return true;
    
    // Check if they created this account
    const createdLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Account',
        entityId: accountId,
        action: 'ACCOUNT_CREATED',
        performedByUserId: user.id
      }
    });
    
    return !!createdLog;
  }

  router.get('/', async (req, res) => {
    try {
      // Block manufacturers
      if (isManufacturer(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Manufacturers cannot access customer accounts.' });
      }
      
      const accessibleAccountIds = await getAccessibleAccountIds(req.user);
      const where = {};
      if (accessibleAccountIds !== null) {
        where.id = { in: accessibleAccountIds };
      }
      const accounts = await prisma.account.findMany({
        where,
        select: { id: true, name: true, email: true, address: true, phone: true, machineVoltage: true, notes: true, contactName: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      });
      res.json(accounts);
    } catch (e) {
      console.error('GET /accounts error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const hasAccess = await canAccessAccount(req.user, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only view customers assigned to you.' });
      }
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
        include: { orders: req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN' || req.user.role === 'ACCOUNTANT' ? true : { where: { sku: req.user.name } } }
      });
      if (!account) return res.status(404).json({ error: 'Not found' });
      res.json(account);
    } catch (e) {
      console.error('GET /accounts/:id error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      // Block manufacturers
      if (isManufacturer(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Manufacturers cannot create customer accounts.' });
      }
      
      const { name, email, address, phone, machineVoltage, notes, contactName } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      const account = await prisma.$transaction(async (tx) => {
        const newAccount = await tx.account.create({
          data: { 
            name: String(name).trim(), 
            email: email ? String(email).trim() : null,
            address: address ? String(address).trim() : null,
            phone: phone ? String(phone).trim() : null,
            machineVoltage: machineVoltage ? String(machineVoltage).trim() : null,
            notes: notes ? String(notes).trim() : null,
            contactName: contactName ? String(contactName).trim() : null
          }
        });
        await tx.auditLog.create({
          data: {
            entityType: 'Account',
            entityId: newAccount.id,
            action: 'ACCOUNT_CREATED',
            metadata: JSON.stringify({ entity: 'Account', entityId: newAccount.id, data: { name: newAccount.name, email: newAccount.email, phone: newAccount.phone, contactName: newAccount.contactName } }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        return newAccount;
      });
      res.status(201).json(account);
    } catch (e) {
      console.error('POST /accounts error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const hasAccess = await canAccessAccount(req.user, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only edit customers assigned to you.' });
      }
      const original = await prisma.account.findUnique({ where: { id: req.params.id } });
      if (!original) return res.status(404).json({ error: 'Account not found' });
      const { name, email, address, phone, machineVoltage, notes, contactName } = req.body || {};
      const data = {};
      const changes = [];
      if (name !== undefined && String(name).trim() !== original.name) {
        data.name = String(name).trim();
        changes.push({ field: 'name', oldValue: original.name, newValue: data.name });
      }
      if (email !== undefined) {
        const newEmail = email ? String(email).trim() : null;
        if (newEmail !== original.email) {
          data.email = newEmail;
          changes.push({ field: 'email', oldValue: original.email || 'null', newValue: newEmail || 'null' });
        }
      }
      if (address !== undefined) {
        const newAddress = address ? String(address).trim() : null;
        if (newAddress !== original.address) {
          data.address = newAddress;
          changes.push({ field: 'address', oldValue: original.address || 'null', newValue: newAddress || 'null' });
        }
      }
      if (phone !== undefined) {
        const newPhone = phone ? String(phone).trim() : null;
        if (newPhone !== original.phone) {
          data.phone = newPhone;
          changes.push({ field: 'phone', oldValue: original.phone || 'null', newValue: newPhone || 'null' });
        }
      }
      if (machineVoltage !== undefined) {
        const newVoltage = machineVoltage ? String(machineVoltage).trim() : null;
        if (newVoltage !== original.machineVoltage) {
          data.machineVoltage = newVoltage;
          changes.push({ field: 'machineVoltage', oldValue: original.machineVoltage || 'null', newValue: newVoltage || 'null' });
        }
      }
      if (notes !== undefined) {
        const newNotes = notes ? String(notes).trim() : null;
        if (newNotes !== original.notes) {
          data.notes = newNotes;
          changes.push({ field: 'notes', oldValue: original.notes || 'null', newValue: newNotes || 'null' });
        }
      }
      // Add support for contactName field
      if (contactName !== undefined) {
        const newContactName = contactName ? String(contactName).trim() : null;
        if (newContactName !== original.contactName) {
          data.contactName = newContactName;
          changes.push({ field: 'contactName', oldValue: original.contactName || 'null', newValue: newContactName || 'null' });
        }
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields to update' });
      const account = await prisma.$transaction(async (tx) => {
        const updated = await tx.account.update({ where: { id: req.params.id }, data });
        if (changes.length > 0) {
          await tx.auditLog.create({
            data: { entityType: 'Account', entityId: req.params.id, action: 'ACCOUNT_UPDATED', changes: JSON.stringify(changes), performedByUserId: req.user.id, performedByName: req.user.name }
          });
        }
        return updated;
      });
      res.json(account);
    } catch (e) {
      console.error('Account update error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const hasAccess = await canAccessAccount(req.user, req.params.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied. You can only delete customers assigned to you.' });
      }
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
        include: { orders: { select: { id: true, poNumber: true, createdAt: true }, ...(req.user.role === 'AGENT' ? { where: { sku: user.name } } : {}) } }
      });
      if (!account) return res.status(404).json({ error: 'Account not found' });
      if (account.orders && account.orders.length > 0) {
        const orderDetails = account.orders.slice(0, 3).map(o => `PO#${o.poNumber || 'N/A'} (${new Date(o.createdAt).toLocaleDateString()})`).join(', ');
        const moreOrders = account.orders.length > 3 ? ` and ${account.orders.length - 3} more` : '';
        return res.status(400).json({ error: `Cannot delete customer "${account.name}" because they have ${account.orders.length} associated order(s): ${orderDetails}${moreOrders}. Please delete all orders first.` });
      }
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({ data: { entityType: 'Account', entityId: account.id, action: 'ACCOUNT_DELETED', metadata: JSON.stringify({ message: `Account "${account.name}" deleted (no associated orders)` }), performedByUserId: req.user.id, performedByName: req.user.name } });
        await tx.account.delete({ where: { id: req.params.id } });
      });
      res.status(204).end();
    } catch (e) {
      if (e.code === 'P2003') {
        console.error('Foreign key constraint error:', e);
        return res.status(400).json({ error: 'Cannot delete this customer because they have associated orders. Please delete all orders first.' });
      }
      console.error('Account deletion error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export default createAccountsRouter;
