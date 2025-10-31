// api/src/helpers/commission.js
// Item-level commission calculation with proportional discount allocation

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Define stage order for comparison
const STAGE_ORDER = [
  'MANUFACTURING',
  'TESTING',
  'PACKAGING',
  'SHIPPING',
  'IN_TRANSIT',
  'DELIVERED',
  'INSTALLED'
];

/**
 * Check if a stage is at or past another stage
 */
function isStageAtOrPast(currentStage, targetStage) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const targetIndex = STAGE_ORDER.indexOf(targetStage);
  return currentIndex >= targetIndex;
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
 * CRITICAL: Auto-triggers payouts for items already at/past payout stages
 */
async function createItemCommissions(commission, pricedItems, orderSubtotal, orderDiscount, rate) {
  // Get stage settings for payout configuration
  let stageSettings = await prisma.commissionStageSetting.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  });
  
  // Create default stage settings if none exist
  if (stageSettings.length === 0) {
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
    
    // CRITICAL FIX: Check item's current stage
    const currentItemStage = item.currentStage || 'MANUFACTURING';
    
    // Create payouts for each stage for this item
    let triggeredCount = 0;
    for (const setting of stageSettings) {
      // Determine initial payout status
      // If item is already at or past this stage, trigger immediately
      const shouldTrigger = isStageAtOrPast(currentItemStage, setting.stage);
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
        console.log(`[COMMISSION] Auto-triggered ${setting.stage} payout for item ${item.productCode} (already at ${currentItemStage})`);
      }
    }
    
    console.log(`[COMMISSION] Item ${item.productCode}: Subtotal $${itemSubtotal.toFixed(2)}, Discount $${allocatedDiscount.toFixed(2)} (${(discountPercentage * 100).toFixed(2)}%), Net $${netAmount.toFixed(2)}, Commission $${commissionAmount.toFixed(2)}`);
    
    if (triggeredCount > 0) {
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
    console.log(`[COMMISSION] Created ${pendingPayouts.length} PENDING payouts (items already at trigger stages)`);
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
      where: { orderId }
    });
    
    if (!commission) {
      // No commission yet, calculate it
      return await calculateCommissionForOrder(order);
    }
    
    // Check if any payout is already paid - cannot recalculate
    const paidPayouts = await prisma.commissionPayout.findFirst({
      where: {
        commissionId: commission.id,
        status: 'PAID'
      }
    });
    
    if (paidPayouts) {
      console.log(`[COMMISSION] Cannot recalculate commission ${commission.id} - has paid payouts`);
      return commission;
    }
    
    // Recalculate
    console.log(`[COMMISSION] Recalculating commission for order ${orderId}`);
    return await calculateCommissionForOrder(order);
  } catch (error) {
    console.error(`[COMMISSION] Error recalculating commission for order ${orderId}:`, error);
    return null;
  }
}

/**
 * Check if an item reaching a stage triggers a payout
 * This is called when an individual item's stage changes
 */
export async function checkCommissionPayoutTrigger(orderId, itemId, oldStage, newStage) {
  try {
    if (oldStage === newStage) return;
    
    console.log(`[COMMISSION] Item ${itemId} stage changed: ${oldStage} → ${newStage}`);
    
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
    
    if (!commission || commission.status !== 'CALCULATED') {
      console.log(`[COMMISSION] No calculated commission for order ${orderId}`);
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
      
      console.log(`[COMMISSION] Triggered payout $${payout.amount.toFixed(2)} for item ${itemId} at stage ${newStage}`);
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
 * Recalculate ALL unpaid commissions (SUPER_ADMIN only)
 * Used when commission rates change or system needs recalculation
 */
export async function recalculateAllCommissions(userId, userName, reason) {
  try {
    console.log(`[COMMISSION] Starting full recalculation by ${userName}`);
    
    // Get all commissions with no paid payouts
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
    
    const results = {
      total: commissions.length,
      recalculated: 0,
      skipped: 0,
      failed: 0,
      details: []
    };
    
    for (const commission of commissions) {
      // Check if any payout is paid
      const hasPaidPayouts = commission.itemCommissions.some(ic =>
        ic.payouts.some(p => p.status === 'PAID')
      );
      
      if (hasPaidPayouts) {
        results.skipped++;
        results.details.push({
          orderId: commission.orderId,
          salesPerson: commission.salesPersonName,
          status: 'skipped',
          reason: 'Has paid payouts'
        });
        continue;
      }
      
      try {
        const oldAmount = commission.totalCommissionAmount;
        await calculateCommissionForOrder(commission.order);
        
        // Get new amount
        const updated = await prisma.commission.findUnique({
          where: { id: commission.id }
        });
        
        const newAmount = updated?.totalCommissionAmount || 0;
        
        results.recalculated++;
        results.details.push({
          orderId: commission.orderId,
          salesPerson: commission.salesPersonName,
          status: 'recalculated',
          oldAmount,
          newAmount,
          difference: newAmount - oldAmount
        });
        
      } catch (error) {
        results.failed++;
        results.details.push({
          orderId: commission.orderId,
          salesPerson: commission.salesPersonName,
          status: 'failed',
          error: error.message
        });
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
    
    console.log(`[COMMISSION] Recalculation complete: ${results.recalculated} updated, ${results.skipped} skipped, ${results.failed} failed`);
    
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
      if (detail.status === 'recalculated') {
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
  recalculateAllCommissions
};
