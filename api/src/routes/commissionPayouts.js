// Commission Payouts API - handles payout-specific operations
import express from 'express';
import { authGuard, adminGuard } from '../middleware/auth.js';
import { calculateCommissionForOrder } from '../helpers/commission.js';

export function createCommissionPayoutsRouter(prisma) {
  const router = express.Router();

  const canManageCommissions = (role) => ['SUPER_ADMIN', 'ACCOUNTANT'].includes(role);

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
  // Email helper
  //
  // • agentUser  — the agent receiving the email (has .email, .name)
  // • type       — 'Approved' | 'Paid' | 'Denied'
  // • payouts    — array of payout objects WITH payoutInclude relations
  //               already loaded. ONLY the agent's OWN payouts are passed;
  //               grouping is handled at the call site.
  //
  // The helper builds:
  //   • {{payoutDetails}}  — HTML table: Item | Customer | Stage | Amount
  //   • {{itemName}}       — single-payout shortcut
  //   • {{customerName}}   — single-payout shortcut
  //   • {{orderNumber}}    — single-payout shortcut
  //   • {{payoutStage}}    — single-payout shortcut
  //   • {{payoutCount}}    — number of payouts
  //   • {{amount}}         — sum of all payouts
  // ─────────────────────────────────────────────────────────────────────────
  async function sendCommissionEmail(agentUser, { type, payouts }) {
    try {
      if (!agentUser?.email || !payouts?.length) return;

      const emailServiceModule = await import('../services/emailService.js');
      const emailService = emailServiceModule.default || emailServiceModule;

      // Company info
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
      const totalAmount    = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Single-payout shortcuts (for templates that use them directly)
      const firstPayout    = payouts[0];
      const firstItem      = firstPayout?.itemCommission?.item;
      const firstOrder     = firstPayout?.itemCommission?.commission?.order;

      // Build the line-item details table (one row per payout)
      const tableRows = payouts.map(p => {
        const item     = p.itemCommission?.item;
        const order    = p.itemCommission?.commission?.order;
        return `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${item?.productCode || '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${order?.account?.name || '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:center;">${p.stage || '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:right;font-weight:600;">$${Number(p.amount || 0).toFixed(2)}</td>
        </tr>`;
      }).join('');

      const payoutDetailsHtml =
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dddddd;border-radius:4px;overflow:hidden;margin-top:12px;">` +
        `<thead><tr style="background-color:#f5f5f5;">` +
        `<th style="padding:8px 10px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Item</th>` +
        `<th style="padding:8px 10px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Customer</th>` +
        `<th style="padding:8px 10px;text-align:center;font-size:12px;color:#666666;font-weight:600;">Stage</th>` +
        `<th style="padding:8px 10px;text-align:right;font-size:12px;color:#666666;font-weight:600;">Amount</th>` +
        `</tr></thead><tbody>${tableRows}</tbody>` +
        `<tfoot><tr style="background-color:#f9f9f9;">` +
        `<td colspan="3" style="padding:10px;font-size:13px;font-weight:600;color:#333333;">Total</td>` +
        `<td style="padding:10px;font-size:15px;font-weight:700;color:#22c55e;text-align:right;">$${totalAmount.toFixed(2)}</td>` +
        `</tr></tfoot></table>`;

      const vars = {
        agentName:      agentUser.name || 'Agent',
        type,
        amount:         totalAmount.toFixed(2),
        payoutCount:    String(payouts.length),
        // single-payout shortcuts
        itemName:       firstItem?.productCode || '—',
        customerName:   firstOrder?.account?.name || '—',
        orderNumber:    firstOrder?.poNumber || '—',
        payoutStage:    firstPayout?.stage || '—',
        // rich details table
        payoutDetails:  payoutDetailsHtml,
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

      // Check for admin-customised template
      const dbTemplate = await prisma.emailTemplate.findUnique({
        where: { templateKey: 'commission_notification' },
      });

      let subject, html;

      if (dbTemplate) {
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
        // Hardcoded fallback — inline the details table
        const { getCommissionNotificationTemplate } = await import('../services/emailTemplates.js');
        subject = `Commission ${type}: $${totalAmount.toFixed(2)}`;
        const raw = getCommissionNotificationTemplate();
        html = raw.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
      }

      const fromEmail = process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';
      await emailService.sendEmail({ to: agentUser.email, from: fromEmail, fromName: companyName, subject, html });
      console.log(`[EMAIL] Commission ${type} notification sent to ${agentUser.email} (${payouts.length} payout(s))`);
    } catch (err) {
      console.error(`[EMAIL] Failed to send commission ${type} email:`, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  router.get('/test', (req, res) => {
    res.json({ message: 'Commission payouts router is working', timestamp: new Date() });
  });

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

      await attachPhaseIndex(payouts);

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
  router.post('/:id/approve', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role))
        return res.status(403).json({ error: 'Only Super Admins and Accountants can approve payouts' });

      const { approvalNotes } = req.body;

      const existingPayout = await prisma.commissionPayout.findUnique({
        where: { id: req.params.id }, include: payoutInclude,
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
        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payment Approved',
            message: `Your commission of $${payout.amount.toFixed(2)} for ${payout.itemCommission.item?.productCode || 'item'} (${payout.itemCommission.commission.order.account.name}) has been approved.`,
            metadata: JSON.stringify({ payoutId: payout.id, amount: payout.amount, stage: payout.stage, orderId: payout.itemCommission.commission.orderId, approvedBy: req.user.name }),
            priority: 'NORMAL',
          },
        });
        // Pass only this agent's payout
        await sendCommissionEmail(salesAgent, { type: 'Approved', payouts: [payout] });
      }

      res.json(payout);
    } catch (error) {
      console.error('Error approving payout:', error);
      res.status(500).json({ error: 'Failed to approve payout' });
    }
  });

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
        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'WARNING',
            title: 'Commission Payment Denied',
            message: `Your commission of $${existingPayout.amount.toFixed(2)} for ${itemName} (${existingPayout.itemCommission.commission.order?.account?.name || 'N/A'}) was denied. Reason: ${rejectionReason}`,
            metadata: JSON.stringify({ payoutId: payout.id, amount: existingPayout.amount, stage: existingPayout.stage, orderId: existingPayout.itemCommission.commission.orderId, rejectionReason, deniedBy: req.user.name }),
            priority: 'HIGH',
          },
        });
        // Pass only this agent's payout (existingPayout still has full includes)
        await sendCommissionEmail(salesAgent, { type: 'Denied', payouts: [existingPayout] });
      }

      res.json(payout);
    } catch (error) {
      console.error('Error rejecting payout:', error);
      res.status(500).json({ error: 'Failed to reject payout' });
    }
  });

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
        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payment Received',
            message: `Your commission of $${updatedPayout.amount.toFixed(2)} for ${updatedPayout.itemCommission.item?.productCode || 'item'} (${updatedPayout.itemCommission.commission.order.account.name}) has been paid via ${paymentMethod}.`,
            metadata: JSON.stringify({ payoutId: updatedPayout.id, amount: updatedPayout.amount, stage: updatedPayout.stage, orderId: updatedPayout.itemCommission.commission.orderId, paymentMethod, paidBy: req.user.name }),
            priority: 'HIGH',
          },
        });
        await sendCommissionEmail(salesAgent, { type: 'Paid', payouts: [updatedPayout] });
      }

      res.json(updatedPayout);
    } catch (error) {
      console.error('Error marking payout as paid:', error);
      res.status(500).json({ error: 'Failed to mark payout as paid' });
    }
  });

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
          metadata: JSON.stringify({ payoutIds, count: result.count, totalAmount, salesPersons, approvalNotes }),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      // Group by sales person — each agent sees ONLY their own payouts
      const byAgent = {};
      payoutsToApprove.forEach(p => {
        const n = p.itemCommission.commission.salesPersonName;
        if (!byAgent[n]) byAgent[n] = [];
        byAgent[n].push(p);
      });

      for (const [salesPersonName, agentPayouts] of Object.entries(byAgent)) {
        const salesAgent = await prisma.user.findFirst({ where: { name: salesPersonName, isActive: true } });
        if (!salesAgent) continue;

        const agentTotal = agentPayouts.reduce((s, p) => s + (p.amount || 0), 0);

        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payments Approved',
            message: `${agentPayouts.length} commission payment${agentPayouts.length > 1 ? 's' : ''} totaling $${agentTotal.toFixed(2)} have been approved.`,
            metadata: JSON.stringify({ payoutCount: agentPayouts.length, totalAmount: agentTotal, approvedBy: req.user.name }),
            priority: 'NORMAL',
          },
        });

        // Email contains ONLY this agent's payouts
        await sendCommissionEmail(salesAgent, { type: 'Approved', payouts: agentPayouts });
      }

      res.json({ updated: result.count });
    } catch (error) {
      console.error('Error bulk approving payouts:', error);
      res.status(500).json({ error: 'Failed to bulk approve payouts' });
    }
  });

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
          metadata: JSON.stringify({ payoutIds, count: result.count, totalAmount, salesPersons, paymentMethod, paymentNotes }),
          performedByUserId: req.user.id, performedByName: req.user.name,
        },
      });

      // Group by sales person — each agent sees ONLY their own payouts
      const byAgent = {};
      payoutsToPay.forEach(p => {
        const n = p.itemCommission.commission.salesPersonName;
        if (!byAgent[n]) byAgent[n] = [];
        byAgent[n].push(p);
      });

      for (const [salesPersonName, agentPayouts] of Object.entries(byAgent)) {
        const salesAgent = await prisma.user.findFirst({ where: { name: salesPersonName, isActive: true } });
        if (!salesAgent) continue;

        const agentTotal = agentPayouts.reduce((s, p) => s + (p.amount || 0), 0);

        await prisma.notification.create({
          data: {
            userId: salesAgent.id, type: 'COMMISSION', category: 'SUCCESS',
            title: 'Commission Payments Received',
            message: `${agentPayouts.length} commission payment${agentPayouts.length > 1 ? 's' : ''} totaling $${agentTotal.toFixed(2)} have been paid via ${paymentMethod}.`,
            metadata: JSON.stringify({ payoutCount: agentPayouts.length, totalAmount: agentTotal, paymentMethod, paidBy: req.user.name }),
            priority: 'HIGH',
          },
        });

        // Email contains ONLY this agent's payouts
        await sendCommissionEmail(salesAgent, { type: 'Paid', payouts: agentPayouts });
      }

      res.json({ paid: result.count });
    } catch (error) {
      console.error('Error bulk paying payouts:', error);
      res.status(500).json({ error: 'Failed to bulk pay payouts' });
    }
  });

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

      await attachPhaseIndex(payouts);

      res.json(payouts);
    } catch (error) {
      console.error('Error fetching paid commissions:', error);
      res.status(500).json({ error: 'Failed to fetch paid commissions' });
    }
  });

  return router;
}

export default createCommissionPayoutsRouter;
