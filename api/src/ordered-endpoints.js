// ordered-endpoints.js
// Handles marking items as ordered/unordered with admin-only access

const express = require('express');
const router = express.Router();

// Mark item as ordered (Admin only)
async function markItemAsOrdered(req, res, prisma, authenticatedUser) {
  const { id, itemId } = req.params;
  
  try {
    // Check if user is admin
    if (authenticatedUser.role !== 'ADMIN') {
      return res.status(403).json({ 
        error: "Only administrators can mark items as ordered" 
      });
    }
    
    // Verify the item exists and belongs to the order
    const item = await prisma.orderItem.findFirst({
      where: {
        id: itemId,
        orderId: id
      }
    });
    
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    if (item.isOrdered) {
      return res.status(400).json({ error: "Item is already marked as ordered" });
    }
    
    // Update the item
    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        isOrdered: true,
        orderedAt: new Date(),
        orderedBy: authenticatedUser.name
      }
    });
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'OrderItem',
        entityId: itemId,
        parentEntityId: id,
        action: 'ITEM_ORDERED',
        metadata: JSON.stringify({
          message: `Item marked as ordered`,
          itemName: item.productCode,
          orderedBy: authenticatedUser.name
        }),
        performedByUserId: authenticatedUser.id,
        performedByName: authenticatedUser.name
      }
    });
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error marking item as ordered:', error);
    res.status(500).json({ error: "Failed to mark item as ordered" });
  }
}

// Unmark item as ordered (Admin only, requires reason)
async function unmarkItemAsOrdered(req, res, prisma, authenticatedUser) {
  const { id, itemId } = req.params;
  const { reason } = req.body;
  
  try {
    // Check if user is admin
    if (authenticatedUser.role !== 'ADMIN') {
      return res.status(403).json({ 
        error: "Only administrators can unmark ordered items" 
      });
    }
    
    // Validate reason
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ 
        error: "A reason with at least 10 characters is required to unmark an ordered item" 
      });
    }
    
    // Verify the item exists and belongs to the order
    const item = await prisma.orderItem.findFirst({
      where: {
        id: itemId,
        orderId: id
      }
    });
    
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    if (!item.isOrdered) {
      return res.status(400).json({ error: "Item is not marked as ordered" });
    }
    
    // Update the item
    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        isOrdered: false,
        orderedAt: null,
        orderedBy: null
      }
    });
    
    // Create audit log with reason
    await prisma.auditLog.create({
      data: {
        entityType: 'OrderItem',
        entityId: itemId,
        parentEntityId: id,
        action: 'ITEM_UNORDERED',
        metadata: JSON.stringify({
          message: reason.trim(),
          itemName: item.productCode,
          unorderedBy: authenticatedUser.name
        }),
        performedByUserId: authenticatedUser.id,
        performedByName: authenticatedUser.name
      }
    });
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error unmarking item as ordered:', error);
    res.status(500).json({ error: "Failed to unmark item as ordered" });
  }
}

module.exports = {
  markItemAsOrdered,
  unmarkItemAsOrdered
};