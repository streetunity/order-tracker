// api/src/helpers/commission.js
// Item-level commission calculation with proportional discount allocation

import { PrismaClient } from '@prisma/client';
import { STAGES, STAGE_INDEX } from '../state.js';

const prisma = new PrismaClient();

/**
 * Check if a stage is at or past another stage
 * Now uses the system's STAGES configuration from state.js
 */
function isStageAtOrPast(currentStage, targetStage) {
  const currentIndex = STAGE_INDEX[currentStage];
  const targetIndex = STAGE_INDEX[targetStage];
  
  // Handle cases where stages might not be found in the index
  if (currentIndex === undefined || targetIndex === undefined) {
    console.warn(`[COMMISSION] Stage not found in STAGE_INDEX: current=${currentStage}, target=${targetStage}`);
    return false;
  }
  
  return currentIndex >= targetIndex;
}

/**
 * Statuses that represent an active commission eligible for payout triggers.
 * CALCULATED = fresh commission, no payouts yet
 * PARTIAL_PAID = some payouts completed, remaining items still need triggers
 * Blocked statuses: ORPHANED, CANCELLED, AWAITING_PRICES, FLAGGED, FULLY_PAID
 */
const ACTIVE_COMMISSION_STATUSES = ['CALCULATED', 'PARTIAL_PAID'];

/**
 * Get payout stage settings from database (or create defaults)
 */
async function getPayoutStageSettings() {
  let stageSettings = await prisma.commissionStageSetting.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  });
  
  if (stageSettings.length === 0) {
    console.log('[COMMISSION] No stage settings found - creating defaults (SHIPPING 50%, DELIVERED 50%)');
    await prisma.commissionStageSetting.createMany({
      data: [
        { stage: 'SHIPPING', percentage: 50, sortOrder: 1, isActive: true },
        { stage: 'DELIVERED', percentage: 50, sortOrder: 2, isActive: true }
      ]
    });
    
    stageSettings = await prisma.commissionStageSetting.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
  }
  
  return stageSettings;
}

/**
 * Calculate commissions for an order at the item level with proportional discount allocation
 * @param {Object} order - Order object with items
 * @returns {Promise<Commission|null>}
 */
