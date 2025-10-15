const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { logAuditTrail } = require('../helpers/auditHelpers');
const router = express.Router();
const prisma = new PrismaClient();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: {
        name: 'asc'
      },
      include: {
        _count: {
          select: {
            orders: true
          }
        }
      }
    });
    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Get single account
router.get('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
      include: {
        orders: {
          include: {
            account: true,
            orderItems: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        },
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ account });
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// Create new account
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    const account = await prisma.account.create({
      data: {
        name,
        email,
        phone,
        address,
        notes
      }
    });

    await logAuditTrail(req, 'ACCOUNT_CREATED', 'ACCOUNT', account.id, { name });

    res.json({ account });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account
router.patch('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { name, email, phone, address, notes } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (notes !== undefined) updateData.notes = notes;

    const account = await prisma.account.update({
      where: { id: parseInt(accountId) },
      data: updateData
    });

    await logAuditTrail(req, 'ACCOUNT_UPDATED', 'ACCOUNT', account.id, updateData);

    res.json({ account });
  } catch (error) {
    console.error('Error updating account:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
router.delete('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    // Check if account has orders
    const orderCount = await prisma.order.count({
      where: { accountId: parseInt(accountId) }
    });

    if (orderCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete account with existing orders',
        orderCount 
      });
    }

    await prisma.account.delete({
      where: { id: parseInt(accountId) }
    });

    await logAuditTrail(req, 'ACCOUNT_DELETED', 'ACCOUNT', parseInt(accountId), {});

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Get account orders
router.get('/:accountId/orders', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const orders = await prisma.order.findMany({
      where: { accountId: parseInt(accountId) },
      include: {
        orderItems: true,
        account: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.order.count({
      where: { accountId: parseInt(accountId) }
    });

    res.json({ orders, total });
  } catch (error) {
    console.error('Error fetching account orders:', error);
    res.status(500).json({ error: 'Failed to fetch account orders' });
  }
});

// Merge accounts
router.post('/merge', async (req, res) => {
  try {
    const { sourceAccountId, targetAccountId } = req.body;

    if (!sourceAccountId || !targetAccountId) {
      return res.status(400).json({ error: 'Source and target account IDs are required' });
    }

    if (sourceAccountId === targetAccountId) {
      return res.status(400).json({ error: 'Cannot merge an account with itself' });
    }

    // Move all orders from source to target
    const result = await prisma.order.updateMany({
      where: { accountId: parseInt(sourceAccountId) },
      data: { accountId: parseInt(targetAccountId) }
    });

    // Delete the source account
    await prisma.account.delete({
      where: { id: parseInt(sourceAccountId) }
    });

    await logAuditTrail(req, 'ACCOUNTS_MERGED', 'ACCOUNT', parseInt(targetAccountId), { 
      sourceAccountId: parseInt(sourceAccountId),
      ordersTransferred: result.count 
    });

    res.json({ 
      success: true, 
      ordersTransferred: result.count 
    });
  } catch (error) {
    console.error('Error merging accounts:', error);
    res.status(500).json({ error: 'Failed to merge accounts' });
  }
});

module.exports = router;