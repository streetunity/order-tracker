// Commission Payouts API - handles payout-specific operations
import express from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { calculateCommissionForOrder } from '../helpers/commission.js';

export function createCommissionPayoutsRouter(prisma) {
  const router = express.Router();

  const canManageCommissions = (role) => ['SUPER_ADMIN', 'ACCOUNTANT'].includes(role);

  const payoutInclude = {
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
        item: {
          select: { productCode: true, serialNumber: true, currentStage: true },
        },
      },
    },
  };

  const buildPayoutAuditMetadata = (payout, extraData = {}) => {
    const itemCommission = payout?.itemCommission;
    const commission     = itemCommission?.commission;
    const order          = commission?.order;
    const item           = itemCommission?.item;
    return {
      salesPerson:     commission?.salesPersonName || null,
      salesPersonName: commission?.salesPersonName || null,
      orderId:         commission?.orderId || null,
      customerName:    order?.account?.name || null,
      itemId:          itemCommission?.itemId || null,
      itemName:        item?.productCode || null,
      payoutId:        payout?.id || null,
      stage:           payout?.stage || null,
      amount:          payout?.amount ?? null,
      ...extraData,
    };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Email helper — sends a commission notification email to a single agent.
  // Falls back gracefully; never throws so a missing/broken email never
  // fails the underlying API response.
  // ─────────────────────────────────────────────────────────────────────────
  async function sendCommissionEmail(agentUser, { type, amount, orderNumber, customerName, payoutStage }) {
    try {
      if (!agentUser?.email) return;

      const emailServiceModule = await import('../services/emailService.js');
      const emailService = emailServiceModule.default || emailServiceModule;

      // Pull company info
      let companyName = 'Stealth Machine Tools';
      let companyPhone = '';
      let companyEmail = '';
      try {
        const settings = await prisma.invoicingSettings.findFirst();
        if (settings) {
          companyName  = settings.companyName || companyName;
          companyPhone = settings.phone || '';
          companyEmail = settings.email || '';
        }
      } catch (_) {}

      const commissionsUrl = `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/my-commissions`;

      // Check for admin-customised template
      const dbTemplate = await prisma.emailTemplate.findUnique({
        where: { templateKey: 'commission_notification' },
      });

      const vars = {
        agentName:     agentUser.name || 'Agent',
        type,
        amount:        Number(amount).toFixed(2),
        orderNumber:   orderNumber || '—',
        customerName:  customerName || '—',
        payoutStage:   payoutStage || '—',
        commissionsUrl,
        companyName,
        companyPhone,
        companyEmail,
      };

      const processTemplate = (str) => {
        let out = str || '';
        for (const [k, v] of Object.entries(vars)) {
          out = out.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v);
        }
        return out;
      };

      let subject, html;

      if (dbTemplate) {
        // Use customised template wrapped in the standard email shell
        const { wrapInBaseTemplate } = await import('../services/emailTemplates.js');

        subject = processTemplate(dbTemplate.subject);
        const body    = processTemplate(dbTemplate.bodyContent || '');
        const closing = processTemplate(dbTemplate.closingContent || '');
        const footer  = processTemplate(dbTemplate.footerContent || `<p>${companyName} — Internal Notification</p>`);

        const RED   = '#dc2626';
        const LIGHT = '#f5f5f5';

        const content = `
          <tr bgcolor="${RED}"><td bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">Commission ${type}</h1>
          </td></tr>
          <tr><td bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
            ${body}
            ${closing ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #dddddd;">${closing}</div>` : ''}
          </td></tr>
          <tr><td bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;font-size:12px;color:#666666;">
            ${footer}
          </td></tr>`;

        html = wrapInBaseTemplate(content, subject);
      } else {
        // Fall back to hardcoded template
        const { getCommissionNotificationTemplate } = await import('../services/emailTemplates.js');
        const emailService2 = await import('../services/emailService.js');
        const svc = emailService2.default || emailService2;

        subject = `Commission ${type}: $${vars.amount}`;
        const raw = getCommissionNotificationTemplate();
        html = svc.processTemplate ? svc.processTemplate(raw, vars) : raw.replace(
          /\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`
        );
      }

      const fromEmail = process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';

      await emailService.sendEmail({
        to:       agentUser.email,
        from:     fromEmail,
        fromName: companyName,
        subject,
        html,
      });

      console.log(`[EMAIL] Commission ${type} notification sent to ${agentUser.email}`);
    } catch (err) {
      // Log but never bubble up — email failure must not fail the API
      console.error(`[EMAIL] Failed to send commission ${type} email:`, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEBUG (remove after testing)
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/test', (req, res) => {
    res.json({ message: 'Commission payouts router is working', timestamp: new Date() });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /pending
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/pending', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view pending approvals' });

      const payouts = await prisma.commissionPayout.findMany({
        where: { status: 'PENDING' },
        include: payoutInclude,
        orderBy: [{ createdAt: 'asc' }],
      });

      const grouped = {};
      payouts.forEach(payout => {
        const name = payout.itemCommission.commission.salesPersonName;
        if (!grouped[name]) grouped[name] = { salesPerson: name, payouts: [], total: 0, count: 0 };
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

  // ─────────────────────────────────────────────────────────────────────────
  // POST /:id/approve
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/:id/approve', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can approve payouts' });

      const { approvalNotes } = req.body;

      const existingPayout = await prisma.commissionPayout.findUnique({
        where: { id: req.params.id },
        include: payoutInclude,
      });
      if (!existingPayout) return res.status(404).json({ error: 'Payout not found' });

      const payout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedByUserId: req.user.id, approvedByName: req.user.name, approvalNotes },
        include: payoutInclude,
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout', entityId: payout.id, action: 'APPROVED',
          metadata: JSON.stringify(buildPayoutAuditMetadata(payout, { approvalNotes })),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      const salesPersonName = payout.itemCommission.commission.salesPersonName;
      const salesAgent = await prisma.user.findFirst({ where: { name: salesPersonName, isActive: true } });

      if (salesAgent) {
        // In-app notification
        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payment Approved',
            message: `Your commission payment of $${payout.amount.toFixed(2)} for order ${payout.itemCommission.commission.order.poNumber} (${payout.itemCommission.commission.order.account.name}) has been approved and is ready for payment.`,
            metadata: JSON.stringify({ payoutId: payout.id, amount: payout.amount, stage: payout.stage, orderId: payout.itemCommission.commission.orderId, approvedBy: req.user.name }),
            priority: 'NORMAL',
          },
        });

        // Email notification
        await sendCommissionEmail(salesAgent, {
          type:         'Approved',
          amount:       payout.amount,
          orderNumber:  payout.itemCommission.commission.order.poNumber,
          customerName: payout.itemCommission.commission.order.account.name,
          payoutStage:  payout.stage,
        });
      }

      res.json(payout);
    } catch (error) {
      console.error('Error approving payout:', error);
      res.status(500).json({ error: 'Failed to approve payout' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /:id/unapprove
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/:id/unapprove', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can unapprove payouts' });

      const payout = await prisma.commissionPayout.findUnique({ where: { id: req.params.id }, include: payoutInclude });
      if (!payout) return res.status(404).json({ error: 'Payout not found' });
      if (payout.status !== 'APPROVED') return res.status(400).json({ error: 'Only approved payouts can be unapproved' });

      const updatedPayout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: { status: 'PENDING', approvedAt: null, approvedByUserId: null, approvedByName: null, approvalNotes: null },
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout', entityId: updatedPayout.id, action: 'UNAPPROVED',
          metadata: JSON.stringify(buildPayoutAuditMetadata(payout, { reason: 'Moved back to pending', previouslyApprovedBy: payout.approvedByName })),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error unapproving payout:', error);
      res.status(500).json({ error: 'Failed to unapprove payout' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /:id/reject
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/:id/reject', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can reject payouts' });

      const { rejectionReason } = req.body;

      const existingPayout = await prisma.commissionPayout.findUnique({ where: { id: req.params.id }, include: payoutInclude });
      if (!existingPayout) return res.status(404).json({ error: 'Payout not found' });

      const payout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: { status: 'WAITING', rejectedAt: new Date(), rejectedByUserId: req.user.id, rejectedByName: req.user.name, rejectionReason },
      });

      const commissionId = existingPayout.itemCommission.commissionId;
      const itemName     = existingPayout.itemCommission.item?.productCode || 'Unknown Item';
      const orderPO      = existingPayout.itemCommission.commission.order?.poNumber || 'Unknown';

      await prisma.commission.update({
        where: { id: commissionId },
        data: { isFlagged: true, flagReason: `PAYMENT_DENIED: ${rejectionReason} (Item: ${itemName}, Stage: ${existingPayout.stage}, Amount: $${existingPayout.amount.toFixed(2)}, Denied by: ${req.user.name})` },
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout', entityId: payout.id, action: 'REJECTED',
          metadata: JSON.stringify(buildPayoutAuditMetadata(existingPayout, { rejectionReason, commissionId })),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      const salesPersonName = existingPayout.itemCommission.commission.salesPersonName;
      const salesAgent = await prisma.user.findFirst({ where: { name: salesPersonName, isActive: true } });

      if (salesAgent) {
        // In-app notification
        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'WARNING',
            title: 'Commission Payment Denied',
            message: `Your commission payment of $${existingPayout.amount.toFixed(2)} for order ${orderPO} (${existingPayout.itemCommission.commission.order?.account?.name || 'N/A'}) has been denied. Reason: ${rejectionReason}`,
            metadata: JSON.stringify({ payoutId: payout.id, amount: existingPayout.amount, stage: existingPayout.stage, orderId: existingPayout.itemCommission.commission.orderId, rejectionReason, deniedBy: req.user.name }),
            priority: 'HIGH',
          },
        });

        // Email notification
        await sendCommissionEmail(salesAgent, {
          type:         'Denied',
          amount:       existingPayout.amount,
          orderNumber:  orderPO,
          customerName: existingPayout.itemCommission.commission.order?.account?.name,
          payoutStage:  existingPayout.stage,
        });
      }

      res.json(payout);
    } catch (error) {
      console.error('Error rejecting payout:', error);
      res.status(500).json({ error: 'Failed to reject payout' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /:id/pay
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/:id/pay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can mark payouts as paid' });

      const { paymentMethod, paymentNotes } = req.body;

      const existingPayout = await prisma.commissionPayout.findUnique({ where: { id: req.params.id }, include: payoutInclude });
      if (!existingPayout) return res.status(404).json({ error: 'Payout not found' });
      if (existingPayout.status !== 'APPROVED') return res.status(400).json({ error: 'Payout must be approved before marking as paid' });

      const updatedPayout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: { status: 'PAID', paidAt: new Date(), paidByUserId: req.user.id, paidByName: req.user.name, paymentMethod, paymentNotes },
        include: payoutInclude,
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout', entityId: updatedPayout.id, action: 'PAID',
          metadata: JSON.stringify(buildPayoutAuditMetadata(updatedPayout, { paymentMethod, paymentNotes })),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      const salesPersonName = updatedPayout.itemCommission.commission.salesPersonName;
      const salesAgent = await prisma.user.findFirst({ where: { name: salesPersonName, isActive: true } });

      if (salesAgent) {
        // In-app notification
        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payment Received',
            message: `Your commission payment of $${updatedPayout.amount.toFixed(2)} for order ${updatedPayout.itemCommission.commission.order.poNumber} (${updatedPayout.itemCommission.commission.order.account.name}) has been paid via ${paymentMethod}.`,
            metadata: JSON.stringify({ payoutId: updatedPayout.id, amount: updatedPayout.amount, stage: updatedPayout.stage, orderId: updatedPayout.itemCommission.commission.orderId, paymentMethod, paidBy: req.user.name }),
            priority: 'HIGH',
          },
        });

        // Email notification
        await sendCommissionEmail(salesAgent, {
          type:         'Paid',
          amount:       updatedPayout.amount,
          orderNumber:  updatedPayout.itemCommission.commission.order.poNumber,
          customerName: updatedPayout.itemCommission.commission.order.account.name,
          payoutStage:  updatedPayout.stage,
        });
      }

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error marking payout as paid:', error);
      res.status(500).json({ error: 'Failed to mark payout as paid' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /:id/unpay
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/:id/unpay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can unpay payouts' });

      const payout = await prisma.commissionPayout.findUnique({ where: { id: req.params.id }, include: payoutInclude });
      if (!payout) return res.status(404).json({ error: 'Payout not found' });
      if (payout.status !== 'PAID') return res.status(400).json({ error: 'Only paid payouts can be moved back to approved' });

      const previousPaymentInfo = { paidAt: payout.paidAt, paidByUserId: payout.paidByUserId, paidByName: payout.paidByName, paymentMethod: payout.paymentMethod, paymentNotes: payout.paymentNotes };

      const updatedPayout = await prisma.commissionPayout.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED', paidAt: null, paidByUserId: null, paidByName: null, paymentMethod: null, paymentNotes: null },
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout', entityId: updatedPayout.id, action: 'UNPAID',
          metadata: JSON.stringify(buildPayoutAuditMetadata(payout, { reason: 'Moved back to approved status', previousPaymentInfo })),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error unpaying payout:', error);
      res.status(500).json({ error: 'Failed to unpay payout' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /bulk-approve
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/bulk-approve', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can bulk approve payouts' });

      const { payoutIds, approvalNotes } = req.body;

      const payoutsToApprove = await prisma.commissionPayout.findMany({
        where: { id: { in: payoutIds }, status: 'PENDING' },
        include: payoutInclude,
      });

      const result = await prisma.commissionPayout.updateMany({
        where: { id: { in: payoutIds }, status: 'PENDING' },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedByUserId: req.user.id, approvedByName: req.user.name, approvalNotes },
      });

      const totalAmount  = payoutsToApprove.reduce((sum, p) => sum + (p.amount || 0), 0);
      const salesPersons = [...new Set(payoutsToApprove.map(p => p.itemCommission.commission.salesPersonName))];

      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout', entityId: 'BULK', action: 'BULK_APPROVED',
          metadata: JSON.stringify({ payoutIds, count: result.count, totalAmount, salesPersons, approvalNotes, payoutDetails: payoutsToApprove.map(p => ({ payoutId: p.id, salesPerson: p.itemCommission.commission.salesPersonName, amount: p.amount, stage: p.stage, customerName: p.itemCommission.commission.order?.account?.name, itemName: p.itemCommission.item?.productCode })) }),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      // Group by sales person → one in-app notification + one email per agent
      const byAgent = {};
      payoutsToApprove.forEach(p => {
        const n = p.itemCommission.commission.salesPersonName;
        if (!byAgent[n]) byAgent[n] = { payouts: [], totalAmount: 0 };
        byAgent[n].payouts.push(p);
        byAgent[n].totalAmount += p.amount || 0;
      });

      for (const [salesPersonName, data] of Object.entries(byAgent)) {
        const salesAgent = await prisma.user.findFirst({ where: { name: salesPersonName, isActive: true } });
        if (!salesAgent) continue;

        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payments Approved',
            message: `${data.payouts.length} commission payment${data.payouts.length > 1 ? 's' : ''} totaling $${data.totalAmount.toFixed(2)} have been approved and are ready for payment.`,
            metadata: JSON.stringify({ payoutCount: data.payouts.length, totalAmount: data.totalAmount, approvedBy: req.user.name }),
            priority: 'NORMAL',
          },
        });

        await sendCommissionEmail(salesAgent, {
          type:         'Approved',
          amount:       data.totalAmount,
          orderNumber:  data.payouts.length === 1 ? data.payouts[0].itemCommission.commission.order?.poNumber : `${data.payouts.length} orders`,
          customerName: data.payouts.length === 1 ? data.payouts[0].itemCommission.commission.order?.account?.name : `${data.payouts.length} orders`,
          payoutStage:  data.payouts.length === 1 ? data.payouts[0].stage : 'Multiple',
        });
      }

      res.json({ updated: result.count });
    } catch (error) {
      console.error('Error bulk approving payouts:', error);
      res.status(500).json({ error: 'Failed to bulk approve payouts' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /bulk-pay
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/bulk-pay', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can bulk pay payouts' });

      const { payoutIds, paymentMethod, paymentNotes } = req.body;

      const payoutsToPay = await prisma.commissionPayout.findMany({
        where: { id: { in: payoutIds }, status: 'APPROVED' },
        include: payoutInclude,
      });

      const result = await prisma.commissionPayout.updateMany({
        where: { id: { in: payoutIds }, status: 'APPROVED' },
        data: { status: 'PAID', paidAt: new Date(), paidByUserId: req.user.id, paidByName: req.user.name, paymentMethod, paymentNotes },
      });

      const totalAmount  = payoutsToPay.reduce((sum, p) => sum + (p.amount || 0), 0);
      const salesPersons = [...new Set(payoutsToPay.map(p => p.itemCommission.commission.salesPersonName))];

      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionPayout', entityId: 'BULK', action: 'BULK_PAID',
          metadata: JSON.stringify({ payoutIds, count: result.count, totalAmount, salesPersons, paymentMethod, paymentNotes, payoutDetails: payoutsToPay.map(p => ({ payoutId: p.id, salesPerson: p.itemCommission.commission.salesPersonName, amount: p.amount, stage: p.stage, customerName: p.itemCommission.commission.order?.account?.name, itemName: p.itemCommission.item?.productCode })) }),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      // Group by sales person → one in-app notification + one email per agent
      const byAgent = {};
      payoutsToPay.forEach(p => {
        const n = p.itemCommission.commission.salesPersonName;
        if (!byAgent[n]) byAgent[n] = { payouts: [], totalAmount: 0 };
        byAgent[n].payouts.push(p);
        byAgent[n].totalAmount += p.amount || 0;
      });

      for (const [salesPersonName, data] of Object.entries(byAgent)) {
        const salesAgent = await prisma.user.findFirst({ where: { name: salesPersonName, isActive: true } });
        if (!salesAgent) continue;

        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payments Received',
            message: `${data.payouts.length} commission payment${data.payouts.length > 1 ? 's' : ''} totaling $${data.totalAmount.toFixed(2)} have been paid via ${paymentMethod}.`,
            metadata: JSON.stringify({ payoutCount: data.payouts.length, totalAmount: data.totalAmount, paymentMethod, paidBy: req.user.name }),
            priority: 'HIGH',
          },
        });

        await sendCommissionEmail(salesAgent, {
          type:         'Paid',
          amount:       data.totalAmount,
          orderNumber:  data.payouts.length === 1 ? data.payouts[0].itemCommission.commission.order?.poNumber : `${data.payouts.length} orders`,
          customerName: data.payouts.length === 1 ? data.payouts[0].itemCommission.commission.order?.account?.name : `${data.payouts.length} orders`,
          payoutStage:  data.payouts.length === 1 ? data.payouts[0].stage : 'Multiple',
        });
      }

      res.json({ paid: result.count });
    } catch (error) {
      console.error('Error bulk paying payouts:', error);
      res.status(500).json({ error: 'Failed to bulk pay payouts' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /paid  (admin, filtered)
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/paid', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can view paid commissions' });

      const { salesPerson, startDate, endDate } = req.query;
      if (!salesPerson || !startDate || !endDate)
        return res.status(400).json({ error: 'salesPerson, startDate, and endDate are required' });

      const [sY, sM, sD] = startDate.split('-').map(Number);
      const [eY, eM, eD] = endDate.split('-').map(Number);
      const startDateTime = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
      const endDateTime   = new Date(eY, eM - 1, eD, 23, 59, 59, 999);

      const payouts = await prisma.commissionPayout.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: startDateTime, lte: endDateTime },
          itemCommission: { commission: { salesPersonName: salesPerson } },
        },
        include: {
          itemCommission: {
            include: {
              commission: {
                include: { order: { select: { id: true, poNumber: true, orderDate: true, account: { select: { name: true } } } } },
              },
            },
          },
        },
        orderBy: { paidAt: 'asc' },
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
