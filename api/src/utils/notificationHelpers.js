// api/src/utils/notificationHelpers.js
import { PrismaClient } from '@prisma/client';

/**
 * Helper functions for creating and managing notifications
 */

/**
 * Create a commission earned notification
 */
export async function createCommissionNotification(prisma, {
  userId,
  orderId,
  orderPoNumber,
  commissionAmount,
  orderDate,
  customerName
}) {
  return await prisma.notification.create({
    data: {
      userId,
      type: 'COMMISSION_EARNED',
      category: 'COMMISSION',
      title: `Commission Earned: $${commissionAmount.toFixed(2)}`,
      message: `You earned a commission of $${commissionAmount.toFixed(2)} from order ${orderPoNumber || orderId}`,
      relatedOrderId: orderId,
      metadata: JSON.stringify({
        commissionAmount,
        orderPoNumber,
        orderDate,
        customerName
      }),
      priority: commissionAmount >= 1000 ? 'HIGH' : 'NORMAL'
    }
  });
}

/**
 * Create a commission payment notification
 */
export async function createCommissionPaymentNotification(prisma, {
  userId,
  paymentAmount,
  period,
  orderCount,
  paymentDate
}) {
  return await prisma.notification.create({
    data: {
      userId,
      type: 'COMMISSION_PAYMENT',
      category: 'COMMISSION',
      title: `Commission Payment: $${paymentAmount.toFixed(2)}`,
      message: `Your commission payment of $${paymentAmount.toFixed(2)} for ${period} (${orderCount} orders) has been processed`,
      metadata: JSON.stringify({
        paymentAmount,
        period,
        orderCount,
        paymentDate
      }),
      priority: 'HIGH'
    }
  });
}

/**
 * Create an order late notification
 */
export async function createOrderLateNotification(prisma, {
  userId,
  orderId,
  itemId,
  orderPoNumber,
  productCode,
  stage,
  daysLate,
  customerName,
  priority = 'HIGH'
}) {
  // Check if notification already exists in last 24 hours
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'ORDER_LATE',
      relatedItemId: itemId,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });

  if (existing) {
    return existing; // Don't create duplicate
  }

  return await prisma.notification.create({
    data: {
      userId,
      type: 'ORDER_LATE',
      category: 'OPERATIONAL',
      title: `Order Running Late: ${productCode}`,
      message: `Item ${productCode} in order ${orderPoNumber || orderId} is ${daysLate} days overdue in ${stage} stage`,
      relatedOrderId: orderId,
      relatedItemId: itemId,
      metadata: JSON.stringify({
        orderPoNumber,
        productCode,
        stage,
        daysLate,
        customerName
      }),
      priority
    }
  });
}

/**
 * Create a stage warning notification
 */
export async function createStageWarningNotification(prisma, {
  userId,
  orderId,
  itemId,
  orderPoNumber,
  productCode,
  stage,
  daysInStage,
  warningThreshold,
  customerName
}) {
  // Check if notification already exists in last 24 hours
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'STAGE_WARNING',
      relatedItemId: itemId,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });

  if (existing) {
    return existing; // Don't create duplicate
  }

  return await prisma.notification.create({
    data: {
      userId,
      type: 'STAGE_WARNING',
      category: 'OPERATIONAL',
      title: `Stage Warning: ${productCode}`,
      message: `Item ${productCode} has been in ${stage} stage for ${daysInStage} days (threshold: ${warningThreshold})`,
      relatedOrderId: orderId,
      relatedItemId: itemId,
      metadata: JSON.stringify({
        orderPoNumber,
        productCode,
        stage,
        daysInStage,
        warningThreshold,
        customerName
      }),
      priority: 'NORMAL'
    }
  });
}

/**
 * Create a stage critical notification
 */
export async function createStageCriticalNotification(prisma, {
  userId,
  orderId,
  itemId,
  orderPoNumber,
  productCode,
  stage,
  daysInStage,
  criticalThreshold,
  customerName
}) {
  // Check if notification already exists in last 24 hours
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'STAGE_CRITICAL',
      relatedItemId: itemId,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });

  if (existing) {
    return existing; // Don't create duplicate
  }

  return await prisma.notification.create({
    data: {
      userId,
      type: 'STAGE_CRITICAL',
      category: 'OPERATIONAL',
      title: `CRITICAL: ${productCode}`,
      message: `Item ${productCode} has been in ${stage} stage for ${daysInStage} days - CRITICAL (threshold: ${criticalThreshold})`,
      relatedOrderId: orderId,
      relatedItemId: itemId,
      metadata: JSON.stringify({
        orderPoNumber,
        productCode,
        stage,
        daysInStage,
        criticalThreshold,
        customerName
      }),
      priority: 'CRITICAL'
    }
  });
}

