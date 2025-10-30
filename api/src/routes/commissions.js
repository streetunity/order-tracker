import express from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { recalculate AllCommissions } from '../helpers/commission.js';

export function createCommissionsRouter(prisma) {
  const router = express.Router();
  
  // Helper function to check if user can manage commissions
  const canManageCommissions = (role) => {
    return ['SUPER_ADMIN', 'ACCOUNTANT'].includes(role);
  };
  
  // ==========================================
  // AGENT ENDPOINTS (All authenticated users)
  // ==========================================
  
  // Get agent's own commissions with item-level breakdown
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
          itemCommissions: {
            include: {
              payouts: {
                orderBy: { stage: 'asc' }
              },
              item: {
                select: {
                  productCode: true,
                  serialNumber: true,
                  currentStage: true
                }
              }
            }
          },
          order: {
            select: {
              poNumber: true,
              orderDate: true,
              currentStage: true,
              discount: true,
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
          itemCommissions: {
            include: {
              payouts: true
            }
          }
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
        
        commission.itemCommissions.forEach(itemComm => {
          itemComm.payouts.forEach(payout => {
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
            itemCommission: {
              commission: {
                salesPersonName: req.user.name
              }
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
          itemCommissions: {
            include: {
              payouts: {
                where: { status: 'WAITING' }
              }
            }
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
          itemCommissions: {
            include: {
              payouts: true
            }
          },
          order: {
            select: {
              poNumber: true,
              orderDate: true,
              currentStage: true,
              discount: true,
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
          itemCommission: {
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
          { itemCommission: { commission: { salesPersonName: 'asc' } } },
          { createdAt: 'asc' }
        ]
      });
      
      // Group by sales person for UI
      const grouped = {};
      payouts.forEach(payout => {
        const name = payout.itemCommission.commission.salesPersonName;
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

  // BULK RECALCULATION ENDPOINT (SUPER_ADMIN only)
  router.post('/recalculate-all', adminGuard, async (req, res) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only Super Admins can recalculate all commissions' });
      }
      
      const { reason, preview } = req.body;
      
      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for bulk recalculation' });
      }
      
      // Preview mode - show what would change without actually changing
      if (preview) {
        const commissions = await prisma.commission.findMany({
          include: {
            order: {
              include: { items: true }
            },
            itemCommissions: {
              include: { payouts: true }
            }
          }
        });
        
        const previewResults = {
          total: commissions.length,
          canRecalculate: 0,
          cannotRecalculate: 0,
          changes: []
        };
        
        for (const commission of commissions) {
          const hasPaidPayouts = commission.itemCommissions.some(ic =>
            ic.payouts.some(p => p.status === 'PAID')
          );
          
          if (hasPaidPayouts) {
            previewResults.cannotRecalculate++;
            previewResults.changes.push({
              orderId: commission.orderId,
              salesPerson: commission.salesPersonName,
              currentAmount: commission.totalCommissionAmount,
              canRecalculate: false,
              reason: 'Has paid payouts'
            });
          } else {
            previewResults.canRecalculate++;
            
            // Calculate what the new amount would be
            const order = commission.order;
            let orderSubtotal = 0;
            let hasAllPrices = true;
            
            for (const item of order.items) {
              if (item.itemPrice && item.itemPrice > 0) {
                orderSubtotal += item.itemPrice * (item.qty || 1);
              } else {
                hasAllPrices = false;
              }
            }
            
            if (hasAllPrices) {
              const orderDiscount = order.discount || 0;
              const orderNetTotal = orderSubtotal - orderDiscount;
              const newAmount = (orderNetTotal * commission.commissionRate) / 100;
              
              previewResults.changes.push({
                orderId: commission.orderId,
                salesPerson: commission.salesPersonName,
                currentAmount: commission.totalCommissionAmount,
                newAmount,
                difference: newAmount - commission.totalCommissionAmount,
                canRecalculate: true
              });
            } else {
              previewResults.changes.push({
                orderId: commission.orderId,
                salesPerson: commission.salesPersonName,
                currentAmount: commission.totalCommissionAmount,
                canRecalculate: true,
                note: 'Will be flagged - missing prices'
              });
            }
          }
        }
        
        return res.json(previewResults);
      }
      
      // Actual recalculation
      const results = await recalculateAllCommissions(req.user.id, req.user.name, reason);
      
      res.json({
        success: true,
        message: 'Bulk recalculation completed',
        results
      });
      
    } catch (error) {
      console.error('Error in bulk recalculation:', error);
      res.status(500).json({ error: 'Failed to recalculate commissions' });
    }
  });
  
  // Continue with other existing endpoints...
  // (Rest of the commission routes remain the same)
  
  return router;
}

export default createCommissionsRouter;
