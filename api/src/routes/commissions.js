import express from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { recalculateAllCommissions, calculateCommissionForOrder } from '../helpers/commission.js';

export function createCommissionsRouter(prisma) {
  const router = express.Router();
  
  // Helper function to check if user can manage commissions
  const canManageCommissions = (role) => {
    return ['SUPER_ADMIN', 'ACCOUNTANT'].includes(role);
  };

  // Attach a 0-based positional phaseIndex to each payout, derived from the
  // creation order of its item commission's full payout set (creation order
  // mirrors stage order). Lets the UI place legacy payouts -- whose stored
  // stage names predate the current stage settings -- in the correct P# column
  // instead of leaving them blank.
  async function attachPhaseIndex(payouts) {
    const icIds = [...new Set(payouts.map(p => p.itemCommissionId).filter(Boolean))];
    if (icIds.length === 0) return payouts;
    const siblings = await prisma.commissionPayout.findMany({
      where: { itemCommissionId: { in: icIds } },
      select: { id: true, itemCommissionId: true },
      orderBy: [{ itemCommissionId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const orderMap = {};
    for (const s of siblings) (orderMap[s.itemCommissionId] ||= []).push(s.id);
    for (const p of payouts) {
      const arr = orderMap[p.itemCommissionId] || [p.id];
      const idx = arr.indexOf(p.id);
      p.phaseIndex = idx >= 0 ? idx : 0;
      p.phaseCount = arr.length;
    }
    return payouts;
  }
  
  // ==========================================
  // AGENT ENDPOINTS (All authenticated users)
  // ==========================================
  
  // Get agent's own commissions with item-level breakdown
  router.get('/my', authGuard, async (req, res) => {
    try {
      const { status, dateFrom, dateTo, year } = req.query;

      const whereClause = {
        OR: [
          { salesPersonName: req.user.name },
          { reps: { some: { salesPersonName: req.user.name } } }
        ],
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

      // Add computed payout status for each commission
      const commissionsWithStatus = commissions.map(commission => {
        // Collect all payouts from all item commissions
        const allPayouts = commission.itemCommissions.flatMap(ic => ic.payouts || []);

        let payoutStatus = 'CALCULATED';
        if (allPayouts.length > 0) {
          const hasApproved = allPayouts.some(p => p.status === 'APPROVED');
          const hasPending = allPayouts.some(p => p.status === 'PENDING');
          const allPaid = allPayouts.every(p => p.status === 'PAID');

          if (allPaid) {
            payoutStatus = 'PAID';
          } else if (hasApproved) {
            payoutStatus = 'APPROVED';
          } else if (hasPending) {
            payoutStatus = 'PENDING';
          }
        }

        return {
          ...commission,
          status: payoutStatus
        };
      });

      res.json(commissionsWithStatus);
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
      const payouts = await prisma.commissionPayout.findMany({
        where: {
          salesPersonName: req.user.name,
          itemCommission: { commission: { createdAt: { gte: ytdStart, lt: ytdEnd } } }
        },
        select: { amount: true, status: true }
      });
      
      // Calculate totals
      let totalCalculated = 0;
      let totalPending = 0;
      let totalApproved = 0;
      let totalPaid = 0;
      let totalProjected = 0;
      
      payouts.forEach(payout => {
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
      totalCalculated = totalProjected + totalPending + totalApproved + totalPaid;
      
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
            salesPersonName: req.user.name,
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
          name: startDate.toLocaleString('default', { month: 'short' }),
          total: total
        });
      }
      
      res.json(monthlyData);
    } catch (error) {
      console.error('Error fetching monthly breakdown:', error);
      res.status(500).json({ error: 'Failed to fetch monthly breakdown' });
    }
  });

  // Get agent's own paid payouts for PDF report generation
  router.get('/my/paid', authGuard, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const payouts = await prisma.commissionPayout.findMany({
        where: {
          status: 'PAID',
          paidAt: {
            gte: new Date(startDate),
            lte: new Date(endDate + 'T23:59:59.999Z'), // Include entire end date
          },
          salesPersonName: req.user.name,
        },
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
                      account: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          paidAt: 'asc',
        },
      });

      res.json(payouts);
    } catch (error) {
      console.error('Error fetching agent paid commissions:', error);
      res.status(500).json({ error: 'Failed to fetch paid commissions' });
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
        whereClause.reps = { some: { salesPersonName: req.user.name } };
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

  // Get flagged commissions
  router.get('/flagged', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view flagged commissions' });
      }

      const commissions = await prisma.commission.findMany({
        where: { 
          isFlagged: true 
        },
        include: {
          itemCommissions: {
            include: {
              payouts: true,
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
              account: { select: { name: true } }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      res.json(commissions);
    } catch (error) {
      console.error('Error fetching flagged commissions:', error);
      res.status(500).json({ error: 'Failed to fetch flagged commissions' });
    }
  });

  // Get approved payouts
  router.get('/approved', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view approved payouts' });
      }

      const payouts = await prisma.commissionPayout.findMany({
        where: { status: 'APPROVED' },
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
        orderBy: { approvedAt: 'desc' }
      });

      await attachPhaseIndex(payouts);

      res.json(payouts);
    } catch (error) {
      console.error('Error fetching approved payouts:', error);
      res.status(500).json({ error: 'Failed to fetch approved payouts' });
    }
  });

  // Get paid payouts
  router.get('/paid', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view paid payouts' });
      }

      const { salesPersonName, dateFrom, dateTo } = req.query;
      
      const whereClause = { status: 'PAID' };
      
      if (salesPersonName) {
        whereClause.itemCommission = {
          commission: {
            salesPersonName
          }
        };
      }

      if (dateFrom || dateTo) {
        whereClause.paidAt = {};
        if (dateFrom) whereClause.paidAt.gte = new Date(dateFrom);
        if (dateTo) whereClause.paidAt.lte = new Date(dateTo);
      }

      const payouts = await prisma.commissionPayout.findMany({
        where: whereClause,
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
        orderBy: { paidAt: 'desc' }
      });

      await attachPhaseIndex(payouts);

      res.json(payouts);
    } catch (error) {
      console.error('Error fetching paid payouts:', error);
      res.status(500).json({ error: 'Failed to fetch paid payouts' });
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
          orderId: null
        },
        include: {
          itemCommissions: {
            include: {
              payouts: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(commissions);
    } catch (error) {
      console.error('Error fetching orphaned commissions:', error);
      res.status(500).json({ error: 'Failed to fetch orphaned commissions' });
    }
  });

  // Get commission for specific order
  router.get('/order/:orderId', authGuard, async (req, res) => {
    try {
      const { orderId } = req.params;

      // Only admins and accountants can view commissions
      if (!canManageCommissions(req.user.role) && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const commission = await prisma.commission.findFirst({
        where: { orderId },
        include: {
          itemCommissions: {
            include: {
              payouts: {
                orderBy: { stage: 'asc' }
              }
            }
          }
        }
      });

      if (!commission) {
        return res.status(404).json({ error: 'No commission found for this order' });
      }

      res.json(commission);
    } catch (error) {
      console.error('Error fetching commission for order:', error);
      res.status(500).json({ error: 'Failed to fetch commission' });
    }
  });

  // Unflag a commission
  router.post('/:id/unflag', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can unflag commissions' });
      }

      const { reviewNotes } = req.body;

      // Get the commission with its current flag reason and payouts
      const existingCommission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: {
          itemCommissions: {
            include: {
              payouts: true
            }
          }
        }
      });

      if (!existingCommission) {
        return res.status(404).json({ error: 'Commission not found' });
      }

      const wasPaymentDenied = existingCommission.flagReason && existingCommission.flagReason.startsWith('PAYMENT_DENIED:');

      // If this was a payment denial, reset the denied payouts back to PENDING
      if (wasPaymentDenied) {
        // Find all WAITING payouts that have a rejectedAt date (these are the denied ones)
        for (const itemComm of existingCommission.itemCommissions) {
          for (const payout of itemComm.payouts) {
            if (payout.status === 'WAITING' && payout.rejectedAt) {
              await prisma.commissionPayout.update({
                where: { id: payout.id },
                data: {
                  status: 'PENDING',
                  rejectedAt: null,
                  rejectionReason: null,
                  rejectedByUserId: null,
                  rejectedByName: null
                }
              });
            }
          }
        }
      }

      const commission = await prisma.commission.update({
        where: { id: req.params.id },
        data: {
          isFlagged: false,
          flagReason: null,
          lastReviewedAt: new Date(),
          lastReviewedBy: req.user.name,
          reviewNotes: reviewNotes || null
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'Commission',
          entityId: commission.id,
          action: 'UNFLAGGED',
          metadata: JSON.stringify({ 
            reviewNotes,
            wasPaymentDenied,
            payoutsResetToPending: wasPaymentDenied
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

  // Recalculate a single commission
  router.post('/:id/recalculate', adminGuard, async (req, res) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only Super Admins can recalculate commissions' });
      }

      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: 'Reason is required for recalculation' });
      }

      // Get the commission with order
      const commission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: {
          order: {
            include: { items: true }
          },
          itemCommissions: {
            include: { payouts: true }
          }
        }
      });

      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }

      // Check if any payout is paid
      const hasPaidPayouts = commission.itemCommissions.some(ic =>
        ic.payouts.some(p => p.status === 'PAID')
      );

      if (hasPaidPayouts) {
        return res.status(400).json({ 
          error: 'Cannot recalculate commission with paid payouts' 
        });
      }

      // Recalculate using existing helper function
      const oldAmount = commission.totalCommissionAmount;
      await calculateCommissionForOrder(commission.order);

      // Get updated commission
      const updated = await prisma.commission.findUnique({
        where: { id: req.params.id }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'Commission',
          entityId: commission.id,
          action: 'RECALCULATED',
          metadata: JSON.stringify({ 
            reason,
            oldAmount,
            newAmount: updated.totalCommissionAmount,
            difference: updated.totalCommissionAmount - oldAmount
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json({
        success: true,
        oldAmount,
        newAmount: updated.totalCommissionAmount,
        difference: updated.totalCommissionAmount - oldAmount
      });
    } catch (error) {
      console.error('Error recalculating commission:', error);
      res.status(500).json({ error: error.message || 'Failed to recalculate commission' });
    }
  });

  // Delete a commission (soft delete - maintains history)
  router.delete('/:id', adminGuard, async (req, res) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only Super Admins can delete commissions' });
      }

      const commission = await prisma.commission.findUnique({
        where: { id: req.params.id },
        include: {
          itemCommissions: {
            include: {
              payouts: true
            }
          }
        }
      });

      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }

      // Check if any payouts are paid
      const hasPaidPayouts = commission.itemCommissions.some(ic =>
        ic.payouts.some(p => p.status === 'PAID')
      );

      if (hasPaidPayouts) {
        return res.status(400).json({ 
          error: 'Cannot delete commission with paid payouts' 
        });
      }

      // Soft delete by marking as orphaned
      await prisma.commission.update({
        where: { id: req.params.id },
        data: {
          orderId: null,
          status: 'ORPHANED'
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'Commission',
          entityId: commission.id,
          action: 'DELETED',
          metadata: JSON.stringify({ reason: 'Manual deletion by admin' }),
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

  // Calculate commission for a specific order by order ID
  router.post('/calculate-for-order/:orderId', adminGuard, async (req, res) => {
    try {
      const { orderId } = req.params;

      // Get order with items
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (!order.sku) {
        return res.status(400).json({ error: 'Order has no sales person assigned' });
      }

      // Check if commission already exists
      const existing = await prisma.commission.findFirst({
        where: { orderId }
      });

      if (existing) {
        // Recalculate existing commission
        await calculateCommissionForOrder(order);
        const updated = await prisma.commission.findFirst({
          where: { orderId },
          include: {
            itemCommissions: {
              include: { payouts: true }
            }
          }
        });
        return res.json({
          success: true,
          message: 'Commission recalculated',
          commission: updated
        });
      } else {
        // Create new commission
        const commission = await calculateCommissionForOrder(order);
        if (commission) {
          const created = await prisma.commission.findUnique({
            where: { id: commission.id },
            include: {
              itemCommissions: {
                include: { payouts: true }
              }
            }
          });
          return res.json({
            success: true,
            message: 'Commission calculated successfully',
            commission: created
          });
        } else {
          return res.status(400).json({ error: 'Failed to calculate commission. Check that items have prices and order has a sales person.' });
        }
      }
    } catch (error) {
      console.error('Error calculating commission for order:', error);
      res.status(500).json({ error: 'Failed to calculate commission' });
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
  

  // ── Switch the sales rep on an order (moves only NOT-yet-paid payouts) ──
  // Already-PAID payouts stay with the original rep; WAITING/PENDING/APPROVED
  // move to the new rep (APPROVED reset to PENDING for re-approval).
  router.post('/order/:orderId/switch-rep', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can switch reps' });
      }

      const { orderId } = req.params;
      const { newRepName, reason } = req.body || {};
      if (!newRepName || !String(newRepName).trim()) {
        return res.status(400).json({ error: 'newRepName is required' });
      }
      const newName = String(newRepName).trim();

      const commission = await prisma.commission.findFirst({
        where: { orderId },
        include: { reps: true, itemCommissions: { include: { payouts: true } } },
      });
      if (!commission) {
        return res.status(404).json({ error: 'No commission found for this order' });
      }

      const activeReps = commission.reps.filter(r => r.isActive);
      if (activeReps.length > 1) {
        return res.status(400).json({ error: 'This order has a split commission; per-rep switching is not supported yet.' });
      }
      const oldRep = activeReps[0] || null;
      const oldName = oldRep ? oldRep.salesPersonName : commission.salesPersonName;
      if (oldName === newName) {
        return res.status(400).json({ error: 'New rep is the same as the current rep' });
      }

      const newUser = await prisma.user.findFirst({ where: { name: newName }, select: { id: true } });
      const newUserId = newUser ? newUser.id : null;

      const allPayouts = commission.itemCommissions.flatMap(ic => ic.payouts || []);
      const keptPaidPayouts = allPayouts.filter(p => p.status === 'PAID').length;
      const movedPayouts = allPayouts.filter(p => p.status !== 'PAID').length;

      const newRep = await prisma.$transaction(async (tx) => {
        const createdRep = await tx.commissionRep.create({
          data: {
            commissionId: commission.id,
            salesPersonName: newName,
            userId: newUserId,
            sharePercentage: oldRep ? oldRep.sharePercentage : 100,
            role: 'PRIMARY',
            isActive: true,
          },
        });

        if (oldRep) {
          await tx.commissionRep.update({
            where: { id: oldRep.id },
            data: { isActive: false, effectiveTo: new Date() },
          });
        }

        // APPROVED (not yet paid) -> move to new rep and reset to PENDING for re-approval.
        await tx.commissionPayout.updateMany({
          where: { commissionId: commission.id, salesPersonName: oldName, status: 'APPROVED' },
          data: {
            salesPersonName: newName, userId: newUserId, commissionRepId: createdRep.id,
            status: 'PENDING', approvedAt: null, approvedByUserId: null, approvedByName: null, approvalNotes: null,
          },
        });

        // WAITING / PENDING -> move to new rep (status unchanged).
        await tx.commissionPayout.updateMany({
          where: { commissionId: commission.id, salesPersonName: oldName, status: { in: ['WAITING', 'PENDING'] } },
          data: { salesPersonName: newName, userId: newUserId, commissionRepId: createdRep.id },
        });

        // Keep the commission + order "current rep" pointer up to date.
        await tx.commission.update({ where: { id: commission.id }, data: { salesPersonName: newName } });
        await tx.order.update({ where: { id: orderId }, data: { sku: newName } });

        await tx.auditLog.create({
          data: {
            entityType: 'Commission', entityId: commission.id, parentEntityId: orderId,
            action: 'SALES_REP_SWITCHED',
            metadata: JSON.stringify({ orderId, oldRep: oldName, newRep: newName, movedPayouts, keptPaidPayouts, reason: reason || null }),
            performedByUserId: req.user.id, performedByName: req.user.name,
          },
        });

        return createdRep;
      });

      // Notify both reps (best-effort; never fails the request).
      try {
        const [oldUser, newUserActive] = await Promise.all([
          prisma.user.findFirst({ where: { name: oldName, isActive: true } }),
          prisma.user.findFirst({ where: { name: newName, isActive: true } }),
        ]);
        if (newUserActive) {
          await prisma.notification.create({
            data: {
              userId: newUserActive.id, type: 'COMMISSION', category: 'INFO',
              title: 'Order assigned to you',
              message: 'You are now the sales rep on an order. ' + movedPayouts + ' unpaid commission payout(s) moved to you.',
              relatedOrderId: orderId,
              metadata: JSON.stringify({ orderId, from: oldName, movedPayouts }),
              priority: 'NORMAL',
            },
          });
        }
        if (oldUser && (!newUserActive || oldUser.id !== newUserActive.id)) {
          await prisma.notification.create({
            data: {
              userId: oldUser.id, type: 'COMMISSION', category: 'INFO',
              title: 'Order reassigned',
              message: 'An order was reassigned to ' + newName + '. Your paid commissions are unchanged (' + keptPaidPayouts + ' kept); ' + movedPayouts + ' unpaid payout(s) moved.',
              relatedOrderId: orderId,
              metadata: JSON.stringify({ orderId, to: newName, keptPaidPayouts, movedPayouts }),
              priority: 'NORMAL',
            },
          });
        }
      } catch (notifyErr) {
        console.error('[SWITCH-REP] notify error:', notifyErr);
      }

      res.json({ success: true, orderId, oldRep: oldName, newRep: newName, movedPayouts, keptPaidPayouts, newRepId: newRep.id });
    } catch (error) {
      console.error('Error switching rep:', error);
      res.status(500).json({ error: error.message || 'Failed to switch rep' });
    }
  });

  return router;
}

export default createCommissionsRouter;
