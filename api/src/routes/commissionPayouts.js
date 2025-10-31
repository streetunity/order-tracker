// Commission Payouts API - handles payout-specific operations
import express from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { calculateCommissionForOrder } from '../helpers/commission.js';

export function createCommissionPayoutsRouter(prisma) {
  const router = express.Router();

  // Helper function to check if user can manage commissions
  const canManageCommissions = (role) => {
    return ['SUPER_ADMIN', 'ACCOUNTANT'].includes(role);
  };

  // Get pending payouts (groups by sales person)
  router.get('/pending', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view pending approvals' });
      }

      const payouts = await prisma.commissionPayout.findMany({
        where: { status: 'PENDING' },
        include: {
          itemCommission: {
            include: {
              commission: {
                include: {
                  order: {
                    select: {
                      id: true,
                      poNumber: true,
                      orderDate: true,
                      account: { select: { name: true } }
                    }
                  }
                }
              },
              item: {
                select: {
                  productCode: true,
                  serialNumber: true,
                  currentStage: true
                }
              }
            }
          }
        },
        orderBy: [
          { createdAt: 'asc' }
        ]
      });

      // Group by sales person for UI
      const grouped = {};
      payouts.forEach(payout => {
        const name = payout.itemCommission.commission.salesPersonName;
        if (!grouped[name]) {
          grouped[name] = {
            salesPerson: name,
            payouts: [],
            total: 0,
            count: 0
          };
        }
        grouped[name].payouts.push(payout);
        grouped[name].total += payout.amount || 0;
        grouped[name].count += 1;
      });

      res.json(Object.values(grouped));
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
  });

  // Approve a single payout
  router.post('/:id/approve', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can approve payouts' });
      }

      const { approvalNotes } = req.body;

      const payout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedByUserId: req.user.id,
          approvedByName: req.user.name,
          approvalNotes
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payout.id,
          action: 'APPROVED',
          metadata: JSON.stringify({ approvalNotes }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json(payout);
    } catch (error) {
      console.error('Error approving payout:', error);
      res.status(500).json({ error: 'Failed to approve payout' });
    }
  });

  // Reject a payout
  router.post('/:id/reject', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can reject payouts' });
      }

      const { rejectionReason } = req.body;

      const payout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'WAITING', // Reset to waiting so it can be retriggered
          rejectedAt: new Date(),
          rejectedByUserId: req.user.id,
          rejectedByName: req.user.name,
          rejectionReason
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payout.id,
          action: 'REJECTED',
          metadata: JSON.stringify({ rejectionReason }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json(payout);
    } catch (error) {
      console.error('Error rejecting payout:', error);
      res.status(500).json({ error: 'Failed to reject payout' });
    }
  });

  // Mark payout as paid
  router.post('/:id/pay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can mark payouts as paid' });
      }

      const { paymentMethod, paymentNotes } = req.body;

      const payout = await prisma.commissionPayout.findUnique({
        where: { id: req.params.id }
      });

      if (payout.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Payout must be approved before marking as paid' });
      }

      const updatedPayout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidByUserId: req.user.id,
          paidByName: req.user.name,
          paymentMethod,
          paymentNotes
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: updatedPayout.id,
          action: 'PAID',
          metadata: JSON.stringify({ paymentMethod, paymentNotes }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error marking payout as paid:', error);
      res.status(500).json({ error: 'Failed to mark payout as paid' });
    }
  });

  // Bulk approve payouts
  router.post('/bulk-approve', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can bulk approve payouts' });
      }

      const { payoutIds, approvalNotes } = req.body;

      const result = await prisma.commissionPayout.updateMany({
        where: {
          id: { in: payoutIds },
          status: 'PENDING'
        },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedByUserId: req.user.id,
          approvedByName: req.user.name,
          approvalNotes
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: 'BULK',
          action: 'BULK_APPROVED',
          metadata: JSON.stringify({ payoutIds, count: result.count, approvalNotes }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json({ updated: result.count });
    } catch (error) {
      console.error('Error bulk approving payouts:', error);
      res.status(500).json({ error: 'Failed to bulk approve payouts' });
    }
  });

  // Bulk mark as paid
  router.post('/bulk-pay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can bulk pay payouts' });
      }

      const { payoutIds, paymentMethod, paymentNotes } = req.body;

      const result = await prisma.commissionPayout.updateMany({
        where: {
          id: { in: payoutIds },
          status: 'APPROVED'
        },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidByUserId: req.user.id,
          paidByName: req.user.name,
          paymentMethod,
          paymentNotes
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: 'BULK',
          action: 'BULK_PAID',
          metadata: JSON.stringify({ payoutIds, count: result.count, paymentMethod, paymentNotes }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json({ paid: result.count });
    } catch (error) {
      console.error('Error bulk paying payouts:', error);
      res.status(500).json({ error: 'Failed to bulk pay payouts' });
    }
  });

  return router;
}

export default createCommissionPayoutsRouter;
