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

  // DEBUG ENDPOINT - Remove after testing
  router.get('/test', (req, res) => {
    res.json({ 
      message: 'Commission payouts router is working',
      timestamp: new Date(),
      headers: req.headers
    });
  });

  // Get pending payouts (groups by sales person)
  router.get('/pending', adminGuard, async (req, res) => {
    try {
      console.log('📊 /pending endpoint hit');
      console.log('👤 User:', req.user);
      console.log('🔑 User role:', req.user?.role);
      
      if (!canManageCommissions(req.user.role)) {
        console.log('❌ User cannot manage commissions');
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view pending approvals' });
      }

      console.log('✅ Fetching pending payouts from database...');
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

      console.log(`✅ Found ${payouts.length} pending payouts`);

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

      const result = Object.values(grouped);
      console.log(`✅ Returning ${result.length} groups`);
      
      res.json(result);
    } catch (error) {
      console.error('❌ Error fetching pending approvals:', error);
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
        },
        include: {
          itemCommission: {
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
            }
          }
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

      // Notify sales agent
      const salesPersonName = payout.itemCommission.commission.salesPersonName;
      const salesAgent = await prisma.user.findFirst({
        where: {
          name: salesPersonName,
          isActive: true
        }
      });

      if (salesAgent) {
        await prisma.notification.create({
          data: {
            userId: salesAgent.id,
            type: 'COMMISSION',
            category: 'SUCCESS',
            title: 'Commission Payment Approved',
            message: `Your commission payment of $${payout.amount.toFixed(2)} for order ${payout.itemCommission.commission.order.poNumber} (${payout.itemCommission.commission.order.account.name}) has been approved and is ready for payment.`,
            metadata: JSON.stringify({
              payoutId: payout.id,
              amount: payout.amount,
              stage: payout.stage,
              orderId: payout.itemCommission.commission.orderId,
              approvedBy: req.user.name
            }),
            priority: 'NORMAL'
          }
        });
      }

      res.json(payout);
    } catch (error) {
      console.error('Error approving payout:', error);
      res.status(500).json({ error: 'Failed to approve payout' });
    }
  });

  // Unapprove a payout (move back to pending)
  router.post('/:id/unapprove', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can unapprove payouts' });
      }

      const payout = await prisma.commissionPayout.findUnique({
        where: { id: req.params.id }
      });

      if (!payout) {
        return res.status(404).json({ error: 'Payout not found' });
      }

      if (payout.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Only approved payouts can be unapproved' });
      }

      const updatedPayout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'PENDING',
          approvedAt: null,
          approvedByUserId: null,
          approvedByName: null,
          approvalNotes: null
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: updatedPayout.id,
          action: 'UNAPPROVED',
          metadata: JSON.stringify({
            reason: 'Moved back to pending',
            previouslyApprovedBy: payout.approvedByName
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error unapproving payout:', error);
      res.status(500).json({ error: 'Failed to unapprove payout' });
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
        where: { id: req.params.id },
        include: {
          itemCommission: {
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
            }
          }
        }
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
        },
        include: {
          itemCommission: {
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
            }
          }
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

      // Notify sales agent
      const salesPersonName = updatedPayout.itemCommission.commission.salesPersonName;
      const salesAgent = await prisma.user.findFirst({
        where: {
          name: salesPersonName,
          isActive: true
        }
      });

      if (salesAgent) {
        await prisma.notification.create({
          data: {
            userId: salesAgent.id,
            type: 'COMMISSION',
            category: 'SUCCESS',
            title: 'Commission Payment Received',
            message: `Your commission payment of $${updatedPayout.amount.toFixed(2)} for order ${updatedPayout.itemCommission.commission.order.poNumber} (${updatedPayout.itemCommission.commission.order.account.name}) has been paid via ${paymentMethod}.`,
            metadata: JSON.stringify({
              payoutId: updatedPayout.id,
              amount: updatedPayout.amount,
              stage: updatedPayout.stage,
              orderId: updatedPayout.itemCommission.commission.orderId,
              paymentMethod,
              paidBy: req.user.name
            }),
            priority: 'HIGH'
          }
        });
      }

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error marking payout as paid:', error);
      res.status(500).json({ error: 'Failed to mark payout as paid' });
    }
  });

  // Unpay a payout (move back to approved)
  router.post('/:id/unpay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can unpay payouts' });
      }

      const payout = await prisma.commissionPayout.findUnique({
        where: { id: req.params.id },
        include: {
          itemCommission: {
            include: {
              commission: true
            }
          }
        }
      });

      if (!payout) {
        return res.status(404).json({ error: 'Payout not found' });
      }

      if (payout.status !== 'PAID') {
        return res.status(400).json({ error: 'Only paid payouts can be moved back to approved' });
      }

      // Store previous payment info for audit log
      const previousPaymentInfo = {
        paidAt: payout.paidAt,
        paidByUserId: payout.paidByUserId,
        paidByName: payout.paidByName,
        paymentMethod: payout.paymentMethod,
        paymentNotes: payout.paymentNotes
      };

      const updatedPayout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: {
          status: 'APPROVED',
          paidAt: null,
          paidByUserId: null,
          paidByName: null,
          paymentMethod: null,
          paymentNotes: null
        }
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout',
          entityId: updatedPayout.id,
          action: 'UNPAID',
          metadata: JSON.stringify({
            reason: 'Moved back to approved status',
            previousPaymentInfo
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error unpaying payout:', error);
      res.status(500).json({ error: 'Failed to unpay payout' });
    }
  });

  // Bulk approve payouts
  router.post('/bulk-approve', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can bulk approve payouts' });
      }

      const { payoutIds, approvalNotes } = req.body;

      // Fetch payouts before updating to get sales person info
      const payoutsToApprove = await prisma.commissionPayout.findMany({
        where: {
          id: { in: payoutIds },
          status: 'PENDING'
        },
        include: {
          itemCommission: {
            include: {
              commission: true
            }
          }
        }
      });

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

      // Notify sales agents - group by sales person
      const payoutsBySalesPerson = {};
      payoutsToApprove.forEach(payout => {
        const salesPersonName = payout.itemCommission.commission.salesPersonName;
        if (!payoutsBySalesPerson[salesPersonName]) {
          payoutsBySalesPerson[salesPersonName] = {
            payouts: [],
            totalAmount: 0
          };
        }
        payoutsBySalesPerson[salesPersonName].payouts.push(payout);
        payoutsBySalesPerson[salesPersonName].totalAmount += payout.amount;
      });

      // Send one notification per sales person
      for (const [salesPersonName, data] of Object.entries(payoutsBySalesPerson)) {
        const salesAgent = await prisma.user.findFirst({
          where: {
            name: salesPersonName,
            isActive: true
          }
        });

        if (salesAgent) {
          await prisma.notification.create({
            data: {
              userId: salesAgent.id,
              type: 'COMMISSION',
              category: 'SUCCESS',
              title: 'Commission Payments Approved',
              message: `${data.payouts.length} commission payment${data.payouts.length > 1 ? 's' : ''} totaling $${data.totalAmount.toFixed(2)} have been approved and are ready for payment.`,
              metadata: JSON.stringify({
                payoutCount: data.payouts.length,
                totalAmount: data.totalAmount,
                approvedBy: req.user.name
              }),
              priority: 'NORMAL'
            }
          });
        }
      }

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

      // Fetch payouts before updating to get sales person info
      const payoutsToPay = await prisma.commissionPayout.findMany({
        where: {
          id: { in: payoutIds },
          status: 'APPROVED'
        },
        include: {
          itemCommission: {
            include: {
              commission: true
            }
          }
        }
      });

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

      // Notify sales agents - group by sales person
      const payoutsBySalesPerson = {};
      payoutsToPay.forEach(payout => {
        const salesPersonName = payout.itemCommission.commission.salesPersonName;
        if (!payoutsBySalesPerson[salesPersonName]) {
          payoutsBySalesPerson[salesPersonName] = {
            payouts: [],
            totalAmount: 0
          };
        }
        payoutsBySalesPerson[salesPersonName].payouts.push(payout);
        payoutsBySalesPerson[salesPersonName].totalAmount += payout.amount;
      });

      // Send one notification per sales person
      for (const [salesPersonName, data] of Object.entries(payoutsBySalesPerson)) {
        const salesAgent = await prisma.user.findFirst({
          where: {
            name: salesPersonName,
            isActive: true
          }
        });

        if (salesAgent) {
          await prisma.notification.create({
            data: {
              userId: salesAgent.id,
              type: 'COMMISSION',
              category: 'SUCCESS',
              title: 'Commission Payments Received',
              message: `${data.payouts.length} commission payment${data.payouts.length > 1 ? 's' : ''} totaling $${data.totalAmount.toFixed(2)} have been paid via ${paymentMethod}.`,
              metadata: JSON.stringify({
                payoutCount: data.payouts.length,
                totalAmount: data.totalAmount,
                paymentMethod,
                paidBy: req.user.name
              }),
              priority: 'HIGH'
            }
          });
        }
      }

      res.json({ paid: result.count });
    } catch (error) {
      console.error('Error bulk paying payouts:', error);
      res.status(500).json({ error: 'Failed to bulk pay payouts' });
    }
  });

  // Get paid commissions filtered by agent and date range (for PDF reports)
  router.get('/paid', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view paid commissions' });
      }

      const { salesPerson, startDate, endDate } = req.query;

      if (!salesPerson || !startDate || !endDate) {
        return res.status(400).json({ error: 'salesPerson, startDate, and endDate are required' });
      }

      const payouts = await prisma.commissionPayout.findMany({
        where: {
          status: 'PAID',
          paidAt: {
            gte: new Date(startDate),
            lte: new Date(endDate + 'T23:59:59.999Z'), // Include entire end date
          },
          itemCommission: {
            commission: {
              salesPersonName: salesPerson,
            },
          },
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
      console.error('Error fetching paid commissions:', error);
      res.status(500).json({ error: 'Failed to fetch paid commissions' });
    }
  });

  return router;
}

export default createCommissionPayoutsRouter;