export async function calculateCommissionForOrder(order) {
  try {
    // Fetch full order with items if not already included
    const fullOrder = order.items ? order : await prisma.order.findUnique({
      where: { id: order.id || order },
      include: { items: true }
    });
    
    if (!fullOrder) {
      console.log(`[COMMISSION] Order ${order.id || order} not found`);
      return null;
    }
    
    // Skip if no sales person
    if (!fullOrder.sku) {
      console.log(`[COMMISSION] No sales person for order ${fullOrder.id}`);
      await flagMissingSalesRep(fullOrder.id);
      return null;
    }
    
    // Get commission rate for sales person
    let rate = 5.0; // Default rate
    const customRate = await prisma.commissionRate.findUnique({
      where: { salesPersonName: fullOrder.sku }
    });
    
    if (customRate) {
      rate = customRate.rate;
    } else {
      // Check for global default rate
      const settings = await prisma.commissionSettings.findFirst();
      if (settings?.defaultRate) {
        rate = settings.defaultRate;
      }
    }
    
    // Calculate order totals
    let orderSubtotal = 0;
    let hasAllPrices = true;
    const pricedItems = [];
    
    for (const item of fullOrder.items) {
      if (item.itemPrice && item.itemPrice > 0) {
        const itemTotal = item.itemPrice * (item.qty || 1);
        orderSubtotal += itemTotal;
        pricedItems.push({
          ...item,
          itemTotal
        });
      } else {
        hasAllPrices = false;
      }
    }
    
    // Get order discount (stored as positive number)
    const orderDiscount = fullOrder.discount || 0;
    const orderNetTotal = orderSubtotal - orderDiscount;
    
    // Flag if missing prices
    if (!hasAllPrices) {
      console.log(`[COMMISSION] Order ${fullOrder.id} has items without prices - flagging`);
      return await createFlaggedCommission(fullOrder, rate, orderSubtotal, orderDiscount, 'AWAITING_PRICES');
    }
    
    // Check if commission already exists
    let commission = await prisma.commission.findFirst({
      where: { orderId: fullOrder.id },
      include: { itemCommissions: true }
    });
    
    if (commission) {
      // Delete existing item commissions and payouts for recalculation
      await prisma.itemCommission.deleteMany({
        where: { commissionId: commission.id }
      });
      
      // Update aggregate commission
      commission = await prisma.commission.update({
        where: { id: commission.id },
        data: {
          salesPersonName: fullOrder.sku,
          orderSubtotal,
          orderDiscount,
          orderNetTotal,
          commissionRate: rate,
          totalCommissionAmount: (orderNetTotal * rate) / 100,
          status: 'CALCULATED',
          isFlagged: false,
          flagReason: null,
          flagDetails: null,
          calculatedAt: new Date()
        }
      });
    } else {
      // Create new aggregate commission
      commission = await prisma.commission.create({
        data: {
          orderId: fullOrder.id,
          salesPersonName: fullOrder.sku,
          orderSubtotal,
          orderDiscount,
          orderNetTotal,
          commissionRate: rate,
          totalCommissionAmount: (orderNetTotal * rate) / 100,
          status: 'CALCULATED',
          calculatedAt: new Date()
        }
      });
    }
    
    // Create item-level commissions with proportional discount allocation
    await createItemCommissions(commission, pricedItems, orderSubtotal, orderDiscount, rate);
    
    console.log(`[COMMISSION] Calculated commission for order ${fullOrder.id}: $${commission.totalCommissionAmount.toFixed(2)} (Rate: ${rate}%)`);
    console.log(`[COMMISSION] Order subtotal: $${orderSubtotal.toFixed(2)}, Discount: $${orderDiscount.toFixed(2)}, Net: $${orderNetTotal.toFixed(2)}`);
    
    return commission;
  } catch (error) {
    console.error(`[COMMISSION] Error calculating commission:`, error);
    return null;
  }
}

/**
 * Create item-level commissions with proportional discount distribution
 * CRITICAL: Auto-triggers payouts for items already at/past payout stages AND marked as ordered
 * Payout stages are dynamically loaded from CommissionStageSetting table
 */
