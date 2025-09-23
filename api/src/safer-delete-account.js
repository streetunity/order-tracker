// Safer Delete Account Implementation
// 
// This file contains the updated delete account endpoint that checks for
// existing orders before allowing deletion.
//
// To apply this fix:
// 1. Replace the existing DELETE /accounts/:id endpoint in api/src/index.js (around line 1537)
// 2. Optionally add the helper endpoints below for better account management

// ===================================================================
// REPLACE THE EXISTING DELETE ENDPOINT WITH THIS SAFER VERSION
// ===================================================================

// Delete account with safety check for existing orders
app.delete('/accounts/:id', authGuard, async (req, res) => {
  try {
    // First check if the account exists
    const account = await prisma.account.findUnique({ 
      where: { id: req.params.id },
      include: { 
        orders: {
          select: { id: true, poNumber: true, currentStage: true }
        } 
      }
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Check if there are associated orders
    if (account.orders && account.orders.length > 0) {
      // Block deletion and provide detailed error
      return res.status(400).json({ 
        error: `Cannot delete customer "${account.name}" because they have ${account.orders.length} associated order(s). Please delete or reassign the orders first.`,
        orderCount: account.orders.length,
        orders: account.orders.map(o => ({
          id: o.id,
          poNumber: o.poNumber,
          stage: o.currentStage
        }))
      });
    }

    // Proceed with deletion (no orders exist)
    await prisma.$transaction(async (tx) => {
      // Log deletion using audit system
      await tx.auditLog.create({
        data: {
          entityType: 'Account',
          entityId: account.id,
          action: 'ACCOUNT_DELETED',
          metadata: JSON.stringify({ 
            message: `Account "${account.name}" deleted`,
            hadOrders: false,
            orderCount: 0
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      // Delete the account (will cascade delete orders if schema is updated)
      await tx.account.delete({ where: { id: req.params.id } });
    });
    
    res.status(204).end();
  } catch (e) {
    console.error('Account deletion error:', e);
    
    // Handle foreign key constraint error as fallback
    if (e.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Cannot delete customer due to existing references. Please ensure all orders are deleted first.' 
      });
    }
    
    res.status(500).json({ error: e.message });
  }
});

// ===================================================================
// OPTIONAL: ADD THESE HELPER ENDPOINTS FOR BETTER ACCOUNT MANAGEMENT
// ===================================================================

// Get all orders for a specific account
app.get('/accounts/:id/orders', authGuard, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { accountId: req.params.id },
      include: {
        items: true,
        statusEvents: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reassign orders from one account to another (ADMIN ONLY)
app.post('/accounts/:id/reassign-orders', adminGuard, async (req, res) => {
  try {
    const { targetAccountId } = req.body;
    
    if (!targetAccountId) {
      return res.status(400).json({ error: 'targetAccountId is required' });
    }
    
    // Verify both accounts exist
    const [sourceAccount, targetAccount] = await Promise.all([
      prisma.account.findUnique({ where: { id: req.params.id } }),
      prisma.account.findUnique({ where: { id: targetAccountId } })
    ]);
    
    if (!sourceAccount) {
      return res.status(404).json({ error: 'Source account not found' });
    }
    
    if (!targetAccount) {
      return res.status(404).json({ error: 'Target account not found' });
    }
    
    // Reassign all orders
    const result = await prisma.$transaction(async (tx) => {
      // Update all orders
      const updateResult = await tx.order.updateMany({
        where: { accountId: req.params.id },
        data: { accountId: targetAccountId }
      });
      
      // Log the reassignment
      await tx.auditLog.create({
        data: {
          entityType: 'Account',
          entityId: req.params.id,
          action: 'ORDERS_REASSIGNED',
          metadata: JSON.stringify({
            message: `Reassigned ${updateResult.count} orders from "${sourceAccount.name}" to "${targetAccount.name}"`,
            sourceAccountId: req.params.id,
            sourceAccountName: sourceAccount.name,
            targetAccountId: targetAccountId,
            targetAccountName: targetAccount.name,
            orderCount: updateResult.count
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      return updateResult;
    });
    
    res.json({ 
      success: true, 
      ordersReassigned: result.count,
      message: `Successfully reassigned ${result.count} orders from "${sourceAccount.name}" to "${targetAccount.name}"`
    });
  } catch (e) {
    console.error('Order reassignment error:', e);
    res.status(500).json({ error: e.message });
  }
});
