import express from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';

export function createCommissionsRouter(prisma) {
  const router = express.Router();
  
  // Helper function to check if user can manage commissions
  const canManageCommissions = (role) => {
    return ['SUPER_ADMIN', 'ACCOUNTANT'].includes(role);
  };
  
  // ==========================================
  // AGENT ENDPOINTS (All authenticated users)
  // ==========================================
  
  // Get agent's own commissions
  router.get('/my', authGuard, async (req, res) => {
    try {
      const { status, dateFrom, dateTo, year } = req.query;
      
      const whereClause = {
        salesPersonName: req.user.name,
        status: status || undefined
      };
      
      // Add date filters if provided
      if (dateFrom || dateTo) {
        whereClause.createdAt = {};
        if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
        if (dateTo) whereClause.createdAt.lte = new Date(dateTo);
      } else if (year) {
        // If year is provided, filter by that year
        const yearNum = parseInt(year);
        whereClause.createdAt = {
          gte: new Date(`${yearNum}-01-01`),
          lt: new Date(`${yearNum + 1}-01-01`)
        };
      }
      
      const commissions = await prisma.commission.findMany({
        where: whereClause,
        include: {
          payouts: {
            orderBy: { stage: 'asc' }
          },
          order: {
            select: {
              poNumber: true,
              orderDate: true,
              currentStage: true,
              account: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(commissions);
    } catch (error) {
      console.error('Error fetching user commissions:', error);
      res.status(500).json({ error: 'Failed to fetch commissions' });
    }
  });
  
  // Get agent's earnings summary
  router.get('/my/summary', authGuard, async (req, res) => {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const ytdStart = new Date(`${year}-01-01`);
      const ytdEnd = new Date(`${year + 1}-01-01`);
      
      // Get all commissions for the year
      const commissions = await prisma.commission.findMany({
        where: {
          salesPersonName: req.user.name,
          createdAt: {
            gte: ytdStart,
            lt: ytdEnd
          }
        },
        include: {
          payouts: true
        }
      });
      
      // Calculate totals
      let totalCalculated = 0;
      let totalPending = 0;
      let totalApproved = 0;
      let totalPaid = 0;
      let totalProjected = 0;
      
      commissions.forEach(commission => {
        totalCalculated += commission.totalCommissionAmount || 0;
        
        commission.payouts.forEach(payout => {
          switch (payout.status) {
            case 'WAITING':
              totalProjected += payout.amount || 0;
              break;
            case 'PENDING':
              totalPending += payout.amount || 0;
              break;
            case 'APPROVED':
              totalApproved += payout.amount || 0;
              break;
            case 'PAID':
              totalPaid += payout.amount || 0;
              break;
          }
        });
      });
      
      res.json({
        year,
        totalCalculated,
        totalPending,
        totalApproved,
        totalPaid,
        totalProjected,
        totalUnpaid: totalPending + totalApproved
      });
    } catch (error) {
      console.error('Error fetching earnings summary:', error);
      res.status(500).json({ error: 'Failed to fetch earnings summary' });
    }
  });
  
  // Get agent's monthly breakdown
  router.get('/my/monthly', authGuard, async (req, res) => {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      
      const monthlyData = [];
      
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 1);
        
        const payouts = await prisma.commissionPayout.findMany({
          where: {
            commission: {
              salesPersonName: req.user.name
            },
            paidAt: {
              gte: startDate,
              lt: endDate
            },
            status: 'PAID'
          }
        });
        
        const total = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        monthlyData.push({
          month: month + 1,
          monthName: startDate.toLocaleString('default', { month: 'short' }),
          amount: total
        });
      }
      
      res.json(monthlyData);
    } catch (error) {
      console.error('Error fetching monthly breakdown:', error);
      res.status(500).json({ error: 'Failed to fetch monthly breakdown' });
    }
  });
  
  // Get projected commissions (calculated but not yet triggered)
  router.get('/projected', authGuard, async (req, res) => {
    try {
      const whereClause = {
        status: 'CALCULATED'
      };
      
      // Non-admin users can only see their own
      if (!canManageCommissions(req.user.role)) {
        whereClause.salesPersonName = req.user.name;
      }
      
      const commissions = await prisma.commission.findMany({
        where: whereClause,
        include: {
          payouts: {
            where: { status: 'WAITING' }
          },
          order: {
            select: {
              poNumber: true,
              orderDate: true,
              currentStage: true,
              account: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(commissions);
    } catch (error) {
      console.error('Error fetching projected commissions:', error);
      res.status(500).json({ error: 'Failed to fetch projected commissions' });
    }
  });
  
  // ==========================================
  // ADMIN ENDPOINTS (SUPER_ADMIN & ACCOUNTANT)
  // ==========================================
  
  // Get all commissions (admin only)
  router.get('/all', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view all commissions' });
      }
      
      const { salesPersonName, status, dateFrom, dateTo } = req.query;
      
      const whereClause = {};
      if (salesPersonName) whereClause.salesPersonName = salesPersonName;
      if (status) whereClause.status = status;
      if (dateFrom || dateTo) {
        whereClause.createdAt = {};
        if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
        if (dateTo) whereClause.createdAt.lte = new Date(dateTo);
      }
      
      const commissions = await prisma.commission.findMany({
        where: whereClause,
        include: {
          payouts: true,
          order: {
            select: {
              poNumber: true,
              orderDate: true,
              currentStage: true,
              account: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(commissions);
    } catch (error) {
      console.error('Error fetching all commissions:', error);
      res.status(500).json({ error: 'Failed to fetch commissions' });
    }
  });
  
  // Get pending approval payouts
  router.get('/pending-approval', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view pending approvals' });
      }
      
      const payouts = await prisma.commissionPayout.findMany({
        where: { status: 'PENDING' },
        include: {
          commission: {
            include: {
              order: {
                select: {
                  poNumber: true,
                  orderDate: true,
                  account: { select: { name: true } }
                }
              }
            }
          }
        },
        orderBy: [
          { commission: { salesPersonName: 'asc' } },
          { createdAt: 'asc' }
        ]
      });
      
      // Group by sales person for UI
      const grouped = {};
      payouts.forEach(payout => {
        const name = payout.commission.salesPersonName;
        if (!grouped[name]) {
          grouped[name] = {
            salesPersonName: name,
            payouts: [],
            totalAmount: 0,
            count: 0
          };
        }
        grouped[name].payouts.push(payout);
        grouped[name].totalAmount += payout.amount || 0;
        grouped[name].count += 1;
      });
      
      res.json(Object.values(grouped));
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
  });
  
  // Get approved payouts (ready to pay)
  router.get('/approved', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view approved payouts' });
      }
      
      const payouts = await prisma.commissionPayout.findMany({
        where: { status: 'APPROVED' },
        include: {
          commission: {
            include: {
              order: {
                select: {
                  poNumber: true,
                  orderDate: true,
                  account: { select: { name: true } }
                }
              }
            }
          }
        },
        orderBy: { approvedAt: 'asc' }
      });
      
      res.json(payouts);
    } catch (error) {
      console.error('Error fetching approved payouts:', error);
      res.status(500).json({ error: 'Failed to fetch approved payouts' });
    }
  });
  
  // Get paid commissions
  router.get('/paid', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view paid commissions' });
      }
      
      const { startDate, endDate, salesPersonName } = req.query;
      
      const whereClause = { status: 'PAID' };
      if (salesPersonName) {
        whereClause.commission = { salesPersonName };
      }
      if (startDate || endDate) {
        whereClause.paidAt = {};
        if (startDate) whereClause.paidAt.gte = new Date(startDate);
        if (endDate) whereClause.paidAt.lte = new Date(endDate);
      }
      
      const payouts = await prisma.commissionPayout.findMany({
        where: whereClause,
        include: {
          commission: {
            include: {
              order: {
                select: {
                  poNumber: true,
                  orderDate: true,
                  account: { select: { name: true } }
                }
              }
            }
          }
        },
        orderBy: { paidAt: 'desc' }
      });
      
      res.json(payouts);
    } catch (error) {
      console.error('Error fetching paid commissions:', error);
      res.status(500).json({ error: 'Failed to fetch paid commissions' });
    }
  });
  
  // Get flagged commissions
  router.get('/flagged', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view flagged commissions' });
      }
      
      const { flagReason } = req.query;
      
      const whereClause = { isFlagged: true };
      if (flagReason) whereClause.flagReason = flagReason;
      
      const commissions = await prisma.commission.findMany({
        where: whereClause,
        include: {
          payouts: true,
          order: {
            select: {
              poNumber: true,
              orderDate: true,
              account: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(commissions);
    } catch (error) {
      console.error('Error fetching flagged commissions:', error);
      res.status(500).json({ error: 'Failed to fetch flagged commissions' });
    }
  });
  
  // Get orphaned commissions (order deleted)
  router.get('/orphaned', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view orphaned commissions' });
      }
      
      const commissions = await prisma.commission.findMany({
        where: {
          isFlagged: true,
          flagReason: 'ORDER_DELETED'
        },
        include: {
          payouts: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(commissions);
    } catch (error) {
      console.error('Error fetching orphaned commissions:', error);
      res.status(500).json({ error: 'Failed to fetch orphaned commissions' });
    }
  });
  
  // Get single commission details
  router.get('/:id', authGuard, async (req, res) => {
    try {
      const commission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: {
          payouts: {
            orderBy: { stage: 'asc' }
          },
          order: {
            select: {
              id: true,
              poNumber: true,
              orderDate: true,
              currentStage: true,
              account: { select: { name: true } },
              items: {
                select: {
                  productCode: true,
                  qty: true,
                  itemPrice: true
                }
              }
            }
          }
        }
      });
      
      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }
      
      // Check access - users can only see their own unless admin
      if (commission.salesPersonName !== req.user.name && !canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      res.json(commission);
    } catch (error) {
      console.error('Error fetching commission:', error);
      res.status(500).json({ error: 'Failed to fetch commission' });
    }
  });
  
  // ==========================================
  // COMMISSION ACTIONS (Admin only)
  // ==========================================
  
  // Approve a payout
  router.post('/payout/:id/approve', adminGuard, async (req, res) => {
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
        },
        include: {
          commission: true
        }
      });
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payout.id,
          parentEntityId: payout.commissionId,
          action: 'PAYOUT_APPROVED',
          metadata: JSON.stringify({
            amount: payout.amount,
            stage: payout.stage,
            salesPersonName: payout.commission.salesPersonName,
            notes: approvalNotes
          }),
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
  
  // Mark payout as paid
  router.post('/payout/:id/pay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can mark payouts as paid' });
      }
      
      const { paymentMethod, paymentNotes } = req.body;
      
      if (!paymentMethod) {
        return res.status(400).json({ error: 'Payment method is required' });
      }
      
      const payout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidByUserId: req.user.id,
          paidByName: req.user.name,
          paymentMethod,
          paymentNotes
        },
        include: {
          commission: true
        }
      });
      
      // Check if all payouts are paid and update commission status
      const allPayouts = await prisma.commissionPayout.findMany({
        where: { commissionId: payout.commissionId }
      });
      
      const allPaid = allPayouts.every(p => p.status === 'PAID');
      if (allPaid) {
        await prisma.commission.update({
          where: { id: payout.commissionId },
          data: { status: 'FULLY_PAID' }
        });
      } else {
        // Check if at least one is paid
        const somePaid = allPayouts.some(p => p.status === 'PAID');
        if (somePaid) {
          await prisma.commission.update({
            where: { id: payout.commissionId },
            data: { status: 'PARTIAL_PAID' }
          });
        }
      }
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payout.id,
          parentEntityId: payout.commissionId,
          action: 'PAYOUT_PAID',
          metadata: JSON.stringify({
            amount: payout.amount,
            stage: payout.stage,
            salesPersonName: payout.commission.salesPersonName,
            paymentMethod,
            notes: paymentNotes
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json(payout);
    } catch (error) {
      console.error('Error marking payout as paid:', error);
      res.status(500).json({ error: 'Failed to mark payout as paid' });
    }
  });
  
  // Reject a payout
  router.post('/payout/:id/reject', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can reject payouts' });
      }
      
      const { rejectionReason } = req.body;
      
      if (!rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
      }
      
      const payout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedByUserId: req.user.id,
          rejectedByName: req.user.name,
          rejectionReason
        },
        include: {
          commission: true
        }
      });
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payout.id,
          parentEntityId: payout.commissionId,
          action: 'PAYOUT_REJECTED',
          metadata: JSON.stringify({
            amount: payout.amount,
            stage: payout.stage,
            salesPersonName: payout.commission.salesPersonName,
            reason: rejectionReason
          }),
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
  
  // Bulk approve payouts
  router.post('/bulk-approve', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can bulk approve' });
      }
      
      const { payoutIds, approvalNotes } = req.body;
      
      if (!payoutIds || !Array.isArray(payoutIds) || payoutIds.length === 0) {
        return res.status(400).json({ error: 'Payout IDs array is required' });
      }
      
      const updated = await prisma.commissionPayout.updateMany({
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
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payoutIds.join(','),
          action: 'BULK_APPROVE',
          metadata: JSON.stringify({
            count: updated.count,
            payoutIds,
            notes: approvalNotes
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json({ approved: updated.count, requested: payoutIds.length });
    } catch (error) {
      console.error('Error bulk approving:', error);
      res.status(500).json({ error: 'Failed to bulk approve payouts' });
    }
  });
  
  // Bulk pay payouts
  router.post('/bulk-pay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can bulk pay' });
      }
      
      const { payoutIds, paymentMethod, paymentNotes } = req.body;
      
      if (!payoutIds || !Array.isArray(payoutIds) || payoutIds.length === 0) {
        return res.status(400).json({ error: 'Payout IDs array is required' });
      }
      
      if (!paymentMethod) {
        return res.status(400).json({ error: 'Payment method is required' });
      }
      
      const updated = await prisma.commissionPayout.updateMany({
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
      
      // Update commission statuses
      const payouts = await prisma.commissionPayout.findMany({
        where: { id: { in: payoutIds } },
        select: { commissionId: true }
      });
      
      const uniqueCommissionIds = [...new Set(payouts.map(p => p.commissionId))];
      
      for (const commissionId of uniqueCommissionIds) {
        const allPayouts = await prisma.commissionPayout.findMany({
          where: { commissionId }
        });
        
        const allPaid = allPayouts.every(p => p.status === 'PAID');
        const somePaid = allPayouts.some(p => p.status === 'PAID');
        
        if (allPaid) {
          await prisma.commission.update({
            where: { id: commissionId },
            data: { status: 'FULLY_PAID' }
          });
        } else if (somePaid) {
          await prisma.commission.update({
            where: { id: commissionId },
            data: { status: 'PARTIAL_PAID' }
          });
        }
      }
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payoutIds.join(','),
          action: 'BULK_PAY',
          metadata: JSON.stringify({
            count: updated.count,
            payoutIds,
            paymentMethod,
            notes: paymentNotes
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json({ paid: updated.count, requested: payoutIds.length });
    } catch (error) {
      console.error('Error bulk paying:', error);
      res.status(500).json({ error: 'Failed to bulk pay payouts' });
    }
  });
  
  // Recalculate commission (SUPER_ADMIN only)
  router.post('/:id/recalculate', adminGuard, async (req, res) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only Super Admins can recalculate commissions' });
      }
      
      const commission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: {
          order: {
            include: {
              items: true
            }
          },
          payouts: true
        }
      });
      
      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }
      
      // Check if any payout is already paid
      const hasPaidPayouts = commission.payouts.some(p => p.status === 'PAID');
      if (hasPaidPayouts) {
        return res.status(400).json({ error: 'Cannot recalculate commission with paid payouts' });
      }
      
      // Recalculate using global function if available
      if (global.recalculateCommissionIfPriceChanged) {
        await global.recalculateCommissionIfPriceChanged(prisma, commission.orderId);
        
        // Fetch updated commission
        const updated = await prisma.commission.findUnique({
          where: { id: req.params.id },
          include: { payouts: true }
        });
        
        res.json(updated);
      } else {
        res.status(500).json({ error: 'Recalculation function not available' });
      }
    } catch (error) {
      console.error('Error recalculating commission:', error);
      res.status(500).json({ error: 'Failed to recalculate commission' });
    }
  });
  
  // Unflag commission
  router.post('/:id/unflag', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can unflag commissions' });
      }
      
      const { reviewNotes } = req.body;
      
      const commission = await prisma.commission.update({
        where: { id: req.params.id },
        data: {
          isFlagged: false,
          flagReason: null,
          flagDetails: null,
          lastReviewedAt: new Date(),
          lastReviewedBy: req.user.name,
          reviewNotes
        }
      });
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'Commission',
          entityId: commission.id,
          action: 'COMMISSION_UNFLAGGED',
          metadata: JSON.stringify({
            salesPersonName: commission.salesPersonName,
            notes: reviewNotes
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json(commission);
    } catch (error) {
      console.error('Error unflagging commission:', error);
      res.status(500).json({ error: 'Failed to unflag commission' });
    }
  });
  
  // Delete orphaned commission (SUPER_ADMIN only)
  router.delete('/:id', adminGuard, async (req, res) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only Super Admins can delete commissions' });
      }
      
      const commission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: { payouts: true }
      });
      
      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }
      
      // Check if any payout is paid
      const hasPaidPayouts = commission.payouts.some(p => p.status === 'PAID');
      if (hasPaidPayouts) {
        return res.status(400).json({ error: 'Cannot delete commission with paid payouts' });
      }
      
      // Delete commission (payouts will cascade delete)
      await prisma.commission.delete({
        where: { id: req.params.id }
      });
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'Commission',
          entityId: req.params.id,
          action: 'COMMISSION_DELETED',
          metadata: JSON.stringify({
            salesPersonName: commission.salesPersonName,
            amount: commission.totalCommissionAmount
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json({ message: 'Commission deleted successfully' });
    } catch (error) {
      console.error('Error deleting commission:', error);
      res.status(500).json({ error: 'Failed to delete commission' });
    }
  });
  
  // ==========================================
  // REPORTS
  // ==========================================
  
  // YTD summary report
  router.get('/reports/ytd', authGuard, async (req, res) => {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const ytdStart = new Date(`${year}-01-01`);
      const ytdEnd = new Date(`${year + 1}-01-01`);
      
      const whereClause = {
        createdAt: {
          gte: ytdStart,
          lt: ytdEnd
        }
      };
      
      // Non-admin users can only see their own
      if (!canManageCommissions(req.user.role)) {
        whereClause.salesPersonName = req.user.name;
      }
      
      const commissions = await prisma.commission.findMany({
        where: whereClause,
        include: { payouts: true }
      });
      
      let totalCalculated = 0;
      let totalPaid = 0;
      let totalPending = 0;
      let totalProjected = 0;
      
      commissions.forEach(commission => {
        totalCalculated += commission.totalCommissionAmount || 0;
        
        commission.payouts.forEach(payout => {
          if (payout.status === 'PAID') {
            totalPaid += payout.amount || 0;
          } else if (payout.status === 'PENDING' || payout.status === 'APPROVED') {
            totalPending += payout.amount || 0;
          } else if (payout.status === 'WAITING') {
            totalProjected += payout.amount || 0;
          }
        });
      });
      
      res.json({
        year,
        totalCalculated,
        totalPaid,
        totalPending,
        totalProjected
      });
    } catch (error) {
      console.error('Error generating YTD report:', error);
      res.status(500).json({ error: 'Failed to generate YTD report' });
    }
  });
  
  // Monthly breakdown report
  router.get('/reports/monthly', authGuard, async (req, res) => {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      
      const whereClause = {};
      
      // Non-admin users can only see their own
      if (!canManageCommissions(req.user.role)) {
        whereClause.commission = { salesPersonName: req.user.name };
      }
      
      const monthlyData = [];
      
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 1);
        
        const payouts = await prisma.commissionPayout.findMany({
          where: {
            ...whereClause,
            paidAt: {
              gte: startDate,
              lt: endDate
            },
            status: 'PAID'
          }
        });
        
        const total = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        monthlyData.push({
          month: month + 1,
          monthName: startDate.toLocaleString('default', { month: 'short' }),
          amount: total
        });
      }
      
      res.json(monthlyData);
    } catch (error) {
      console.error('Error generating monthly report:', error);
      res.status(500).json({ error: 'Failed to generate monthly report' });
    }
  });
  
  // By sales rep report (admin only)
  router.get('/reports/by-rep', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view this report' });
      }
      
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const ytdStart = new Date(`${year}-01-01`);
      const ytdEnd = new Date(`${year + 1}-01-01`);
      
      const commissions = await prisma.commission.findMany({
        where: {
          createdAt: {
            gte: ytdStart,
            lt: ytdEnd
          }
        },
        include: { payouts: true }
      });
      
      const repData = {};
      
      commissions.forEach(commission => {
        const rep = commission.salesPersonName;
        if (!repData[rep]) {
          repData[rep] = {
            salesPersonName: rep,
            totalCalculated: 0,
            totalPaid: 0,
            totalPending: 0,
            totalProjected: 0,
            orderCount: 0
          };
        }
        
        repData[rep].orderCount += 1;
        repData[rep].totalCalculated += commission.totalCommissionAmount || 0;
        
        commission.payouts.forEach(payout => {
          if (payout.status === 'PAID') {
            repData[rep].totalPaid += payout.amount || 0;
          } else if (payout.status === 'PENDING' || payout.status === 'APPROVED') {
            repData[rep].totalPending += payout.amount || 0;
          } else if (payout.status === 'WAITING') {
            repData[rep].totalProjected += payout.amount || 0;
          }
        });
      });
      
      res.json(Object.values(repData));
    } catch (error) {
      console.error('Error generating by-rep report:', error);
      res.status(500).json({ error: 'Failed to generate by-rep report' });
    }
  });
  
  return router;
}

export default createCommissionsRouter;
