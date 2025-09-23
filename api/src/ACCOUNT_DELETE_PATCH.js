// PATCH FOR SAFER ACCOUNT DELETION
// 
// This patch file replaces the DELETE /accounts/:id endpoint in api/src/index.js
// to add safety checks for existing orders before allowing customer deletion.
//
// INSTRUCTIONS:
// 1. Locate the existing DELETE /accounts/:id endpoint in api/src/index.js (around line 1537)
// 2. Replace the entire endpoint with the code below
// 3. Restart your API server

// ====================================================================
// REPLACE THIS SECTION IN api/src/index.js
// ====================================================================

// Delete account with safety check for existing orders
app.delete('/accounts/:id', authGuard, async (req, res) => {
  try {
    // First check if the account exists and get associated orders
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
      
      // Delete the account
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
