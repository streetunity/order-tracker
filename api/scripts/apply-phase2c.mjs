// apply-phase2c.mjs — Phase 2 step 2c (run from repo root).
// Adds POST /commissions/order/:orderId/switch-rep — moves only NOT-yet-paid
// payouts to the new rep; already-PAID payouts stay with the original rep.
// Purely additive (one new route). Review `git diff`, then `node --check`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(process.cwd(), 'api/src/routes/commissions.js');
if (!existsSync(FILE)) { console.error('Cannot find ' + FILE + ' (run from repo root)'); process.exit(1); }
let s = readFileSync(FILE, 'utf8');

const ROUTE = `
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

`;

const ANCHOR = `  return router;
}

export default createCommissionsRouter;`;
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.error(`ANCHOR FAIL: matched ${n} (expected 1). No changes written.`); process.exit(1); }
s = s.replace(ANCHOR, ROUTE + ANCHOR);
writeFileSync(FILE, s);
console.log('ok  switch-rep route inserted');
console.log('Review: git --no-pager diff api/src/routes/commissions.js');
console.log('Verify: node --check api/src/routes/commissions.js');
