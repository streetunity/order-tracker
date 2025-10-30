import { Router } from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { canManageCommissions, canManageCommissionSettings, checkCommissionAccess } from '../middleware/commissionAuth.js';
import { buildRoleBasedOrderWhere } from '../utils/roleHelpers.js';

export function createCommissionsRouter(prisma) {
  const router = Router();

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  // Ensure consistent rounding for all money calculations
  const roundMoney = (amount) => {
    return Math.round(amount * 100) / 100;
  };

  // Calculate commission with proper decimal handling
  const calculateCommissionAmount = (base, rate, split = 100) => {
    const amount = (base * rate * split) / 10000;
    return roundMoney(amount);
  };

  // Get commission rate for a sales person
  async function getCommissionRate(salesPersonName) {
    // Check for individual rate
    const customRate = await prisma.commissionRate.findUnique({
      where: { salesPersonName }
    });
    
    if (customRate) {
      return customRate.rate;
    }

    // Return default rate
    return 5.0; // Default 5% if no custom rate
  }

  // Create commission for order
  async function createCommissionForOrder(order) {
    try {
      // Skip if no sales rep
      if (!order.sku) {
        console.log(`Order ${order.id} has no sales rep (sku field empty), skipping commission`);
        return null;
      }

      // Get order items with prices
      const items = await prisma.orderItem.findMany({
        where: { orderId: order.id }
      });

      // Calculate total order value
      const orderTotal = items.reduce((sum, item) => {
        return sum + (item.itemPrice || 0);
      }, 0);

      // Check if all items have prices
      const missingPrices = items.some(item => !item.itemPrice);

      // Get commission rate
      const rate = await getCommissionRate(order.sku);
      const commissionAmount = roundMoney((orderTotal * rate) / 100);

      // Create price snapshot
      const priceSnapshot = items.map(item => ({
        itemId: item.id,
        productCode: item.productCode,
        price: item.itemPrice || 0
      }));

      // Create commission record
      const commission = await prisma.commission.create({
        data: {
          orderId: order.id,
          salesPersonName: order.sku,
          orderTotalAmount: orderTotal,
          commissionRate: rate,
          totalCommissionAmount: commissionAmount,
          status: missingPrices ? 'AWAITING_PRICES' : 'CALCULATED',
          isFlagged: missingPrices,
          flagReason: missingPrices ? 'AWAITING_PRICES' : null,
          itemPricesSnapshot: JSON.stringify(priceSnapshot),
          calculatedAt: missingPrices ? null : new Date()
        }
      });

      // Create payouts if commission is calculated
      if (!missingPrices && commissionAmount > 0) {
        await createCommissionPayouts(commission);
      }

      return commission;
    } catch (error) {
      console.error('Error creating commission:', error);
      throw error;
    }
  }

  // Create commission payouts based on stage distribution
  async function createCommissionPayouts(commission) {
    const stageSettings = await prisma.commissionStageSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    // If no settings, use default 50/50 split
    const stages = stageSettings.length > 0 ? stageSettings : [
      { stage: 'SHIPPING', percentage: 50 },
      { stage: 'DELIVERED', percentage: 50 }
    ];

    for (const config of stages) {
      if (config.percentage > 0) {
        await prisma.commissionPayout.create({
          data: {
            commissionId: commission.id,
            stage: config.stage,
            percentage: config.percentage,
            amount: roundMoney((commission.totalCommissionAmount * config.percentage) / 100),
            status: 'WAITING'
          }
        });
      }
    }
  }

  // Check and recalculate commission if prices changed
  async function checkAndRecalculateCommission(orderId) {
    const commission = await prisma.commission.findFirst({
      where: { orderId }
    });

    if (!commission) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    // Calculate new total
    const orderTotal = order.items.reduce((sum, item) => sum + (item.itemPrice || 0), 0);
    const missingPrices = order.items.some(item => !item.itemPrice);

    if (!missingPrices && commission.status === 'AWAITING_PRICES') {
      // All prices now available - calculate commission
      const rate = await getCommissionRate(commission.salesPersonName);
      const commissionAmount = roundMoney((orderTotal * rate) / 100);

      await prisma.commission.update({
        where: { id: commission.id },
        data: {
          orderTotalAmount: orderTotal,
          commissionRate: rate,
          totalCommissionAmount: commissionAmount,
          status: 'CALCULATED',
          isFlagged: false,
          flagReason: null,
          calculatedAt: new Date()
        }
      });

      // Create payouts
      await createCommissionPayouts(commission);
    } else if (orderTotal !== commission.orderTotalAmount) {
      // Price changed - flag for review
      await prisma.commission.update({
        where: { id: commission.id },
        data: {
          isFlagged: true,
          flagReason: 'PRICE_CHANGED',
          flagDetails: JSON.stringify({
            oldTotal: commission.orderTotalAmount,
            newTotal: orderTotal,
            timestamp: new Date()
          })
        }
      });
    }
  }

  // Check if payout should be triggered
  async function checkCommissionPayoutTrigger(orderId, newStage) {
    const commissions = await prisma.commission.findMany({
      where: { orderId },
      include: { payouts: true }
    });

    for (const commission of commissions) {
      const payouts = commission.payouts.filter(p => 
        p.stage === newStage && p.status === 'WAITING'
      );

      for (const payout of payouts) {
        await prisma.commissionPayout.update({
          where: { id: payout.id },
          data: { status: 'PENDING' }
        });
      }
    }
  }

  // ==========================================
  // VIEWING COMMISSIONS
  // ==========================================

  // Get agent's own commissions
  router.get('/my', authGuard, async (req, res) => {
    try {
      const { status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
      
      const where = {
        salesPersonName: req.user.name,
        status: status || undefined,
        createdAt: {
          gte: dateFrom ? new Date(dateFrom) : undefined,
          lte: dateTo ? new Date(dateTo) : undefined
        }
      };

      const [commissions, total] = await Promise.all([
        prisma.commission.findMany({
          where,
          include: {
            payouts: {
              orderBy: { stage: 'asc' }
            },
            order: {
              select: {
                poNumber: true,
                currentStage: true,
                account: { select: { name: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: parseInt(limit)
        }),
        prisma.commission.count({ where })
      ]);
      
      res.json({
        commissions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching my commissions:', error);
      res.status(500).json({ error: 'Failed to fetch commissions' });
    }
  });

  // Get all commissions (admin only)
  router.get('/all', canManageCommissions, async (req, res) => {
    try {
      const { salesPersonName, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
      
      const where = {
        salesPersonName: salesPersonName || undefined,
        status: status || undefined,
        createdAt: {
          gte: dateFrom ? new Date(dateFrom) : undefined,
          lte: dateTo ? new Date(dateTo) : undefined
        }
      };

      const [commissions, total] = await Promise.all([
        prisma.commission.findMany({
          where,
          include: {
            payouts: {
              orderBy: { stage: 'asc' }
            },
            order: {
              select: {
                poNumber: true,
                currentStage: true,
                account: { select: { name: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: parseInt(limit)
        }),
        prisma.commission.count({ where })
      ]);
      
      res.json({
        commissions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching all commissions:', error);
      res.status(500).json({ error: 'Failed to fetch commissions' });
    }
  });

  // Get pending approval payouts
  router.get('/pending-approval', canManageCommissions, async (req, res) => {
    try {
      const payouts = await prisma.commissionPayout.findMany({
        where: { status: 'PENDING' },
        include: {
          commission: {
            include: {
              order: {
                select: {
                  id: true,
                  poNumber: true,
                  currentStage: true,
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
      const grouped = payouts.reduce((acc, payout) => {
        const name = payout.commission.salesPersonName;
        if (!acc[name]) {
          acc[name] = {
            salesPerson: name,
            payouts: [],
            total: 0
          };
        }
        acc[name].payouts.push(payout);
        acc[name].total += payout.amount;
        return acc;
      }, {});
      
      res.json(Object.values(grouped));
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
  });

  // Get approved payouts (ready to pay)
  router.get('/approved', canManageCommissions, async (req, res) => {
    try {
      const payouts = await prisma.commissionPayout.findMany({
        where: { status: 'APPROVED' },
        include: {
          commission: {
            include: {
              order: {
                select: {
                  id: true,
                  poNumber: true,
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

  // Get paid payouts (payment history)
  router.get('/paid', authGuard, checkCommissionAccess, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const where = {
        status: 'PAID',
        paidAt: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined
        }
      };

      // Filter by sales person if not admin
      if (!req.commissionAccess.canViewAll) {
        where.commission = {
          salesPersonName: req.user.name
        };
      }

      const payouts = await prisma.commissionPayout.findMany({
        where,
        include: {
          commission: {
            include: {
              order: {
                select: {
                  poNumber: true,
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
      console.error('Error fetching paid payouts:', error);
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  });

  // Get flagged commissions
  router.get('/flagged', canManageCommissions, async (req, res) => {
    try {
      const { flagReason } = req.query;
      
      const where = {
        isFlagged: true,
        flagReason: flagReason || undefined
      };

      const commissions = await prisma.commission.findMany({
        where,
        include: {
          order: {
            select: {
              poNumber: true,
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

  // Get orphaned commissions
  router.get('/orphaned', canManageCommissions, async (req, res) => {
    try {
      const commissions = await prisma.commission.findMany({
        where: {
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

  // Get projected commissions
  router.get('/projected', authGuard, checkCommissionAccess, async (req, res) => {
    try {
      const where = {
        status: 'CALCULATED',
        payouts: {
          every: {
            status: 'WAITING'
          }
        }
      };

      // Filter by sales person if not admin
      if (!req.commissionAccess.canViewAll) {
        where.salesPersonName = req.user.name;
      }

      const commissions = await prisma.commission.findMany({
        where,
        include: {
          payouts: true,
          order: {
            select: {
              poNumber: true,
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
            include: {
              account: true,
              items: true
            }
          }
        }
      });

      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }

      // Check access
      if (req.user.role !== 'SUPER_ADMIN' && 
          req.user.role !== 'ACCOUNTANT' && 
          commission.salesPersonName !== req.user.name) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(commission);
    } catch (error) {
      console.error('Error fetching commission details:', error);
      res.status(500).json({ error: 'Failed to fetch commission details' });
    }
  });

  // ==========================================
  // COMMISSION ACTIONS
  // ==========================================

  // Approve payout
  router.post('/payout/:id/approve', canManageCommissions, async (req, res) => {
    try {
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

      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payout.id,
          action: 'COMMISSION_APPROVED',
          metadata: JSON.stringify({ amount: payout.amount, notes: approvalNotes }),
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
  router.post('/payout/:id/pay', canManageCommissions, async (req, res) => {
    try {
      const { paymentMethod, paymentNotes } = req.body;
      
      const payout = await prisma.commissionPayout.update({
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

      // Check if all payouts are paid
      const commission = await prisma.commission.findUnique({
        where: { id: payout.commissionId },
        include: { payouts: true }
      });

      const allPaid = commission.payouts.every(p => 
        p.id === payout.id ? payout.status === 'PAID' : p.status === 'PAID'
      );

      if (allPaid) {
        await prisma.commission.update({
          where: { id: commission.id },
          data: { status: 'FULLY_PAID' }
        });
      } else {
        await prisma.commission.update({
          where: { id: commission.id },
          data: { status: 'PARTIAL_PAID' }
        });
      }

      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: payout.id,
          action: 'COMMISSION_PAID',
          metadata: JSON.stringify({ 
            amount: payout.amount, 
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

  // Reject payout
  router.post('/payout/:id/reject', canManageCommissions, async (req, res) => {
    try {
      const { rejectionReason } = req.body;
      
      const payout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedByUserId: req.user.id,
          rejectedByName: req.user.name,
          rejectionReason
        }
      });
      
      res.json(payout);
    } catch (error) {
      console.error('Error rejecting payout:', error);
      res.status(500).json({ error: 'Failed to reject payout' });
    }
  });

  // Bulk approve payouts
  router.post('/bulk-approve', canManageCommissions, async (req, res) => {
    try {
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
      
      res.json({ approved: result.count, failed: payoutIds.length - result.count });
    } catch (error) {
      console.error('Error bulk approving payouts:', error);
      res.status(500).json({ error: 'Failed to bulk approve payouts' });
    }
  });

  // Bulk pay payouts
  router.post('/bulk-pay', canManageCommissions, async (req, res) => {
    try {
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

      // Update commission statuses
      const payouts = await prisma.commissionPayout.findMany({
        where: { id: { in: payoutIds } },
        include: { commission: { include: { payouts: true } } }
      });

      for (const payout of payouts) {
        const allPaid = payout.commission.payouts.every(p => p.status === 'PAID');
        if (allPaid) {
          await prisma.commission.update({
            where: { id: payout.commission.id },
            data: { status: 'FULLY_PAID' }
          });
        } else if (payout.status === 'PAID') {
          await prisma.commission.update({
            where: { id: payout.commission.id },
            data: { status: 'PARTIAL_PAID' }
          });
        }
      }
      
      res.json({ paid: result.count, failed: payoutIds.length - result.count });
    } catch (error) {
      console.error('Error bulk paying payouts:', error);
      res.status(500).json({ error: 'Failed to bulk pay payouts' });
    }
  });

  // Recalculate commission (SUPER_ADMIN only)
  router.post('/:id/recalculate', canManageCommissionSettings, async (req, res) => {
    try {
      const commission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: { payouts: true, order: { include: { items: true } } }
      });

      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }

      // Check if any payouts are paid
      const hasPaidPayouts = commission.payouts.some(p => p.status === 'PAID');
      if (hasPaidPayouts) {
        return res.status(400).json({ error: 'Cannot recalculate commission with paid payouts' });
      }

      // Calculate new amounts
      const orderTotal = commission.order.items.reduce((sum, item) => 
        sum + (item.itemPrice || 0), 0
      );
      const rate = await getCommissionRate(commission.salesPersonName);
      const commissionAmount = roundMoney((orderTotal * rate) / 100);

      // Update commission
      await prisma.commission.update({
        where: { id: commission.id },
        data: {
          orderTotalAmount: orderTotal,
          commissionRate: rate,
          totalCommissionAmount: commissionAmount,
          lastReviewedAt: new Date(),
          lastReviewedBy: req.user.name
        }
      });

      // Update payout amounts
      for (const payout of commission.payouts) {
        await prisma.commissionPayout.update({
          where: { id: payout.id },
          data: {
            amount: roundMoney((commissionAmount * payout.percentage) / 100)
          }
        });
      }
      
      res.json({ message: 'Commission recalculated successfully' });
    } catch (error) {
      console.error('Error recalculating commission:', error);
      res.status(500).json({ error: 'Failed to recalculate commission' });
    }
  });

  // Unflag commission
  router.post('/:id/unflag', canManageCommissions, async (req, res) => {
    try {
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
      
      res.json(commission);
    } catch (error) {
      console.error('Error unflagging commission:', error);
      res.status(500).json({ error: 'Failed to unflag commission' });
    }
  });

  // Delete orphaned commission (SUPER_ADMIN only)
  router.delete('/:id', canManageCommissionSettings, async (req, res) => {
    try {
      const commission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: { payouts: true }
      });

      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }

      // Check if any payouts are paid
      const hasPaidPayouts = commission.payouts.some(p => p.status === 'PAID');
      if (hasPaidPayouts) {
        return res.status(400).json({ error: 'Cannot delete commission with paid payouts' });
      }

      await prisma.commission.delete({
        where: { id: req.params.id }
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

  // YTD summary
  router.get('/reports/ytd', authGuard, checkCommissionAccess, async (req, res) => {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear());
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      const where = {
        calculatedAt: {
          gte: startDate,
          lte: endDate
        }
      };

      // Filter by sales person if not admin
      if (!req.commissionAccess.canViewAll) {
        where.salesPersonName = req.user.name;
      }

      const [totalCalculated, totalPaid, totalPending, totalProjected] = await Promise.all([
        prisma.commission.aggregate({
          where,
          _sum: { totalCommissionAmount: true }
        }),
        prisma.commissionPayout.aggregate({
          where: {
            status: 'PAID',
            paidAt: { gte: startDate, lte: endDate },
            commission: req.commissionAccess.canViewAll ? {} : { 
              salesPersonName: req.user.name 
            }
          },
          _sum: { amount: true }
        }),
        prisma.commissionPayout.aggregate({
          where: {
            status: { in: ['PENDING', 'APPROVED'] },
            commission: {
              ...where,
              ...(req.commissionAccess.canViewAll ? {} : { 
                salesPersonName: req.user.name 
              })
            }
          },
          _sum: { amount: true }
        }),
        prisma.commission.aggregate({
          where: {
            ...where,
            status: 'CALCULATED',
            payouts: {
              every: { status: 'WAITING' }
            }
          },
          _sum: { totalCommissionAmount: true }
        })
      ]);

      res.json({
        year,
        totalCalculated: totalCalculated._sum.totalCommissionAmount || 0,
        totalPaid: totalPaid._sum.amount || 0,
        totalPending: totalPending._sum.amount || 0,
        totalProjected: totalProjected._sum.totalCommissionAmount || 0
      });
    } catch (error) {
      console.error('Error fetching YTD summary:', error);
      res.status(500).json({ error: 'Failed to fetch YTD summary' });
    }
  });

  // Monthly breakdown
  router.get('/reports/monthly', authGuard, checkCommissionAccess, async (req, res) => {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear());
      const salesPersonName = req.query.salesPersonName;
      
      // Build where clause
      const where = {};
      if (!req.commissionAccess.canViewAll || salesPersonName) {
        where.salesPersonName = salesPersonName || req.user.name;
      }

      // Get all commissions for the year
      const commissions = await prisma.commission.findMany({
        where: {
          ...where,
          calculatedAt: {
            gte: new Date(year, 0, 1),
            lte: new Date(year, 11, 31, 23, 59, 59)
          }
        },
        include: {
          payouts: true
        }
      });

      // Group by month
      const monthlyData = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        calculated: 0,
        paid: 0,
        pending: 0
      }));

      commissions.forEach(commission => {
        const month = new Date(commission.calculatedAt).getMonth();
        monthlyData[month].calculated += commission.totalCommissionAmount;

        commission.payouts.forEach(payout => {
          if (payout.status === 'PAID') {
            const payoutMonth = new Date(payout.paidAt).getMonth();
            monthlyData[payoutMonth].paid += payout.amount;
          } else if (payout.status === 'PENDING' || payout.status === 'APPROVED') {
            monthlyData[month].pending += payout.amount;
          }
        });
      });

      res.json(monthlyData);
    } catch (error) {
      console.error('Error fetching monthly breakdown:', error);
      res.status(500).json({ error: 'Failed to fetch monthly breakdown' });
    }
  });

  // By rep summary
  router.get('/reports/by-rep', canManageCommissions, async (req, res) => {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear());
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      const reps = await prisma.commission.groupBy({
        by: ['salesPersonName'],
        where: {
          calculatedAt: {
            gte: startDate,
            lte: endDate
          }
        },
        _sum: {
          totalCommissionAmount: true
        }
      });

      const results = [];
      for (const rep of reps) {
        const [paid, pending, projected] = await Promise.all([
          prisma.commissionPayout.aggregate({
            where: {
              status: 'PAID',
              paidAt: { gte: startDate, lte: endDate },
              commission: { salesPersonName: rep.salesPersonName }
            },
            _sum: { amount: true }
          }),
          prisma.commissionPayout.aggregate({
            where: {
              status: { in: ['PENDING', 'APPROVED'] },
              commission: { 
                salesPersonName: rep.salesPersonName,
                calculatedAt: { gte: startDate, lte: endDate }
              }
            },
            _sum: { amount: true }
          }),
          prisma.commission.aggregate({
            where: {
              salesPersonName: rep.salesPersonName,
              status: 'CALCULATED',
              calculatedAt: { gte: startDate, lte: endDate },
              payouts: {
                every: { status: 'WAITING' }
              }
            },
            _sum: { totalCommissionAmount: true }
          })
        ]);

        results.push({
          salesPersonName: rep.salesPersonName,
          total: rep._sum.totalCommissionAmount || 0,
          paid: paid._sum.amount || 0,
          pending: pending._sum.amount || 0,
          projected: projected._sum.totalCommissionAmount || 0
        });
      }

      res.json(results);
    } catch (error) {
      console.error('Error fetching by-rep summary:', error);
      res.status(500).json({ error: 'Failed to fetch by-rep summary' });
    }
  });

  // ==========================================
  // INACTIVE USERS
  // ==========================================

  // View commissions for inactive user (SUPER_ADMIN only)
  router.get('/inactive-user/:name', canManageCommissionSettings, async (req, res) => {
    try {
      const commissions = await prisma.commission.findMany({
        where: {
          salesPersonName: req.params.name
        },
        include: {
          payouts: true,
          order: {
            select: {
              poNumber: true,
              account: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(commissions);
    } catch (error) {
      console.error('Error fetching inactive user commissions:', error);
      res.status(500).json({ error: 'Failed to fetch commissions' });
    }
  });

  // Export commission functions for use in other modules
  router.createCommissionForOrder = createCommissionForOrder;
  router.checkAndRecalculateCommission = checkAndRecalculateCommission;
  router.checkCommissionPayoutTrigger = checkCommissionPayoutTrigger;

  return router;
}
