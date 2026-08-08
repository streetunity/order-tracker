// api/src/helpers/commission.js
// Item-level commission calculation with proportional discount allocation

import { PrismaClient } from '@prisma/client';
import { STAGES, STAGE_INDEX } from '../state.js';

const prisma = new PrismaClient();

function isStageAtOrPast(currentStage, targetStage) {
  const currentIndex = STAGE_INDEX[currentStage];
  const targetIndex  = STAGE_INDEX[targetStage];
  if (currentIndex === undefined || targetIndex === undefined) {
    console.warn(`[COMMISSION] Stage not found in STAGE_INDEX: current=${currentStage}, target=${targetStage}`);
    return false;
  }
  return currentIndex >= targetIndex;
}

const ACTIVE_COMMISSION_STATUSES = ['CALCULATED', 'PARTIAL_PAID'];

/**
 * Ensure the commission has a PRIMARY CommissionRep (100% share) and return it.
 * Foundation for split/switch: every commission gets an explicit participant, and
 * every payout is stamped with an owner. Idempotent; never renames an existing rep.
 */
async function ensurePrimaryCommissionRep(commission) {
  let rep = await prisma.commissionRep.findFirst({
    where: { commissionId: commission.id, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (rep) return rep;
  let userId = null;
  if (commission.salesPersonName) {
    const u = await prisma.user.findFirst({
      where: { name: commission.salesPersonName },
      select: { id: true },
    });
    userId = u?.id ?? null;
  }
  return prisma.commissionRep.create({
    data: {
      commissionId: commission.id,
      salesPersonName: commission.salesPersonName ?? '',
      userId,
      sharePercentage: 100,
      role: 'PRIMARY',
      isActive: true,
    },
  });
}

async function getPayoutStageSettings() {
  let stageSettings = await prisma.commissionStageSetting.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (stageSettings.length === 0) {
    console.log('[COMMISSION] No stage settings found - creating defaults (SHIPPING 50%, DELIVERED 50%)');
    await prisma.commissionStageSetting.createMany({
      data: [
        { stage: 'SHIPPING',   percentage: 50, sortOrder: 1, isActive: true },
        { stage: 'DELIVERED',  percentage: 50, sortOrder: 2, isActive: true },
      ],
    });
    stageSettings = await prisma.commissionStageSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  return stageSettings;
}

export async function calculateCommissionForOrder(order) {
  try {
    const fullOrder = order.items
      ? order
      : await prisma.order.findUnique({
          where: { id: order.id || order },
          include: { items: true },
        });

    if (!fullOrder) { console.log(`[COMMISSION] Order ${order.id || order} not found`); return null; }
    if (!fullOrder.sku) { console.log(`[COMMISSION] No sales person for order ${fullOrder.id}`); await flagMissingSalesRep(fullOrder.id); return null; }

    let rate = 5.0;
    const customRate = await prisma.commissionRate.findUnique({ where: { salesPersonName: fullOrder.sku } });
    if (customRate) {
      rate = customRate.rate;
    } else {
      const settings = await prisma.commissionSettings.findFirst();
      if (settings?.defaultRate) rate = settings.defaultRate;
    }

    let orderSubtotal = 0;
    let hasAllPrices  = true;
    const pricedItems = [];

    for (const item of fullOrder.items) {
      if (item.itemPrice && item.itemPrice > 0) {
        const itemTotal = item.itemPrice * (item.qty || 1);
        orderSubtotal += itemTotal;
        pricedItems.push({ ...item, itemTotal });
      } else {
        hasAllPrices = false;
      }
    }

    const orderDiscount  = fullOrder.discount || 0;
    const orderNetTotal  = orderSubtotal - orderDiscount;

    if (!hasAllPrices) {
      console.log(`[COMMISSION] Order ${fullOrder.id} has items without prices - flagging`);
      return await createFlaggedCommission(fullOrder, rate, orderSubtotal, orderDiscount, 'AWAITING_PRICES');
    }

    let commission = await prisma.commission.findFirst({
      where: { orderId: fullOrder.id },
      include: { itemCommissions: true },
    });

    if (commission) {
      await prisma.itemCommission.deleteMany({ where: { commissionId: commission.id } });
      commission = await prisma.commission.update({
        where: { id: commission.id },
        data: {
          salesPersonName: fullOrder.sku, orderSubtotal, orderDiscount, orderNetTotal,
          commissionRate: rate, totalCommissionAmount: (orderNetTotal * rate) / 100,
          status: 'CALCULATED', isFlagged: false, flagReason: null, flagDetails: null, calculatedAt: new Date(),
        },
      });
    } else {
      commission = await prisma.commission.create({
        data: {
          orderId: fullOrder.id, salesPersonName: fullOrder.sku, orderSubtotal, orderDiscount, orderNetTotal,
          commissionRate: rate, totalCommissionAmount: (orderNetTotal * rate) / 100,
          status: 'CALCULATED', calculatedAt: new Date(),
        },
      });
    }

    await createItemCommissions(commission, pricedItems, orderSubtotal, orderDiscount, rate);

    console.log(`[COMMISSION] Calculated commission for order ${fullOrder.id}: $${commission.totalCommissionAmount.toFixed(2)} (Rate: ${rate}%)`);
    return commission;
  } catch (error) {
    console.error('[COMMISSION] Error calculating commission:', error);
    return null;
  }
}

async function createItemCommissions(commission, pricedItems, orderSubtotal, orderDiscount, rate) {
  const stageSettings = await getPayoutStageSettings();
  console.log(`[COMMISSION] Using ${stageSettings.length} payout stages:`, stageSettings.map(s => `${s.stage} (${s.percentage}%)`).join(', '));
  const primaryRep = await ensurePrimaryCommissionRep(commission);

  for (const item of pricedItems) {
    const itemSubtotal       = item.itemTotal;
    const discountPercentage = orderSubtotal > 0 ? (itemSubtotal / orderSubtotal) : 0;
    const allocatedDiscount  = orderDiscount * discountPercentage;
    const netAmount          = itemSubtotal - allocatedDiscount;
    const commissionAmount   = (netAmount * rate) / 100;

    const itemCommission = await prisma.itemCommission.create({
      data: {
        commissionId: commission.id, itemId: item.id, orderId: commission.orderId,
        productCode: item.productCode, qty: item.qty, itemPrice: item.itemPrice,
        itemSubtotal, allocatedDiscount, discountPercentage: discountPercentage * 100,
        netAmount, commissionRate: rate, commissionAmount, status: 'CALCULATED',
      },
    });

    const currentItemStage = item.currentStage || 'MANUFACTURING';
    const isOrdered        = item.isOrdered === true;
    let   triggeredCount   = 0;

    for (const setting of stageSettings) {
      const shouldTrigger = isOrdered && currentItemStage !== 'PENDING_FUNDING' && isStageAtOrPast(currentItemStage, setting.stage);
      const payoutStatus  = shouldTrigger ? 'PENDING' : 'WAITING';

      await prisma.commissionPayout.create({
        data: {
          itemCommissionId: itemCommission.id, commissionId: commission.id,
          stage: setting.stage, percentage: setting.percentage,
          amount: (commissionAmount * setting.percentage) / 100,
          status: payoutStatus, triggeredByItemId: item.id,
          triggeredAt: shouldTrigger ? new Date() : null,
          salesPersonName: primaryRep.salesPersonName,
          userId: primaryRep.userId,
          commissionRepId: primaryRep.id,
        },
      });

      if (shouldTrigger) {
        triggeredCount++;
        console.log(`[COMMISSION] Auto-triggered ${setting.stage} payout for item ${item.productCode}`);
      }
    }

    if (!isOrdered) console.log(`[COMMISSION] Item ${item.productCode} NOT ordered yet - payouts remain in WAITING`);
    else if (triggeredCount > 0) console.log(`[COMMISSION] Auto-triggered ${triggeredCount} payout(s) for item ${item.productCode}`);
  }

  const pendingPayouts = await prisma.commissionPayout.findMany({
    where: { commissionId: commission.id, status: 'PENDING' },
    include: { itemCommission: true },
  });

  if (pendingPayouts.length > 0) {
    console.log(`[COMMISSION] Created ${pendingPayouts.length} PENDING payouts`);
    const itemGroups = {};
    pendingPayouts.forEach(p => {
      const itemId = p.itemCommission.itemId;
      if (!itemGroups[itemId]) itemGroups[itemId] = { itemCommission: p.itemCommission, payouts: [] };
      itemGroups[itemId].payouts.push(p);
    });
    for (const [, group] of Object.entries(itemGroups)) {
      await createPayoutNotification(commission, group.itemCommission, group.itemCommission.productCode, group.payouts);
    }
  }
}

async function createFlaggedCommission(order, rate, orderSubtotal, orderDiscount, flagReason) {
  return await prisma.commission.upsert({
    where: { orderId: order.id },
    update: {
      salesPersonName: order.sku, orderSubtotal, orderDiscount,
      orderNetTotal: orderSubtotal - orderDiscount, commissionRate: rate,
      totalCommissionAmount: 0, status: 'AWAITING_PRICES', isFlagged: true, flagReason,
      flagDetails: JSON.stringify({ message: 'Some items missing prices', timestamp: new Date() }),
    },
    create: {
      orderId: order.id, salesPersonName: order.sku, orderSubtotal, orderDiscount,
      orderNetTotal: orderSubtotal - orderDiscount, commissionRate: rate,
      totalCommissionAmount: 0, status: 'AWAITING_PRICES', isFlagged: true, flagReason,
      flagDetails: JSON.stringify({ message: 'Some items missing prices', timestamp: new Date() }),
    },
  });
}

async function flagMissingSalesRep(orderId) {
  const commission = await prisma.commission.findFirst({ where: { orderId } });
  if (commission) {
    await prisma.commission.update({
      where: { id: commission.id },
      data: { isFlagged: true, flagReason: 'NO_SALES_REP', flagDetails: JSON.stringify({ message: 'No sales person assigned to order', timestamp: new Date() }) },
    });
  }
}

export async function recalculateCommissionIfPriceChanged(orderId) {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) { console.log(`[COMMISSION] Order ${orderId} not found for recalculation`); return null; }

    const commission = await prisma.commission.findFirst({
      where: { orderId },
      include: { itemCommissions: { include: { payouts: true } } },
    });

    if (!commission) return await calculateCommissionForOrder(order);

    const hasPaidPayouts = commission.itemCommissions.some(ic => ic.payouts.some(p => p.status === 'PAID'));
    if (hasPaidPayouts) {
      console.log(`[COMMISSION] Commission ${commission.id} has paid payouts - using incremental update`);
      return await addNewItemsToExistingCommission(commission, order);
    }

    console.log(`[COMMISSION] Recalculating commission for order ${orderId}`);
    return await calculateCommissionForOrder(order);
  } catch (error) {
    console.error(`[COMMISSION] Error recalculating commission for order ${orderId}:`, error);
    return null;
  }
}

async function addNewItemsToExistingCommission(commission, order) {
  try {
    const rate = commission.commissionRate;
    const existingItemIds = new Set(commission.itemCommissions.map(ic => ic.itemId));

    let orderSubtotal = 0;
    const allPricedItems = [];
    const newPricedItems = [];

    for (const item of order.items) {
      if (item.itemPrice && item.itemPrice > 0) {
        const itemTotal = item.itemPrice * (item.qty || 1);
        orderSubtotal += itemTotal;
        allPricedItems.push({ ...item, itemTotal });
        if (!existingItemIds.has(item.id)) newPricedItems.push({ ...item, itemTotal });
      }
    }

    if (newPricedItems.length === 0) { console.log(`[COMMISSION] No new items to add for order ${order.id}`); return commission; }

    const orderDiscount = order.discount || 0;
    const orderNetTotal = orderSubtotal - orderDiscount;
    const stageSettings = await getPayoutStageSettings();
    const primaryRep = await ensurePrimaryCommissionRep(commission);

    console.log(`[COMMISSION] Adding ${newPricedItems.length} new item(s) to commission ${commission.id}`);

    for (const item of newPricedItems) {
      const itemSubtotal       = item.itemTotal;
      const discountPercentage = orderSubtotal > 0 ? (itemSubtotal / orderSubtotal) : 0;
      const allocatedDiscount  = orderDiscount * discountPercentage;
      const netAmount          = itemSubtotal - allocatedDiscount;
      const commissionAmount   = (netAmount * rate) / 100;

      const itemCommission = await prisma.itemCommission.create({
        data: {
          commissionId: commission.id, itemId: item.id, orderId: order.id,
          productCode: item.productCode, qty: item.qty, itemPrice: item.itemPrice,
          itemSubtotal, allocatedDiscount, discountPercentage: discountPercentage * 100,
          netAmount, commissionRate: rate, commissionAmount, status: 'CALCULATED',
        },
      });

      const currentItemStage = item.currentStage || 'MANUFACTURING';
      const isOrdered        = item.isOrdered === true;

      for (const setting of stageSettings) {
        const shouldTrigger = isOrdered && currentItemStage !== 'PENDING_FUNDING' && isStageAtOrPast(currentItemStage, setting.stage);
        await prisma.commissionPayout.create({
          data: {
            itemCommissionId: itemCommission.id, commissionId: commission.id,
            stage: setting.stage, percentage: setting.percentage,
            amount: (commissionAmount * setting.percentage) / 100,
            status: shouldTrigger ? 'PENDING' : 'WAITING',
            triggeredByItemId: item.id, triggeredAt: shouldTrigger ? new Date() : null,
            salesPersonName: primaryRep.salesPersonName,
            userId: primaryRep.userId,
            commissionRepId: primaryRep.id,
          },
        });
        if (shouldTrigger) console.log(`[COMMISSION] Auto-triggered ${setting.stage} payout for new item ${item.productCode}`);
      }
    }

    const updatedCommission = await prisma.commission.update({
      where: { id: commission.id },
      data: { orderSubtotal, orderDiscount, orderNetTotal, totalCommissionAmount: (orderNetTotal * rate) / 100, calculatedAt: new Date() },
    });

    await updateCommissionStatus(commission.id);

    const newPendingPayouts = await prisma.commissionPayout.findMany({
      where: { commissionId: commission.id, status: 'PENDING', triggeredByItemId: { in: newPricedItems.map(i => i.id) } },
      include: { itemCommission: true },
    });

    if (newPendingPayouts.length > 0) {
      const itemGroups = {};
      newPendingPayouts.forEach(p => {
        const itemId = p.itemCommission.itemId;
        if (!itemGroups[itemId]) itemGroups[itemId] = { itemCommission: p.itemCommission, payouts: [] };
        itemGroups[itemId].payouts.push(p);
      });
      for (const [, group] of Object.entries(itemGroups)) {
        await createPayoutNotification(commission, group.itemCommission, group.itemCommission.productCode, group.payouts);
      }
    }

    console.log(`[COMMISSION] Updated commission ${commission.id}: new total $${updatedCommission.totalCommissionAmount.toFixed(2)}`);
    return updatedCommission;
  } catch (error) {
    console.error('[COMMISSION] Error adding new items to commission:', error);
    return commission;
  }
}

export async function checkCommissionPayoutTrigger(orderId, itemId, oldStage, newStage) {
  try {
    if (oldStage === newStage) return;
    console.log(`[COMMISSION] Item ${itemId} stage changed: ${oldStage} → ${newStage}`);

    const item = await prisma.orderItem.findUnique({ where: { id: itemId }, select: { isOrdered: true, currentStage: true } });
    if (!item) { console.log(`[COMMISSION] Item ${itemId} not found`); return; }
    if (!item.isOrdered) { console.log(`[COMMISSION] Item ${itemId} not ordered - no trigger`); return; }
    if (newStage === 'PENDING_FUNDING') { console.log(`[COMMISSION] Item ${itemId} in PENDING_FUNDING - no trigger`); return; }

    const commission = await prisma.commission.findFirst({
      where: { orderId },
      include: { itemCommissions: { where: { itemId }, include: { payouts: true } } },
    });

    if (!commission || !ACTIVE_COMMISSION_STATUSES.includes(commission.status)) {
      console.log(`[COMMISSION] No active commission for order ${orderId} (status: ${commission?.status || 'not found'})`);
      return;
    }

    const itemCommission = commission.itemCommissions[0];
    if (!itemCommission) { console.log(`[COMMISSION] No item commission for item ${itemId}`); return; }

    const triggeredPayouts = itemCommission.payouts.filter(p => p.stage === newStage && p.status === 'WAITING');
    if (triggeredPayouts.length === 0) { console.log(`[COMMISSION] No waiting payouts for stage ${newStage} on item ${itemId}`); return; }

    for (const payout of triggeredPayouts) {
      await prisma.commissionPayout.update({ where: { id: payout.id }, data: { status: 'PENDING', triggeredAt: new Date() } });
      console.log(`[COMMISSION] Triggered payout $${payout.amount.toFixed(2)} for item ${itemId} at stage ${newStage}`);
    }

    await updateCommissionStatus(commission.id);
    await createPayoutNotification(commission, itemCommission, newStage, triggeredPayouts);
  } catch (error) {
    console.error('[COMMISSION] Error checking payout trigger:', error);
  }
}

export async function checkOrderedStatusTrigger(orderId, itemId) {
  try {
    console.log(`[COMMISSION] Item ${itemId} marked as ordered - checking triggers`);

    const item = await prisma.orderItem.findUnique({ where: { id: itemId }, select: { currentStage: true } });
    if (!item) { console.log(`[COMMISSION] Item ${itemId} not found`); return; }

    const commission = await prisma.commission.findFirst({
      where: { orderId },
      include: { itemCommissions: { where: { itemId }, include: { payouts: true } } },
    });

    if (!commission || !ACTIVE_COMMISSION_STATUSES.includes(commission.status)) {
      console.log(`[COMMISSION] No active commission for order ${orderId} (status: ${commission?.status || 'not found'})`);
      return;
    }

    const itemCommission = commission.itemCommissions[0];
    if (!itemCommission) { console.log(`[COMMISSION] No item commission for item ${itemId}`); return; }

    const currentStage = item.currentStage || 'MANUFACTURING';
    if (currentStage === 'PENDING_FUNDING') { console.log(`[COMMISSION] Item ${itemId} in PENDING_FUNDING - no trigger`); return; }

    const triggeredPayouts = [];
    for (const payout of itemCommission.payouts) {
      if (payout.status === 'WAITING' && isStageAtOrPast(currentStage, payout.stage)) {
        await prisma.commissionPayout.update({ where: { id: payout.id }, data: { status: 'PENDING', triggeredAt: new Date() } });
        triggeredPayouts.push(payout);
        console.log(`[COMMISSION] Triggered ${payout.stage} payout for item ${itemId} (already at ${currentStage})`);
      }
    }

    if (triggeredPayouts.length > 0) {
      await updateCommissionStatus(commission.id);
      await createPayoutNotification(commission, itemCommission, currentStage, triggeredPayouts);
    }
  } catch (error) {
    console.error('[COMMISSION] Error checking ordered status trigger:', error);
  }
}

async function updateCommissionStatus(commissionId) {
  const allPayouts = await prisma.commissionPayout.findMany({ where: { commissionId } });
  const allPaid    = allPayouts.every(p => p.status === 'PAID');
  const somePaid   = allPayouts.some(p => p.status === 'PAID');
  if (allPaid)      await prisma.commission.update({ where: { id: commissionId }, data: { status: 'FULLY_PAID' } });
  else if (somePaid) await prisma.commission.update({ where: { id: commissionId }, data: { status: 'PARTIAL_PAID' } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Email helper — sends a "pending approval" notification to a single admin or
// accountant. Uses the `pending_approval_notification` template if customised,
// falls back to an inline hardcoded version. Never throws.
// ─────────────────────────────────────────────────────────────────────────────
async function sendPendingApprovalEmail(adminUser, { agentName, customerName, itemName, payouts }) {
  try {
    if (!adminUser?.email) return;

    const emailServiceModule = await import('../services/emailService.js');
    const emailService = emailServiceModule.default || emailServiceModule;

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

    const approvalsUrl  = `${process.env.FRONTEND_URL || 'https://smt-orders.com'}/admin/commissions`;
    const totalAmount   = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Build the line-item table (one row per payout)
    const tableRows = payouts.map(p =>
      `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${itemName || '\u2014'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">${customerName || '\u2014'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:center;">${p.stage || '\u2014'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:right;font-weight:600;">$${Number(p.amount || 0).toFixed(2)}</td>
      </tr>`
    ).join('');

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
      `<td style="padding:10px;font-size:15px;font-weight:700;color:#f59e0b;text-align:right;">$${totalAmount.toFixed(2)}</td>` +
      `</tr></tfoot></table>`;

    const vars = {
      adminName:     adminUser.name || 'Admin',
      agentName:     agentName || '\u2014',
      customerName:  customerName || '\u2014',
      itemName:      itemName || '\u2014',
      stage:         payouts[0]?.stage || '\u2014',
      amount:        totalAmount.toFixed(2),
      payoutCount:   String(payouts.length),
      payoutDetails: payoutDetailsHtml,
      approvalsUrl,
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

    const dbTemplate = await prisma.emailTemplate.findUnique({
      where: { templateKey: 'pending_approval_notification' },
    });

    let subject, html;

    if (dbTemplate) {
      const { wrapInBaseTemplate } = await import('../services/emailTemplates.js');
      subject         = processTemplate(dbTemplate.subject);
      const body      = processTemplate(dbTemplate.bodyContent || '');
      const closing   = processTemplate(dbTemplate.closingContent || '');
      const footer    = processTemplate(dbTemplate.footerContent || `<p>${companyName} \u2014 Internal Notification</p>`);
      const RED   = '#dc2626';
      const LIGHT = '#f5f5f5';
      const content = `
        <tr bgcolor="${RED}"><td bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">Commission Approval Required</h1>
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
      // Inline hardcoded fallback
      subject = `Commission Approval Required \u2014 ${agentName}`;
      html =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
        'body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f5f5f5;}' +
        '.container{max-width:600px;margin:0 auto;background:white;}' +
        '.header{background:#dc2626;color:white;padding:20px;text-align:center;}' +
        '.header h1{margin:0;font-size:22px;}' +
        '.content{padding:30px;}' +
        '.btn{display:inline-block;background:#dc2626;color:white!important;padding:12px 30px;text-decoration:none;border-radius:5px;margin:10px 5px;font-weight:bold;}' +
        '.footer{text-align:center;padding:20px;color:#666;font-size:12px;background:#f5f5f5;}' +
        '</style></head><body>' +
        '<div class="container">' +
        '<div class="header"><h1>Commission Approval Required</h1></div>' +
        '<div class="content">' +
        `<p>Hello ${adminUser.name || 'Admin'},</p>` +
        `<p>A commission payout for <strong>${agentName}</strong> is awaiting your approval:</p>` +
        payoutDetailsHtml +
        `<p style="text-align:center;margin:30px 0;"><a href="${approvalsUrl}" class="btn">Review &amp; Approve</a></p>` +
        '</div>' +
        `<div class="footer"><p>${companyName} \u2014 Internal Notification</p></div>` +
        '</div></body></html>';
    }

    const fromEmail = process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';
    await emailService.sendEmail({ to: adminUser.email, from: fromEmail, fromName: companyName, subject, html });
    console.log(`[EMAIL] Pending approval notification sent to ${adminUser.email} (agent: ${agentName})`);
  } catch (err) {
    console.error('[EMAIL] Failed to send pending approval email:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createPayoutNotification
// Creates in-app notifications for all SUPER_ADMIN + ACCOUNTANT users AND
// sends each of them an email with the pending payout line-item details.
// ─────────────────────────────────────────────────────────────────────────────
async function createPayoutNotification(commission, itemCommission, stage, payouts) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ACCOUNTANT'] }, isActive: true },
    });

    const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'COMMISSION',
          category: 'COMMISSION',
          title: 'Commission Payout Pending Approval',
          message: `Item commission for ${commission.salesPersonName} requires approval (${itemCommission.productCode} at ${stage})`,
          metadata: JSON.stringify({
            commissionId:     commission.id,
            itemCommissionId: itemCommission.id,
            itemId:           itemCommission.itemId,
            amount:           totalAmount,
            stage,
            productCode:      itemCommission.productCode,
          }),
          priority: 'NORMAL',
        },
      });
    }

    // Fetch customer name for the email
    let customerName = '\u2014';
    try {
      const order = await prisma.order.findUnique({
        where: { id: commission.orderId },
        include: { account: { select: { name: true } } },
      });
      customerName = order?.account?.name || '\u2014';
    } catch (_) {}

    // Send one email per admin — each email contains only this item's payouts
    for (const admin of admins) {
      await sendPendingApprovalEmail(admin, {
        agentName:    commission.salesPersonName,
        customerName,
        itemName:     itemCommission.productCode,
        payouts,
      });
    }
  } catch (error) {
    console.error('[COMMISSION] Error creating notification:', error);
  }
}

export async function recalculateAllCommissions(userId, userName, reason) {
  try {
    console.log(`[COMMISSION] Starting full recalculation by ${userName}`);

    const ordersWithSalesPerson = await prisma.order.findMany({
      where: { sku: { not: null } },
      include: { items: true },
    });

    console.log(`[COMMISSION] Found ${ordersWithSalesPerson.length} orders with sales people`);

    const results = { total: ordersWithSalesPerson.length, created: 0, recalculated: 0, skipped: 0, failed: 0, details: [] };

    for (const order of ordersWithSalesPerson) {
      try {
        const existingCommission = await prisma.commission.findFirst({
          where: { orderId: order.id },
          include: { itemCommissions: { include: { payouts: true } } },
        });

        let oldAmount  = 0;
        let actionType = 'created';

        if (existingCommission) {
          const hasPaidPayouts = existingCommission.itemCommissions.some(ic => ic.payouts.some(p => p.status === 'PAID'));
          if (hasPaidPayouts) {
            const result = await addNewItemsToExistingCommission(existingCommission, order);
            if (result && result.totalCommissionAmount !== existingCommission.totalCommissionAmount) {
              results.recalculated++;
              results.details.push({ orderId: order.id, salesPerson: order.sku, status: 'incremental_update', oldAmount: existingCommission.totalCommissionAmount, newAmount: result.totalCommissionAmount, difference: result.totalCommissionAmount - existingCommission.totalCommissionAmount, note: 'Has paid payouts - only added new items' });
            } else {
              results.skipped++;
              results.details.push({ orderId: order.id, salesPerson: order.sku, status: 'skipped', reason: 'Has paid payouts, no new items to add' });
            }
            continue;
          }
          oldAmount  = existingCommission.totalCommissionAmount;
          actionType = 'recalculated';
        }

        await calculateCommissionForOrder(order);
        const updated   = await prisma.commission.findFirst({ where: { orderId: order.id } });
        const newAmount = updated?.totalCommissionAmount || 0;

        if (actionType === 'created') results.created++; else results.recalculated++;
        results.details.push({ orderId: order.id, salesPerson: order.sku, status: actionType, oldAmount: actionType === 'recalculated' ? oldAmount : 0, newAmount, difference: newAmount - oldAmount });
      } catch (error) {
        results.failed++;
        results.details.push({ orderId: order.id, salesPerson: order.sku, status: 'failed', error: error.message });
        console.error(`[COMMISSION] Failed to process order ${order.id}:`, error);
      }
    }

    await prisma.auditLog.create({
      data: {
        entityType: 'Commission', entityId: 'BULK', action: 'BULK_RECALCULATION',
        metadata: JSON.stringify({ reason, results, timestamp: new Date() }),
        performedByUserId: userId, performedByName: userName,
      },
    });

    await notifyAgentsOfRecalculation(results, reason);

    console.log(`[COMMISSION] Recalculation complete: ${results.created} created, ${results.recalculated} updated, ${results.skipped} skipped, ${results.failed} failed`);
    return results;
  } catch (error) {
    console.error('[COMMISSION] Error in bulk recalculation:', error);
    throw error;
  }
}

async function notifyAgentsOfRecalculation(results, reason) {
  try {
    const bySalesPerson = {};
    results.details.forEach(detail => {
      if (['recalculated', 'created', 'incremental_update'].includes(detail.status)) {
        if (!bySalesPerson[detail.salesPerson]) bySalesPerson[detail.salesPerson] = { orders: [], totalChange: 0 };
        bySalesPerson[detail.salesPerson].orders.push(detail);
        bySalesPerson[detail.salesPerson].totalChange += detail.difference || 0;
      }
    });

    for (const [salesPerson, data] of Object.entries(bySalesPerson)) {
      const user = await prisma.user.findFirst({ where: { name: salesPerson, isActive: true } });
      if (!user) continue;

      const changeText = data.totalChange > 0
        ? `increased by $${data.totalChange.toFixed(2)}`
        : data.totalChange < 0
        ? `decreased by $${Math.abs(data.totalChange).toFixed(2)}`
        : 'remained the same';

      await prisma.notification.create({
        data: {
          userId: user.id, type: 'COMMISSION', category: 'INFO',
          title: 'Commission Recalculation Notice',
          message: `Your commissions have been recalculated. Total change: ${changeText}. Reason: ${reason}`,
          metadata: JSON.stringify({ orderCount: data.orders.length, totalChange: data.totalChange, reason, orders: data.orders.map(o => ({ orderId: o.orderId, change: o.difference })) }),
          priority: 'NORMAL',
        },
      });
    }
  } catch (error) {
    console.error('[COMMISSION] Error notifying agents:', error);
  }
}

export default {
  calculateCommissionForOrder,
  recalculateCommissionIfPriceChanged,
  checkCommissionPayoutTrigger,
  checkOrderedStatusTrigger,
  recalculateAllCommissions,
};