async function createItemCommissions(commission, pricedItems, orderSubtotal, orderDiscount, rate) {
  const stageSettings = await getPayoutStageSettings();
  
  console.log(`[COMMISSION] Using ${stageSettings.length} payout stages from database:`, stageSettings.map(s => `${s.stage} (${s.percentage}%)`).join(', '));
  
  // Create item commission for each priced item
  for (const item of pricedItems) {
    const itemSubtotal = item.itemTotal;
    
    // Calculate proportional discount allocation
    const discountPercentage = orderSubtotal > 0 ? (itemSubtotal / orderSubtotal) : 0;
    const allocatedDiscount = orderDiscount * discountPercentage;
    const netAmount = itemSubtotal - allocatedDiscount;
    const commissionAmount = (netAmount * rate) / 100;
    
    // Create item commission record
    const itemCommission = await prisma.itemCommission.create({
      data: {
        commissionId: commission.id,
        itemId: item.id,
        orderId: commission.orderId,
        productCode: item.productCode,
        qty: item.qty,
        itemPrice: item.itemPrice,
        itemSubtotal,
        allocatedDiscount,
        discountPercentage: discountPercentage * 100, // Store as percentage
        netAmount,
        commissionRate: rate,
        commissionAmount,
        status: 'CALCULATED'
      }
    });
    
    // CRITICAL: Check item's current stage AND ordered status
    const currentItemStage = item.currentStage || 'MANUFACTURING';
    const isOrdered = item.isOrdered === true;
    
    // Create payouts for each stage for this item
    let triggeredCount = 0;
    for (const setting of stageSettings) {
      // Determine initial payout status
      // CRITICAL: Item must be ORDERED, NOT in PENDING_FUNDING, and at/past stage to trigger
      const shouldTrigger = isOrdered &&
                           currentItemStage !== 'PENDING_FUNDING' &&
                           isStageAtOrPast(currentItemStage, setting.stage);
      const payoutStatus = shouldTrigger ? 'PENDING' : 'WAITING';
      
      await prisma.commissionPayout.create({
        data: {
          itemCommissionId: itemCommission.id,
          commissionId: commission.id,
          stage: setting.stage,
          percentage: setting.percentage,
          amount: (commissionAmount * setting.percentage) / 100,
          status: payoutStatus,
          triggeredByItemId: item.id,
          triggeredAt: shouldTrigger ? new Date() : null
        }
      });
      
      if (shouldTrigger) {
        triggeredCount++;
        console.log(`[COMMISSION] Auto-triggered ${setting.stage} payout for item ${item.productCode} (ordered=${isOrdered}, stage=${currentItemStage})`);
      }
    }
    
    console.log(`[COMMISSION] Item ${item.productCode}: Subtotal $${itemSubtotal.toFixed(2)}, Discount $${allocatedDiscount.toFixed(2)} (${(discountPercentage * 100).toFixed(2)}%), Net $${netAmount.toFixed(2)}, Commission $${commissionAmount.toFixed(2)}`);
    
    if (!isOrdered) {
      console.log(`[COMMISSION] Item ${item.productCode} NOT ordered yet - payouts remain in WAITING`);
    } else if (triggeredCount > 0) {
      console.log(`[COMMISSION] Auto-triggered ${triggeredCount} payout(s) for item ${item.productCode}`);
    }
  }
  
  // After creating all payouts, check if we need to notify about pending payouts
  const pendingPayouts = await prisma.commissionPayout.findMany({
    where: {
      commissionId: commission.id,
      status: 'PENDING'
    },
    include: {
      itemCommission: true
    }
  });
  
  if (pendingPayouts.length > 0) {
    console.log(`[COMMISSION] Created ${pendingPayouts.length} PENDING payouts (items already ordered and at trigger stages)`);
    // Group by item and notify
    const itemGroups = {};
    pendingPayouts.forEach(p => {
      const itemId = p.itemCommission.itemId;
      if (!itemGroups[itemId]) {
        itemGroups[itemId] = {
          itemCommission: p.itemCommission,
          payouts: []
        };
      }
      itemGroups[itemId].payouts.push(p);
    });
    
    // Create notifications for each item with pending payouts
    for (const [itemId, group] of Object.entries(itemGroups)) {
      await createPayoutNotification(
        commission,
        group.itemCommission,
        group.itemCommission.productCode,
        group.payouts
      );
    }
  }
}

/**
 * Create a flagged commission when issues are detected
 */
async function createFlaggedCommission(order, rate, orderSubtotal, orderDiscount, flagReason) {
  const commission = await prisma.commission.upsert({
    where: { orderId: order.id },
    update: {
      salesPersonName: order.sku,
      orderSubtotal,
      orderDiscount,
      orderNetTotal: orderSubtotal - orderDiscount,
      commissionRate: rate,
      totalCommissionAmount: 0,
      status: 'AWAITING_PRICES',
      isFlagged: true,
      flagReason,
      flagDetails: JSON.stringify({
        message: 'Some items missing prices',
        timestamp: new Date()
      })
    },
    create: {
      orderId: order.id,
      salesPersonName: order.sku,
      orderSubtotal,
      orderDiscount,
      orderNetTotal: orderSubtotal - orderDiscount,
      commissionRate: rate,
      totalCommissionAmount: 0,
      status: 'AWAITING_PRICES',
      isFlagged: true,
      flagReason,
      flagDetails: JSON.stringify({
        message: 'Some items missing prices',
        timestamp: new Date()
      })
    }
  });
  
  return commission;
}

/**
 * Flag commission when sales rep is missing
 */