/**
 * Create an order delivered notification
 */
export async function createOrderDeliveredNotification(prisma, {
  userId,
  orderId,
  orderPoNumber,
  customerName,
  itemCount
}) {
  return await prisma.notification.create({
    data: {
      userId,
      type: 'ORDER_DELIVERED',
      category: 'INFO',
      title: `Order Delivered: ${orderPoNumber || orderId}`,
      message: `Order ${orderPoNumber || orderId} (${itemCount} items) has been delivered to ${customerName}`,
      relatedOrderId: orderId,
      metadata: JSON.stringify({
        orderPoNumber,
        customerName,
        itemCount
      }),
      priority: 'NORMAL'
    }
  });
}

/**
 * Bulk generate operational notifications based on current order/item states
 * This scans all active orders and creates notifications for late items
 */
export async function generateOperationalNotifications(prisma, userId = null) {
  const notifications = [];
  
  // Get stage thresholds
  const thresholds = await prisma.stageThreshold.findMany();
  const thresholdMap = thresholds.reduce((acc, t) => {
    acc[t.stage] = t;
    return acc;
  }, {});

  // Build order filter
  const orderWhere = {};
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.role === 'AGENT') {
      orderWhere.sku = user.name; // Filter by sales person
    }
  }

  // Get orders with items
  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      items: {
        where: { archivedAt: null },
        include: {
          statusEvents: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      },
      account: {
        select: { name: true }
      }
    }
  });

  const now = new Date();

  // Process each order's items
  for (const order of orders) {
    // Determine which user to notify
    let notifyUserId = userId;
    if (!notifyUserId && order.sku) {
      // Find user by sales rep name
      const salesRep = await prisma.user.findFirst({
        where: { name: order.sku, isActive: true }
      });
      if (salesRep) {
        notifyUserId = salesRep.id;
      }
    }

    if (!notifyUserId) continue; // Skip if no user to notify

    for (const item of order.items) {
      const lastEvent = item.statusEvents[0];
      const stageEnteredAt = lastEvent ? new Date(lastEvent.createdAt) : new Date(item.createdAt);
      const daysInStage = Math.floor((now - stageEnteredAt) / (1000 * 60 * 60 * 24));

      const threshold = thresholdMap[item.currentStage];
      if (!threshold) continue;

      // Check if critical
      if (daysInStage >= threshold.criticalDays) {
        const notification = await createStageCriticalNotification(prisma, {
          userId: notifyUserId,
          orderId: order.id,
          itemId: item.id,
          orderPoNumber: order.poNumber,
          productCode: item.productCode,
          stage: item.currentStage,
          daysInStage,
          criticalThreshold: threshold.criticalDays,
          customerName: order.account?.name
        });
        if (notification) notifications.push(notification);
      }
      // Check if warning
      else if (daysInStage >= threshold.warningDays) {
        const notification = await createStageWarningNotification(prisma, {
          userId: notifyUserId,
          orderId: order.id,
          itemId: item.id,
          orderPoNumber: order.poNumber,
          productCode: item.productCode,
          stage: item.currentStage,
          daysInStage,
          warningThreshold: threshold.warningDays,
          customerName: order.account?.name
        });
        if (notification) notifications.push(notification);
      }
    }
  }

  return notifications;
}

/**
 * Get user ID by sales rep name
 */
export async function getUserIdBySalesRepName(prisma, salesRepName) {
  const user = await prisma.user.findFirst({
    where: {
      name: salesRepName,
      isActive: true
    },
    select: { id: true }
  });
  return user?.id || null;
}

export default {
  createCommissionNotification,
  createCommissionPaymentNotification,
  createOrderLateNotification,
  createStageWarningNotification,
  createStageCriticalNotification,
  createOrderDeliveredNotification,
  generateOperationalNotifications,
  getUserIdBySalesRepName
};
