// api/src/ordered-endpoints.js
// Handles marking/unmarking items as ordered

import { checkOrderedStatusTrigger } from './helpers/commission.js';

/**
 * Mark an item as ordered
 * Sets isOrdered=true, orderedAt=now, orderedBy=user.name
 */
export async function markItemAsOrdered(req, res, prisma, user) {
  try {
    const { orderId, itemId } = req.params;
    
    // Verify item exists and belongs to order
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        orderId: true,
        isOrdered: true,
        orderedAt: true,
        orderedBy: true,
        productCode: true
      }
    });
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }
    
    // Already ordered?
    if (item.isOrdered) {
      return res.json({ 
        message: 'Item is already marked as ordered',
        item: item
      });
    }
    
    // Update item
    const orderedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: itemId },
        data: {
          isOrdered: true,
          orderedAt: orderedAt,
          orderedBy: user.name
        }
      });
      
      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'OrderItem',
          entityId: itemId,
          parentEntityId: orderId,
          action: 'ITEM_MARKED_ORDERED',
          changes: JSON.stringify([
            { field: 'isOrdered', from: false, to: true },
            { field: 'orderedAt', from: null, to: orderedAt },
            { field: 'orderedBy', from: null, to: user.name }
          ]),
          metadata: JSON.stringify({
            message: `Item marked as ordered`,
            productCode: item.productCode
          }),
          performedByUserId: user.id,
          performedByName: user.name
        }
      });
      
      return updatedItem;
    });
    
    // Trigger commission check for newly ordered item
    try {
      console.log(`[COMMISSION] Item ${itemId} marked as ordered - triggering commission checks`);
      await checkOrderedStatusTrigger(orderId, itemId);
    } catch (error) {
      console.error(`[COMMISSION] Error triggering commission for newly ordered item ${itemId}:`, error);
      // Don't fail the request if commission triggering fails
    }
    
    res.json({ 
      message: 'Item marked as ordered',
      item: updated
    });
  } catch (error) {
    console.error('Error marking item as ordered:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Unmark an item as ordered
 * Sets isOrdered=false, orderedAt=null, orderedBy=null
 */
export async function unmarkItemAsOrdered(req, res, prisma, user) {
  try {
    const { orderId, itemId } = req.params;
    
    // Verify item exists and belongs to order
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        orderId: true,
        isOrdered: true,
        orderedAt: true,
        orderedBy: true,
        productCode: true
      }
    });
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }
    
    // Not ordered?
    if (!item.isOrdered) {
      return res.json({ 
        message: 'Item is not marked as ordered',
        item: item
      });
    }
    
    // Update item
    const updated = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: itemId },
        data: {
          isOrdered: false,
          orderedAt: null,
          orderedBy: null
        }
      });
      
      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'OrderItem',
          entityId: itemId,
          parentEntityId: orderId,
          action: 'ITEM_UNMARKED_ORDERED',
          changes: JSON.stringify([
            { field: 'isOrdered', from: true, to: false },
            { field: 'orderedAt', from: item.orderedAt, to: null },
            { field: 'orderedBy', from: item.orderedBy, to: null }
          ]),
          metadata: JSON.stringify({
            message: `Item unmarked as ordered`,
            productCode: item.productCode,
            previouslyOrderedBy: item.orderedBy,
            previouslyOrderedAt: item.orderedAt
          }),
          performedByUserId: user.id,
          performedByName: user.name
        }
      });
      
      return updatedItem;
    });
    
    res.json({ 
      message: 'Item unmarked as ordered',
      item: updated
    });
  } catch (error) {
    console.error('Error unmarking item as ordered:', error);
    res.status(500).json({ error: error.message });
  }
}