async function flagMissingSalesRep(orderId) {
  const commission = await prisma.commission.findFirst({
    where: { orderId }
  });
  
  if (commission) {
    await prisma.commission.update({
      where: { id: commission.id },
      data: {
        isFlagged: true,
        flagReason: 'NO_SALES_REP',
        flagDetails: JSON.stringify({
          message: 'No sales person assigned to order',
          timestamp: new Date()
        })
      }
    });
  }
}

/**
 * Recalculate commission if prices or discount changed
 * 
 * FIX: When paid payouts exist, instead of bailing out entirely, we now:
 * 1. Preserve all existing ItemCommissions and their payouts (paid or not)
 * 2. Add NEW ItemCommissions for items that don't have one yet
 * 3. Update the aggregate commission totals to reflect the new items
 * This ensures new items added to orders with paid commissions still get tracked.
 */
export async function recalculateCommissionIfPriceChanged(orderId) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });
    
    if (!order) {
      console.log(`[COMMISSION] Order ${orderId} not found for recalculation`);
      return null;
    }
    
    // Check if commission exists
    const commission = await prisma.commission.findFirst({
      where: { orderId },
      include: {
        itemCommissions: {
          include: { payouts: true }
        }
      }
    });
    
    if (!commission) {
      // No commission yet, calculate from scratch
      return await calculateCommissionForOrder(order);
    }
    
    // Check if any payout is already paid
    const hasPaidPayouts = commission.itemCommissions.some(ic =>
      ic.payouts.some(p => p.status === 'PAID')
    );
    
    if (hasPaidPayouts) {
      // FIX: Instead of bailing out, add commissions for NEW items only
      console.log(`[COMMISSION] Commission ${commission.id} has paid payouts - using incremental update for new items`);
      return await addNewItemsToExistingCommission(commission, order);
    }
    
    // No paid payouts - safe to do full recalculation
    console.log(`[COMMISSION] Recalculating commission for order ${orderId}`);
    return await calculateCommissionForOrder(order);
  } catch (error) {
    console.error(`[COMMISSION] Error recalculating commission for order ${orderId}:`, error);
    return null;
  }
}

/**
 * Add ItemCommissions for new items on an order that already has paid payouts.
 * Preserves all existing records (paid, pending, waiting) and only creates
 * new ItemCommission + payouts for items that don't have one yet.
 * Updates the aggregate Commission totals to reflect the full order.
 */
