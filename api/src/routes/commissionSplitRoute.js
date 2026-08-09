// api/src/routes/commissionSplitRoute.js
// Commission REP management for an order: split, replace-a-rep, remove-a-rep.
// Equal division. Only UNPAID payouts (WAITING/PENDING/APPROVED) are ever moved
// or re-divided; already-PAID payouts stay welded to whoever earned them. The
// PRIMARY rep is the customer-facing sender (order.sku / commission.salesPersonName).
// SUPER_ADMIN / ACCOUNTANT only.
//
// Mounted from commissions.js via:
//   mountCommissionSplitRoute(router, { prisma, adminGuard, canManageCommissions });

const UNPAID = ['WAITING', 'PENDING', 'APPROVED'];
const EPS = 0.005;
const round3 = (n) => Math.round(n * 1000) / 1000;
const resetIfApproved = (status) =>
  status === 'APPROVED'
    ? { status: 'PENDING', approvedAt: null, approvedByUserId: null, approvedByName: null, approvalNotes: null }
    : {};

export function mountCommissionSplitRoute(router, { prisma, adminGuard, canManageCommissions }) {
  // ── helpers ───────────────────────────────────────────────────────────────
  async function loadCommission(orderId) {
    return prisma.commission.findFirst({
      where: { orderId },
      include: { reps: true, itemCommissions: { include: { payouts: true } } },
    });
  }
  function allPayoutsOf(commission) {
    return commission.itemCommissions.flatMap((ic) => ic.payouts || []);
  }
  function sumAmounts(payouts) {
    return payouts.reduce((a, p) => a + (p.amount || 0), 0);
  }
  async function userIdFor(name) {
    const u = await prisma.user.findFirst({ where: { name }, select: { id: true } });
    return u ? u.id : null;
  }
  async function notify(userId, title, message, orderId, meta) {
    if (!userId) return;
    try {
      await prisma.notification.create({
        data: { userId, type: 'COMMISSION', category: 'INFO', title, message, relatedOrderId: orderId, metadata: JSON.stringify(meta || {}), priority: 'NORMAL' },
      });
    } catch (e) { console.error('[REP-ADMIN] notify error:', e); }
  }

  // ── SPLIT: 1 active rep -> N equal reps ────────────────────────────────────
  router.post('/order/:orderId/split', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins and Accountants can split commissions' });
      }
      const { orderId } = req.params;
      const { repNames, primaryRep, reason } = req.body || {};

      const names = Array.isArray(repNames) ? repNames.map((n) => String(n || '').trim()).filter(Boolean) : [];
      if (names.length < 2) return res.status(400).json({ error: 'Pick at least 2 reps to split between' });
      if (new Set(names).size !== names.length) return res.status(400).json({ error: 'The same rep is listed more than once' });
      const primary = String(primaryRep || '').trim();
      if (!primary || !names.includes(primary)) return res.status(400).json({ error: 'Choose which rep is primary (the customer-facing sender)' });

      const orderedNames = [primary, ...names.filter((n) => n !== primary)];
      const N = orderedNames.length;
      const share = 100 / N;

      const commission = await loadCommission(orderId);
      if (!commission) return res.status(404).json({ error: 'No commission found for this order' });

      const activeReps = commission.reps.filter((r) => r.isActive);
      if (activeReps.length !== 1) {
        return res.status(400).json({ error: `This order must have exactly 1 active rep to split (found ${activeReps.length}). Use Replace or Remove to change an existing split.` });
      }
      const currentRep = activeReps[0].salesPersonName;

      const users = await prisma.user.findMany({ where: { name: { in: orderedNames } }, select: { id: true, name: true } });
      const userIdByName = Object.fromEntries(users.map((u) => [u.name, u.id]));

      const unpaid = allPayoutsOf(commission).filter((p) => UNPAID.includes(p.status));
      const paidCount = allPayoutsOf(commission).filter((p) => p.status === 'PAID').length;

      const plan = [];
      let totalBefore = 0, totalAfter = 0;
      for (const p of unpaid) {
        const eachOther = round3(p.amount / N);
        const primaryAmt = Number((p.amount - eachOther * (N - 1)).toFixed(3));
        const eachPct = p.percentage / N;
        const parts = orderedNames.map((name, i) => ({ name, amount: i === 0 ? primaryAmt : eachOther, pct: eachPct }));
        const sum = parts.reduce((a, x) => a + x.amount, 0);
        if (Math.abs(sum - p.amount) > EPS) return res.status(500).json({ error: `Reconcile failed on a payout (${p.id}); no changes made.` });
        totalBefore += p.amount; totalAfter += sum;
        plan.push({ p, parts });
      }
      if (Math.abs(totalBefore - totalAfter) > EPS) return res.status(500).json({ error: 'Split totals do not reconcile; no changes made.' });

      const stamp = new Date();
      const repRows = await prisma.$transaction(async (tx) => {
        for (const r of activeReps) await tx.commissionRep.update({ where: { id: r.id }, data: { isActive: false, effectiveTo: stamp } });
        const created = [];
        for (let i = 0; i < orderedNames.length; i++) {
          created.push(await tx.commissionRep.create({
            data: { commissionId: commission.id, salesPersonName: orderedNames[i], userId: userIdByName[orderedNames[i]] || null, sharePercentage: share, role: i === 0 ? 'PRIMARY' : 'SECONDARY', isActive: true },
          }));
        }
        for (const { p, parts } of plan) {
          await tx.commissionPayout.update({
            where: { id: p.id },
            data: {
              percentage: parts[0].pct, amount: parts[0].amount,
              salesPersonName: created[0].salesPersonName, userId: created[0].userId, commissionRepId: created[0].id,
              notes: ((p.notes ? p.notes + ' | ' : '') + `[SPLIT ${stamp.toISOString().slice(0, 10)}] ${N}-way equal split.`),
              ...resetIfApproved(p.status),
            },
          });
          for (let i = 1; i < orderedNames.length; i++) {
            await tx.commissionPayout.create({
              data: {
                itemCommissionId: p.itemCommissionId, commissionId: commission.id, stage: p.stage,
                percentage: parts[i].pct, amount: parts[i].amount, status: p.status === 'APPROVED' ? 'PENDING' : p.status, triggeredAt: p.triggeredAt,
                salesPersonName: created[i].salesPersonName, userId: created[i].userId, commissionRepId: created[i].id,
                notes: `[SPLIT ${stamp.toISOString().slice(0, 10)}] ${N}-way equal split share.`,
              },
            });
          }
        }
        await tx.commission.update({ where: { id: commission.id }, data: { salesPersonName: created[0].salesPersonName } });
        await tx.order.update({ where: { id: orderId }, data: { sku: created[0].salesPersonName } });
        await tx.auditLog.create({
          data: { entityType: 'Commission', entityId: commission.id, parentEntityId: orderId, action: 'COMMISSION_SPLIT', metadata: JSON.stringify({ orderId, from: currentRep, reps: orderedNames, primaryRep: created[0].salesPersonName, sharePercentEach: share, dividedPayouts: unpaid.length, reason: reason || null }), performedByUserId: req.user.id, performedByName: req.user.name },
        });
        return created;
      });

      for (const r of repRows) {
        await notify(r.userId, 'Shared commission assigned', `You are now one of ${N} reps sharing an order (${share.toFixed(0)}% each). Unpaid stages were split evenly.` + (r.role === 'PRIMARY' ? ' You are the primary rep — customer emails send from you.' : ''), orderId, { orderId, reps: orderedNames, primaryRep: repRows[0].salesPersonName });
      }
      res.json({ success: true, orderId, reps: orderedNames, primaryRep: repRows[0].salesPersonName, sharePercentEach: share, dividedPayouts: unpaid.length, keptPaidPayouts: paidCount });
    } catch (error) {
      console.error('Error splitting commission:', error);
      res.status(500).json({ error: error.message || 'Failed to split commission' });
    }
  });

  // ── REPLACE: swap one active rep for a new one (works for 1..N reps) ────────
  // Moves ONLY the outgoing rep's unpaid payouts to the replacement; the other
  // reps and every PAID payout are untouched. The replacement inherits the
  // outgoing rep's share and role (so replacing the primary keeps them primary).
  router.post('/order/:orderId/replace-rep', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) return res.status(403).json({ error: 'Only Super Admins and Accountants can change reps' });
      const { orderId } = req.params;
      const outgoingName = String(req.body?.outgoingRep || '').trim();
      const newName = String(req.body?.newRepName || '').trim();
      const reason = req.body?.reason || null;
      if (!outgoingName) return res.status(400).json({ error: 'outgoingRep is required' });
      if (!newName) return res.status(400).json({ error: 'newRepName is required' });
      if (outgoingName === newName) return res.status(400).json({ error: 'New rep is the same as the outgoing rep' });

      const commission = await loadCommission(orderId);
      if (!commission) return res.status(404).json({ error: 'No commission found for this order' });
      const activeReps = commission.reps.filter((r) => r.isActive);
      const outgoing = activeReps.find((r) => r.salesPersonName === outgoingName);
      if (!outgoing) return res.status(400).json({ error: `${outgoingName} is not an active rep on this order` });
      if (activeReps.some((r) => r.salesPersonName === newName)) return res.status(400).json({ error: `${newName} is already a rep on this order` });

      const newUserId = await userIdFor(newName);
      const outgoingPayouts = allPayoutsOf(commission).filter((p) => p.commissionRepId === outgoing.id || (p.commissionRepId == null && p.salesPersonName === outgoingName));
      const movedPayouts = outgoingPayouts.filter((p) => UNPAID.includes(p.status));
      const keptPaidPayouts = outgoingPayouts.filter((p) => p.status === 'PAID');
      const wasPrimary = outgoing.role === 'PRIMARY' || commission.salesPersonName === outgoingName;

      const stamp = new Date();
      const created = await prisma.$transaction(async (tx) => {
        const newRep = await tx.commissionRep.create({
          data: { commissionId: commission.id, salesPersonName: newName, userId: newUserId, sharePercentage: outgoing.sharePercentage, role: outgoing.role, isActive: true },
        });
        await tx.commissionRep.update({ where: { id: outgoing.id }, data: { isActive: false, effectiveTo: stamp } });
        for (const p of movedPayouts) {
          await tx.commissionPayout.update({
            where: { id: p.id },
            data: { salesPersonName: newName, userId: newUserId, commissionRepId: newRep.id, notes: ((p.notes ? p.notes + ' | ' : '') + `[REPLACE ${stamp.toISOString().slice(0, 10)}] ${outgoingName} -> ${newName}.`), ...resetIfApproved(p.status) },
          });
        }
        if (wasPrimary) {
          await tx.commission.update({ where: { id: commission.id }, data: { salesPersonName: newName } });
          await tx.order.update({ where: { id: orderId }, data: { sku: newName } });
        }
        await tx.auditLog.create({
          data: { entityType: 'Commission', entityId: commission.id, parentEntityId: orderId, action: 'SALES_REP_REPLACED', metadata: JSON.stringify({ orderId, outgoing: outgoingName, incoming: newName, movedPayouts: movedPayouts.length, keptPaidPayouts: keptPaidPayouts.length, wasPrimary, reason }), performedByUserId: req.user.id, performedByName: req.user.name },
        });
        return newRep;
      });

      const outUser = await prisma.user.findFirst({ where: { name: outgoingName, isActive: true }, select: { id: true } });
      await notify(created.userId, 'Order assigned to you', `You replaced ${outgoingName} on an order. ${movedPayouts.length} unpaid payout(s) moved to you.` + (wasPrimary ? ' You are now the primary rep.' : ''), orderId, { orderId, from: outgoingName });
      await notify(outUser?.id, 'Order reassigned', `You were replaced by ${newName} on an order. Your ${keptPaidPayouts.length} paid payout(s) are unchanged; ${movedPayouts.length} unpaid moved.`, orderId, { orderId, to: newName });

      res.json({ success: true, orderId, outgoing: outgoingName, incoming: newName, movedPayouts: movedPayouts.length, keptPaidPayouts: keptPaidPayouts.length, wasPrimary });
    } catch (error) {
      console.error('Error replacing rep:', error);
      res.status(500).json({ error: error.message || 'Failed to replace rep' });
    }
  });

  // ── REMOVE: drop a rep from a split (>=2 active reps) ───────────────────────
  // The departing rep's UNPAID payouts are re-divided evenly among the remaining
  // reps' unpaid rows for the same item/stage; their PAID payouts stay with them.
  // If the departing rep was primary, a new primary is promoted.
  router.post('/order/:orderId/remove-rep', adminGuard, async (req, res) => {
    try {
      if (!canManageCommissions(req.user.role)) return res.status(403).json({ error: 'Only Super Admins and Accountants can change reps' });
      const { orderId } = req.params;
      const repName = String(req.body?.repName || '').trim();
      const newPrimaryReq = String(req.body?.newPrimaryRep || '').trim();
      const reason = req.body?.reason || null;
      if (!repName) return res.status(400).json({ error: 'repName is required' });

      const commission = await loadCommission(orderId);
      if (!commission) return res.status(404).json({ error: 'No commission found for this order' });
      const activeReps = commission.reps.filter((r) => r.isActive);
      if (activeReps.length < 2) return res.status(400).json({ error: 'Nothing to remove — this order is not split. Use Switch Rep instead.' });
      const removing = activeReps.find((r) => r.salesPersonName === repName);
      if (!removing) return res.status(400).json({ error: `${repName} is not an active rep on this order` });

      const remaining = activeReps.filter((r) => r.id !== removing.id);
      const newShare = 100 / remaining.length;
      const wasPrimary = removing.role === 'PRIMARY' || commission.salesPersonName === repName;
      let newPrimary = null;
      if (wasPrimary) {
        newPrimary = remaining.find((r) => r.salesPersonName === newPrimaryReq) || remaining[0];
      }

      const all = allPayoutsOf(commission);
      const belongsTo = (p, rep) => p.commissionRepId === rep.id || (p.commissionRepId == null && p.salesPersonName === rep.salesPersonName);
      const removedUnpaid = all.filter((p) => belongsTo(p, removing) && UNPAID.includes(p.status));
      const removedPaid = all.filter((p) => belongsTo(p, removing) && p.status === 'PAID');

      // Plan the redistribution of each of the departing rep's unpaid payouts.
      const totalBefore = sumAmounts(all);
      const adds = []; // { payoutId, addAmount, addPct }
      const reassign = []; // { payoutId, toRep }  (when no eligible remaining unpaid at that stage)
      const deletes = []; // removed payout ids that were spread onto others
      for (const p of removedUnpaid) {
        const eligible = all.filter((q) => q.itemCommissionId === p.itemCommissionId && q.stage === p.stage && UNPAID.includes(q.status) && remaining.some((r) => belongsTo(q, r)));
        if (eligible.length === 0) {
          // Everyone remaining is already paid for this item/stage — hand the row to the new/first primary, keep it unpaid.
          const target = newPrimary || remaining[0];
          reassign.push({ payoutId: p.id, toRep: target });
          continue;
        }
        const k = eligible.length;
        const eachAmt = round3(p.amount / k);
        const eachPct = p.percentage / k;
        eligible.forEach((q, i) => {
          const addAmount = i === k - 1 ? Number((p.amount - eachAmt * (k - 1)).toFixed(3)) : eachAmt;
          adds.push({ payoutId: q.id, addAmount, addPct: eachPct });
        });
        deletes.push(p.id);
      }

      const stamp = new Date();
      await prisma.$transaction(async (tx) => {
        // apply additions to remaining reps' unpaid payouts
        const addByPayout = new Map();
        for (const a of adds) {
          const cur = addByPayout.get(a.payoutId) || { amount: 0, pct: 0 };
          cur.amount += a.addAmount; cur.pct += a.addPct;
          addByPayout.set(a.payoutId, cur);
        }
        for (const [payoutId, inc] of addByPayout) {
          const p = all.find((x) => x.id === payoutId);
          await tx.commissionPayout.update({
            where: { id: payoutId },
            data: { amount: Number((p.amount + inc.amount).toFixed(3)), percentage: p.percentage + inc.pct, notes: ((p.notes ? p.notes + ' | ' : '') + `[REMOVE ${stamp.toISOString().slice(0, 10)}] absorbed ${repName}'s share.`) },
          });
        }
        // reassign rows that had no eligible remaining unpaid
        for (const r of reassign) {
          await tx.commissionPayout.update({
            where: { id: r.payoutId },
            data: { salesPersonName: r.toRep.salesPersonName, userId: r.toRep.userId, commissionRepId: r.toRep.id, notes: `[REMOVE ${stamp.toISOString().slice(0, 10)}] reassigned from ${repName}.` },
          });
        }
        // delete the departing rep's unpaid rows that were spread onto others
        if (deletes.length) await tx.commissionPayout.deleteMany({ where: { id: { in: deletes } } });
        // close the departing rep; update remaining shares/roles
        await tx.commissionRep.update({ where: { id: removing.id }, data: { isActive: false, effectiveTo: stamp } });
        for (const r of remaining) {
          const isNewPrimary = newPrimary && r.id === newPrimary.id;
          await tx.commissionRep.update({ where: { id: r.id }, data: { sharePercentage: newShare, ...(wasPrimary ? { role: isNewPrimary ? 'PRIMARY' : 'SECONDARY' } : {}) } });
        }
        if (wasPrimary && newPrimary) {
          await tx.commission.update({ where: { id: commission.id }, data: { salesPersonName: newPrimary.salesPersonName } });
          await tx.order.update({ where: { id: orderId }, data: { sku: newPrimary.salesPersonName } });
        }
        await tx.auditLog.create({
          data: { entityType: 'Commission', entityId: commission.id, parentEntityId: orderId, action: 'COMMISSION_REP_REMOVED', metadata: JSON.stringify({ orderId, removed: repName, remaining: remaining.map((r) => r.salesPersonName), newShareEach: newShare, wasPrimary, newPrimary: newPrimary?.salesPersonName || null, redividedPayouts: removedUnpaid.length, keptPaidPayouts: removedPaid.length, reason }), performedByUserId: req.user.id, performedByName: req.user.name },
        });

        // reconciliation guard: total across all payouts must be unchanged
        const afterRows = await tx.commissionPayout.findMany({ where: { commissionId: commission.id }, select: { amount: true } });
        const totalAfter = afterRows.reduce((a, x) => a + (x.amount || 0), 0);
        if (Math.abs(totalBefore - totalAfter) > EPS) throw new Error(`Remove-rep reconcile failed: before ${totalBefore} != after ${totalAfter}`);
      });

      for (const r of remaining) {
        const u = await prisma.user.findFirst({ where: { name: r.salesPersonName, isActive: true }, select: { id: true } });
        await notify(u?.id, 'Shared commission updated', `${repName} was removed from a shared order. Your share is now ${newShare.toFixed(0)}%; their unpaid stages were re-divided.`, orderId, { orderId, removed: repName, newShareEach: newShare });
      }
      const removedUser = await prisma.user.findFirst({ where: { name: repName, isActive: true }, select: { id: true } });
      await notify(removedUser?.id, 'Removed from a shared order', `You were removed from an order. Your ${removedPaid.length} paid payout(s) are unchanged; ${removedUnpaid.length} unpaid were re-divided among the remaining reps.`, orderId, { orderId });

      res.json({ success: true, orderId, removed: repName, remaining: remaining.map((r) => r.salesPersonName), newShareEach: newShare, wasPrimary, newPrimary: newPrimary?.salesPersonName || null, redividedPayouts: removedUnpaid.length, keptPaidPayouts: removedPaid.length });
    } catch (error) {
      console.error('Error removing rep:', error);
      res.status(500).json({ error: error.message || 'Failed to remove rep' });
    }
  });
}

export default mountCommissionSplitRoute;
