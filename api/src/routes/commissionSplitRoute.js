// api/src/routes/commissionSplitRoute.js
// Split an order's commission EQUALLY across 2+ reps. Only UNPAID payouts are
// divided; already-PAID payouts stay welded to whoever earned them. The chosen
// primary rep becomes the customer-facing sender (order.sku / commission name).
// Mirrors scripts/splitOrder.mjs. SUPER_ADMIN / ACCOUNTANT only.
//   body: { repNames: string[], primaryRep: string, reason?: string }
//
// Mounted from commissions.js via:
//   mountCommissionSplitRoute(router, { prisma, adminGuard, canManageCommissions });
export function mountCommissionSplitRoute(router, { prisma, adminGuard, canManageCommissions }) {
  router.post('/order/:orderId/split', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can split commissions' });
      }

      const { orderId } = req.params;
      const { repNames, primaryRep, reason } = req.body || {};

      const names = Array.isArray(repNames)
        ? repNames.map(n => String(n || '').trim()).filter(Boolean)
        : [];
      if (names.length < 2) {
        return res.status(400).json({ error: 'Pick at least 2 reps to split between' });
      }
      if (new Set(names).size !== names.length) {
        return res.status(400).json({ error: 'The same rep is listed more than once' });
      }
      const primary = String(primaryRep || '').trim();
      if (!primary || !names.includes(primary)) {
        return res.status(400).json({ error: 'Choose which rep is primary (the customer-facing sender)' });
      }
      // Order the reps so the primary is first (index 0 gets the rounding remainder + order.sku).
      const orderedNames = [primary, ...names.filter(n => n !== primary)];
      const N = orderedNames.length;
      const share = 100 / N;

      const commission = await prisma.commission.findFirst({
        where: { orderId },
        include: { reps: true, itemCommissions: { include: { payouts: true } } },
      });
      if (!commission) {
        return res.status(404).json({ error: 'No commission found for this order' });
      }

      const activeReps = commission.reps.filter(r => r.isActive);
      if (activeReps.length !== 1) {
        return res.status(400).json({
          error: `This order must have exactly 1 active rep to split (found ${activeReps.length}). Re-splitting an already-split order isn't supported yet.`,
        });
      }
      const currentRep = activeReps[0].salesPersonName;

      const users = await prisma.user.findMany({ where: { name: { in: orderedNames } }, select: { id: true, name: true } });
      const userIdByName = Object.fromEntries(users.map(u => [u.name, u.id]));

      const allPayouts = commission.itemCommissions.flatMap(ic => ic.payouts || []);
      const unpaid = allPayouts.filter(p => ['WAITING', 'PENDING', 'APPROVED'].includes(p.status));
      const paidCount = allPayouts.filter(p => p.status === 'PAID').length;

      // Build the division plan and reconcile every dollar before writing anything.
      const EPS = 0.005;
      const plan = [];
      let totalBefore = 0, totalAfter = 0;
      for (const p of unpaid) {
        const eachOther = Math.round((p.amount / N) * 1000) / 1000;
        const primaryAmt = Number((p.amount - eachOther * (N - 1)).toFixed(3));
        const eachPct = p.percentage / N;
        const parts = orderedNames.map((name, i) => ({ name, amount: i === 0 ? primaryAmt : eachOther, pct: eachPct }));
        const sum = parts.reduce((a, x) => a + x.amount, 0);
        if (Math.abs(sum - p.amount) > EPS) {
          return res.status(500).json({ error: `Reconcile failed on a payout (${p.id}); no changes made.` });
        }
        totalBefore += p.amount; totalAfter += sum;
        plan.push({ p, parts });
      }
      if (Math.abs(totalBefore - totalAfter) > EPS) {
        return res.status(500).json({ error: 'Split totals do not reconcile; no changes made.' });
      }

      const stamp = new Date();
      const repRows = await prisma.$transaction(async (tx) => {
        // Close the current single rep; open the N equal-share reps (primary first).
        for (const r of activeReps) {
          await tx.commissionRep.update({ where: { id: r.id }, data: { isActive: false, effectiveTo: stamp } });
        }
        const created = [];
        for (let i = 0; i < orderedNames.length; i++) {
          created.push(await tx.commissionRep.create({
            data: {
              commissionId: commission.id,
              salesPersonName: orderedNames[i],
              userId: userIdByName[orderedNames[i]] || null,
              sharePercentage: share,
              role: i === 0 ? 'PRIMARY' : 'SECONDARY',
              isActive: true,
            },
          }));
        }

        // Divide each unpaid payout: keep the original row for the primary, create the rest.
        for (const { p, parts } of plan) {
          const resetApproved = p.status === 'APPROVED'
            ? { status: 'PENDING', approvedAt: null, approvedByUserId: null, approvedByName: null, approvalNotes: null }
            : {};
          await tx.commissionPayout.update({
            where: { id: p.id },
            data: {
              percentage: parts[0].pct, amount: parts[0].amount,
              salesPersonName: created[0].salesPersonName, userId: created[0].userId, commissionRepId: created[0].id,
              notes: ((p.notes ? p.notes + ' | ' : '') + `[SPLIT ${stamp.toISOString().slice(0, 10)}] ${N}-way equal split.`),
              ...resetApproved,
            },
          });
          for (let i = 1; i < orderedNames.length; i++) {
            await tx.commissionPayout.create({
              data: {
                itemCommissionId: p.itemCommissionId, commissionId: commission.id, stage: p.stage,
                percentage: parts[i].pct, amount: parts[i].amount,
                status: p.status === 'APPROVED' ? 'PENDING' : p.status, triggeredAt: p.triggeredAt,
                salesPersonName: created[i].salesPersonName, userId: created[i].userId, commissionRepId: created[i].id,
                notes: `[SPLIT ${stamp.toISOString().slice(0, 10)}] ${N}-way equal split share.`,
              },
            });
          }
        }

        // Primary rep becomes the order's customer-facing sender + display name.
        await tx.commission.update({ where: { id: commission.id }, data: { salesPersonName: created[0].salesPersonName } });
        await tx.order.update({ where: { id: orderId }, data: { sku: created[0].salesPersonName } });

        await tx.auditLog.create({
          data: {
            entityType: 'Commission', entityId: commission.id, parentEntityId: orderId,
            action: 'COMMISSION_SPLIT',
            metadata: JSON.stringify({ orderId, from: currentRep, reps: orderedNames, primaryRep: created[0].salesPersonName, sharePercentEach: share, dividedPayouts: unpaid.length, reason: reason || null }),
            performedByUserId: req.user.id, performedByName: req.user.name,
          },
        });

        return created;
      });

      // Notify each rep that has an active user account (best-effort; never fails the request).
      try {
        for (const r of repRows) {
          if (!r.userId) continue;
          await prisma.notification.create({
            data: {
              userId: r.userId, type: 'COMMISSION', category: 'INFO',
              title: 'Shared commission assigned',
              message: `You are now one of ${N} reps sharing an order (${share.toFixed(0)}% each). Unpaid stages were split evenly.` + (r.role === 'PRIMARY' ? ' You are the primary rep — customer emails send from you.' : ''),
              relatedOrderId: orderId,
              metadata: JSON.stringify({ orderId, reps: orderedNames, primaryRep: repRows[0].salesPersonName, sharePercentEach: share }),
              priority: 'NORMAL',
            },
          });
        }
      } catch (notifyErr) {
        console.error('[SPLIT] notify error:', notifyErr);
      }

      res.json({
        success: true, orderId,
        reps: orderedNames, primaryRep: repRows[0].salesPersonName,
        sharePercentEach: share, dividedPayouts: unpaid.length, keptPaidPayouts: paidCount,
      });
    } catch (error) {
      console.error('Error splitting commission:', error);
      res.status(500).json({ error: error.message || 'Failed to split commission' });
    }
  });
}

export default mountCommissionSplitRoute;