async function addNewItemsToExistingCommission(commission, order) {
  try {
    const rate = commission.commissionRate;
    
    // Find which items already have ItemCommission records
    const existingItemIds = new Set(commission.itemCommissions.map(ic => ic.itemId));
    
    // Calculate full order totals (needed for proportional discount allocation)
    let orderSubtotal = 0;
    const allPricedItems = [];
    const newPricedItems = [];
    
    for (const item of order.items) {
      if (item.itemPrice && item.itemPrice > 0) {
        const itemTotal = item.itemPrice * (item.qty || 1);
        orderSubtotal += itemTotal;
        allPricedItems.push({ ...item, itemTotal });
        
        if (!existingItemIds.has(item.id)) {
          newPricedItems.push({ ...item, itemTotal });
        }
      }
    }
    
    if (newPricedItems.length === 0) {
      console.log(`[COMMISSION] No new items to add for order ${order.id}`);
      return commission;
    }
    
    const orderDiscount = order.discount || 0;
    const orderNetTotal = orderSubtotal - orderDiscount;
    
    console.log(`[COMMISSION] Adding ${newPricedItems.length} new item(s) to commission ${commission.id}`);
    
    // Get payout stage settings
    const stageSettings = await getPayoutStageSettings();
    
    // Create ItemCommission + payouts for each new item
    for (const item of newPricedItems) {
      const itemSubtotal = item.itemTotal;
      const discountPercentage = orderSubtotal > 0 ? (itemSubtotal / orderSubtotal) : 0;
      const allocatedDiscount = orderDiscount * discountPercentage;
      const netAmount = itemSubtotal - allocatedDiscount;
      const commissionAmount = (netAmount * rate) / 100;
      
      const itemCommission = await prisma.itemCommission.create({
        data: {
          commissionId: commission.id,
          itemId: item.id,
          orderId: order.id,
          productCode: item.productCode,
          qty: item.qty,
          itemPrice: item.itemPrice,
          itemSubtotal,
          allocatedDiscount,
          discountPercentage: discountPercentage * 100,
          netAmount,
          commissionRate: rate,
          commissionAmount,
          status: 'CALCULATED'
        }
      });
      
      // Create payouts for each stage
      const currentItemStage = item.currentStage || 'MANUFACTURING';
      const isOrdered = item.isOrdered === true;
      
      for (const setting of stageSettings) {
        const shouldTrigger = isOrdered &&
                             currentItemStage !== 'PENDING_FUNDING' &&
                             isStageAtOrPast(currentItemStage, setting.stage);
        const payoutStatus = shouldTrigger ? 'PENDING' : 'WAITING';
        
        await prisma.commissionPayout.create({
          data: {
            itemCommissionId: itemCommission.id,
            commissionId: commission.id,
            stage: setting.stage,
            percentage: setting.percentage,
            amount: (commissionAmount * setting.percentage) / 100,
            status: payoutStatus,
            triggeredByItemId: item.id,
            triggeredAt: shouldTrigger ? new Date() : null
          }
        });
        
        if (shouldTrigger) {
          console.log(`[COMMISSION] Auto-triggered ${setting.stage} payout for new item ${item.productCode}`);
        }
      }
      
      console.log(`[COMMISSION] Added new item ${item.productCode}: Commission $${commissionAmount.toFixed(2)} (${isOrdered ? 'ordered' : 'not ordered'}, stage: ${currentItemStage})`);
    }
    
    // Update aggregate commission totals to include new items
    const updatedCommission = await prisma.commission.update({
      where: { id: commission.id },
      data: {
        orderSubtotal,
        orderDiscount,
        orderNetTotal,
        totalCommissionAmount: (orderNetTotal * rate) / 100,
        calculatedAt: new Date()
      }
    });
    
    // Update commission status based on all payouts
    await updateCommissionStatus(commission.id);
    
    // Create notifications for any new pending payouts
    const newPendingPayouts = await prisma.commissionPayout.findMany({
      where: {
        commissionId: commission.id,
        status: 'PENDING',
        triggeredByItemId: { in: newPricedItems.map(i => i.id) }
      },
      include: { itemCommission: true }
    });
    
    if (newPendingPayouts.length > 0) {
      const itemGroups = {};
      newPendingPayouts.forEach(p => {
        const itemId = p.itemCommission.itemId;
        if (!itemGroups[itemId]) {
          itemGroups[itemId] = { itemCommission: p.itemCommission, payouts: [] };
        }
        itemGroups[itemId].payouts.push(p);
      });
      
      for (const [itemId, group] of Object.entries(itemGroups)) {
        await createPayoutNotification(commission, group.itemCommission, group.itemCommission.productCode, group.payouts);
      }
    }
    
    console.log(`[COMMISSION] Updated commission ${commission.id}: new total $${updatedCommission.totalCommissionAmount.toFixed(2)}`);
    return updatedCommission;
  } catch (error) {
    console.error(`[COMMISSION] Error adding new items to commission:`, error);
    return commission;
  }
}

/**
 * Check if an item reaching a stage triggers a payout
 * CRITICAL: Also checks if item is marked as ordered
 * This is called when an individual item's stage changes OR when marked as ordered
 * 
 * FIX: Now allows triggers on PARTIAL_PAID commissions (not just CALCULATED).
 * The payout-level filter (only touching WAITING payouts) protects paid records.
 */
export async function checkCommissionPayoutTrigger(orderId, itemId, oldStage, newStage) {
  try {
    if (oldStage === newStage) return;
    
    console.log(`[COMMISSION] Item ${itemId} stage changed: ${oldStage} → ${newStage}`);
    
    // Get item to check ordered status
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: { isOrdered: true, currentStage: true }
    });
    
    if (!item) {
      console.log(`[COMMISSION] Item ${itemId} not found`);
      return;
    }
    
    // CRITICAL: Item must be ordered to trigger payouts
    if (!item.isOrdered) {
      console.log(`[COMMISSION] Item ${itemId} not marked as ordered - no payout trigger`);
      return;
    }

    // CRITICAL: Items in PENDING_FUNDING stage should not trigger commissions
    if (newStage === 'PENDING_FUNDING') {
      console.log(`[COMMISSION] Item ${itemId} in PENDING_FUNDING - no payout trigger`);
      return;
    }

    // Find the commission and item commission
    const commission = await prisma.commission.findFirst({
      where: { orderId },
      include: {
        itemCommissions: {
          where: { itemId },
          include: { payouts: true }
        }
      }
    });
    
    // FIX: Allow both CALCULATED and PARTIAL_PAID commissions to trigger payouts
    if (!commission || !ACTIVE_COMMISSION_STATUSES.includes(commission.status)) {
      console.log(`[COMMISSION] No active commission for order ${orderId} (status: ${commission?.status || 'not found'})`);
      return;
    }
    
    const itemCommission = commission.itemCommissions[0];
    if (!itemCommission) {
      console.log(`[COMMISSION] No item commission found for item ${itemId}`);
      return;
    }
    
    // Check if new stage triggers any payouts for this specific item
    const triggeredPayouts = itemCommission.payouts.filter(p => 
      p.stage === newStage && p.status === 'WAITING'
    );
    
    if (triggeredPayouts.length === 0) {
      console.log(`[COMMISSION] No waiting payouts for stage ${newStage} on item ${itemId}`);
      return;
    }
    
    // Trigger payouts for this item
    for (const payout of triggeredPayouts) {
      await prisma.commissionPayout.update({
        where: { id: payout.id },
        data: { 
          status: 'PENDING',
          triggeredAt: new Date()
        }
      });
      
      console.log(`[COMMISSION] Triggered payout $${payout.amount.toFixed(2)} for item ${itemId} at stage ${newStage} (ordered=true)`);
    }
    
    // Check if commission status needs updating
    await updateCommissionStatus(commission.id);
    
    // Create notification for admins
    await createPayoutNotification(commission, itemCommission, newStage, triggeredPayouts);
    
  } catch (error) {
    console.error(`[COMMISSION] Error checking payout trigger:`, error);
  }
}

/**
 * Check if marking an item as ordered triggers any payouts
 * Called when isOrdered changes from false to true
 * 
 * FIX: Now allows triggers on PARTIAL_PAID commissions (not just CALCULATED).
 * The payout-level filter (only touching WAITING payouts) protects paid records.
 */
export async function checkOrderedStatusTrigger(orderId, itemId) {
  try {
    console.log(`[COMMISSION] Item ${itemId} marked as ordered - checking for payout triggers`);
    
    // Get item's current stage
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: { currentStage: true }
    });
    
    if (!item) {
      console.log(`[COMMISSION] Item ${itemId} not found`);
      return;
    }
    
    // Find the commission and item commission
    const commission = await prisma.commission.findFirst({
      where: { orderId },
      include: {
        itemCommissions: {
          where: { itemId },
          include: { payouts: true }
        }
      }
    });
    
    // FIX: Allow both CALCULATED and PARTIAL_PAID commissions to trigger payouts
    if (!commission || !ACTIVE_COMMISSION_STATUSES.includes(commission.status)) {
      console.log(`[COMMISSION] No active commission for order ${orderId} (status: ${commission?.status || 'not found'})`);
      return;
    }
    
    const itemCommission = commission.itemCommissions[0];
    if (!itemCommission) {
      console.log(`[COMMISSION] No item commission found for item ${itemId}`);
      return;
    }
    
    // Check which stages this item has already reached
    const currentStage = item.currentStage || 'MANUFACTURING';
    const triggeredPayouts = [];

    // Do not trigger payouts if item is in PENDING_FUNDING
    if (currentStage === 'PENDING_FUNDING') {
      console.log(`[COMMISSION] Item ${itemId} in PENDING_FUNDING - no payouts triggered on ordered status change`);
      return;
    }

    for (const payout of itemCommission.payouts) {
      // Trigger if item is at/past this stage and payout is waiting
      if (payout.status === 'WAITING' && isStageAtOrPast(currentStage, payout.stage)) {
        await prisma.commissionPayout.update({
          where: { id: payout.id },
          data: { 
            status: 'PENDING',
            triggeredAt: new Date()
          }
        });
        
        triggeredPayouts.push(payout);
        console.log(`[COMMISSION] Triggered ${payout.stage} payout for item ${itemId} (already at ${currentStage})`);
      }
    }
    
    if (triggeredPayouts.length > 0) {
      // Update commission status
      await updateCommissionStatus(commission.id);
      
      // Create notification
      await createPayoutNotification(commission, itemCommission, currentStage, triggeredPayouts);
    }
    
  } catch (error) {
    console.error(`[COMMISSION] Error checking ordered status trigger:`, error);
  }
}

/**
 * Update commission aggregate status based on item payouts
 */
async function updateCommissionStatus(commissionId) {
  const allPayouts = await prisma.commissionPayout.findMany({
    where: { commissionId }
  });
  
  const allPaid = allPayouts.every(p => p.status === 'PAID');
  const somePaid = allPayouts.some(p => p.status === 'PAID');
  
  if (allPaid) {
    await prisma.commission.update({
      where: { id: commissionId },
      data: { status: 'FULLY_PAID' }
    });
  } else if (somePaid) {
    await prisma.commission.update({
      where: { id: commissionId },
      data: { status: 'PARTIAL_PAID' }
    });
  }
}

/**
 * Create notification for pending commission approval
 */
async function createPayoutNotification(commission, itemCommission, stage, payouts) {
  try {
    const admins = await prisma.user.findMany({
      where: { 
        role: { in: ['SUPER_ADMIN', 'ACCOUNTANT'] },
        isActive: true
      }
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
            commissionId: commission.id,
            itemCommissionId: itemCommission.id,
            itemId: itemCommission.itemId,
            amount: totalAmount,
            stage,
            productCode: itemCommission.productCode
          }),
          priority: 'NORMAL'
        }
      });
    }
  } catch (error) {
    console.error('[COMMISSION] Error creating notification:', error);
  }
}

/**
 * Recalculate ALL commissions (SUPER_ADMIN only)
 * FIXED: Now also creates commissions for orders that don't have them yet
 * Used when commission rates change or system needs recalculation
 */
export async function recalculateAllCommissions(userId, userName, reason) {
  try {
    console.log(`[COMMISSION] Starting full recalculation by ${userName}`);
    
    // FIXED: Get ALL orders with sales people, not just existing commissions
    const ordersWithSalesPerson = await prisma.order.findMany({
      where: {
        sku: { not: null }  // Orders with sales people assigned
      },
      include: {
        items: true
      }
    });
    
    console.log(`[COMMISSION] Found ${ordersWithSalesPerson.length} orders with sales people`);
    
    const results = {
      total: ordersWithSalesPerson.length,
      created: 0,
      recalculated: 0,
      skipped: 0,
      failed: 0,
      details: []
    };
    
    for (const order of ordersWithSalesPerson) {
      try {
        // Check if commission exists
        const existingCommission = await prisma.commission.findFirst({
          where: { orderId: order.id },
          include: {
            itemCommissions: {
              include: { payouts: true }
            }
          }
        });
        
        let oldAmount = 0;
        let actionType = 'created';
        
        if (existingCommission) {
          // Check if any payout is paid
          const hasPaidPayouts = existingCommission.itemCommissions.some(ic =>
            ic.payouts.some(p => p.status === 'PAID')
          );
          
          if (hasPaidPayouts) {
            // Use incremental update instead of skipping entirely
            const result = await addNewItemsToExistingCommission(existingCommission, order);
            if (result && result.totalCommissionAmount !== existingCommission.totalCommissionAmount) {
              results.recalculated++;
              results.details.push({
                orderId: order.id,
                salesPerson: order.sku,
                status: 'incremental_update',
                oldAmount: existingCommission.totalCommissionAmount,
                newAmount: result.totalCommissionAmount,
                difference: result.totalCommissionAmount - existingCommission.totalCommissionAmount,
                note: 'Has paid payouts - only added new items'
              });
            } else {
              results.skipped++;
              results.details.push({
                orderId: order.id,
                salesPerson: order.sku,
                status: 'skipped',
                reason: 'Has paid payouts, no new items to add'
              });
            }
            continue;
          }
          
          oldAmount = existingCommission.totalCommissionAmount;
          actionType = 'recalculated';
        }
        
        // Calculate/recalculate commission (this handles both creation and updates)
        await calculateCommissionForOrder(order);
        
        // Get new amount
        const updated = await prisma.commission.findFirst({
          where: { orderId: order.id }
        });
        
        const newAmount = updated?.totalCommissionAmount || 0;
        
        if (actionType === 'created') {
          results.created++;
        } else {
          results.recalculated++;
        }
        
        results.details.push({
          orderId: order.id,
          salesPerson: order.sku,
          status: actionType,
          oldAmount: actionType === 'recalculated' ? oldAmount : 0,
          newAmount,
          difference: newAmount - oldAmount
        });
        
      } catch (error) {
        results.failed++;
        results.details.push({
          orderId: order.id,
          salesPerson: order.sku,
          status: 'failed',
          error: error.message
        });
        console.error(`[COMMISSION] Failed to process order ${order.id}:`, error);
      }
    }
    
    // Log the recalculation in audit
    await prisma.auditLog.create({
      data: {
        entityType: 'Commission',
        entityId: 'BULK',
        action: 'BULK_RECALCULATION',
        metadata: JSON.stringify({
          reason,
          results,
          timestamp: new Date()
        }),
        performedByUserId: userId,
        performedByName: userName
      }
    });
    
    // Notify affected agents
    await notifyAgentsOfRecalculation(results, reason);
    
    console.log(`[COMMISSION] Recalculation complete: ${results.created} created, ${results.recalculated} updated, ${results.skipped} skipped, ${results.failed} failed`);
    
    return results;
  } catch (error) {
    console.error('[COMMISSION] Error in bulk recalculation:', error);
    throw error;
  }
}

/**
 * Notify sales agents when their commissions are recalculated
 */
async function notifyAgentsOfRecalculation(results, reason) {
  try {
    // Group by sales person
    const bySalesPerson = {};
    
    results.details.forEach(detail => {
      if (detail.status === 'recalculated' || detail.status === 'created' || detail.status === 'incremental_update') {
        if (!bySalesPerson[detail.salesPerson]) {
          bySalesPerson[detail.salesPerson] = {
            orders: [],
            totalChange: 0
          };
        }
        bySalesPerson[detail.salesPerson].orders.push(detail);
        bySalesPerson[detail.salesPerson].totalChange += detail.difference || 0;
      }
    });
    
    // Create notifications for each sales person
    for (const [salesPerson, data] of Object.entries(bySalesPerson)) {
      // Find user
      const user = await prisma.user.findFirst({
        where: { 
          name: salesPerson,
          isActive: true
        }
      });
      
      if (!user) continue;
      
      const changeText = data.totalChange > 0 
        ? `increased by $${data.totalChange.toFixed(2)}`
        : data.totalChange < 0
        ? `decreased by $${Math.abs(data.totalChange).toFixed(2)}`
        : 'remained the same';
      
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'COMMISSION',
          category: 'INFO',
          title: 'Commission Recalculation Notice',
          message: `Your commissions have been recalculated. Total change: ${changeText}. Reason: ${reason}`,
          metadata: JSON.stringify({
            orderCount: data.orders.length,
            totalChange: data.totalChange,
            reason,
            orders: data.orders.map(o => ({ orderId: o.orderId, change: o.difference }))
          }),
          priority: 'NORMAL'
        }
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
  recalculateAllCommissions
};
