import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createMeasurementsRouter() {
  const router = express.Router();

  // Helper function to safely convert strings to floats
  function toFloat(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  // Update individual item measurements - BYPASSES LOCK
  router.patch('/:orderId/items/:itemId/measurements', async (req, res) => {
    try {
      const { orderId, itemId } = req.params;
      const { height, width, length, weight, measurementUnit, weightUnit } = req.body;
      const userId = req.user?.id || 'Unknown';
      const userName = req.user?.name || 'Unknown';
      
      // Verify item exists and belongs to order
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        select: { 
          id: true, 
          orderId: true,
          height: true,
          width: true,
          length: true,
          weight: true,
          measurementUnit: true,
          weightUnit: true
        }
      });
      
      if (!item || item.orderId !== orderId) {
        return res.status(404).json({ error: 'Item not found for this order' });
      }
      
      // Create audit logs for changes
      const changes = [];
      
      if (height !== undefined && height !== item.height) {
        changes.push({
          field: 'height',
          oldValue: item.height ? String(item.height) : 'null',
          newValue: height ? String(height) : 'null'
        });
      }
      
      if (width !== undefined && width !== item.width) {
        changes.push({
          field: 'width',
          oldValue: item.width ? String(item.width) : 'null',
          newValue: width ? String(width) : 'null'
        });
      }
      
      if (length !== undefined && length !== item.length) {
        changes.push({
          field: 'length',
          oldValue: item.length ? String(item.length) : 'null',
          newValue: length ? String(length) : 'null'
        });
      }
      
      if (weight !== undefined && weight !== item.weight) {
        changes.push({
          field: 'weight',
          oldValue: item.weight ? String(item.weight) : 'null',
          newValue: weight ? String(weight) : 'null'
        });
      }
      
      if (measurementUnit !== undefined && measurementUnit !== item.measurementUnit) {
        changes.push({
          field: 'measurementUnit',
          oldValue: item.measurementUnit || 'null',
          newValue: measurementUnit || 'null'
        });
      }
      
      if (weightUnit !== undefined && weightUnit !== item.weightUnit) {
        changes.push({
          field: 'weightUnit',
          oldValue: item.weightUnit || 'null',
          newValue: weightUnit || 'null'
        });
      }
      
      if (changes.length === 0) {
        return res.json(item);
      }
      
      // Update item with new measurements
      const updatedItem = await prisma.$transaction(async (tx) => {
        const updated = await tx.orderItem.update({
          where: { id: itemId },
          data: {
            height: height !== undefined ? toFloat(height) : item.height,
            width: width !== undefined ? toFloat(width) : item.width,
            length: length !== undefined ? toFloat(length) : item.length,
            weight: weight !== undefined ? toFloat(weight) : item.weight,
            measurementUnit: measurementUnit !== undefined ? measurementUnit : item.measurementUnit,
            weightUnit: weightUnit !== undefined ? weightUnit : item.weightUnit,
            measuredAt: new Date(),
            measuredBy: userName
          }
        });
        
        // Create comprehensive audit log for measurements
        await tx.auditLog.create({
          data: {
            entityType: 'Measurement',
            entityId: itemId,
            parentEntityId: orderId,
            action: 'MEASUREMENTS_UPDATED',
            changes: JSON.stringify(changes),
            metadata: JSON.stringify({
              message: 'Measurements updated (bypassed lock)',
              updatedFields: changes.map(c => c.field).join(', ')
            }),
            performedByUserId: userId,
            performedByName: userName
          }
        });
        
        return updated;
      });
      
      res.json(updatedItem);
    } catch (error) {
      console.error('Measurement update error:', error);
      res.status(500).json({ error: 'Failed to update measurements' });
    }
  });

  // Get measurement history for an item
  router.get('/:orderId/items/:itemId/measurement-history', async (req, res) => {
    try {
      const { itemId, orderId } = req.params;
      
      // Verify item exists and belongs to order
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        select: { id: true, orderId: true }
      });
      
      if (!item || item.orderId !== orderId) {
        return res.status(404).json({ error: 'Item not found for this order' });
      }
      
      // Get measurement-related audit logs
      const history = await prisma.auditLog.findMany({
        where: {
          AND: [
            { entityId: itemId },
            { 
              OR: [
                { entityType: 'Measurement' },
                { action: 'MEASUREMENTS_UPDATED' }
              ]
            }
          ]
        },
        include: {
          performedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      
      // Parse and format the history
      const formattedHistory = history.map(log => {
        let changes = [];
        let metadata = {};
        
        try {
          if (log.changes) {
            changes = JSON.parse(log.changes);
          }
          if (log.metadata) {
            metadata = JSON.parse(log.metadata);
          }
        } catch (e) {
          console.error('Error parsing log data:', e);
        }
        
        return {
          id: log.id,
          timestamp: log.createdAt,
          changes: changes,
          message: metadata.message || null,
          updatedFields: metadata.updatedFields || null,
          performedBy: log.performedBy,
          performedByName: log.performedByName
        };
      });
      
      res.json(formattedHistory);
    } catch (error) {
      console.error('Error fetching measurement history:', error);
      res.status(500).json({ error: 'Failed to fetch measurement history' });
    }
  });

  // Bulk update measurements for multiple items - BYPASSES LOCK
  router.patch('/:orderId/measurements/bulk', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { items } = req.body;
      const userName = req.user?.name || 'Unknown';
      const userId = req.user?.id || 'Unknown';
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required' });
      }
      
      const itemIds = items.map(item => item.itemId);
      const existingItems = await prisma.orderItem.findMany({
        where: {
          id: { in: itemIds },
          orderId: orderId
        },
        select: {
          id: true,
          height: true,
          width: true,
          length: true,
          weight: true,
          measurementUnit: true,
          weightUnit: true
        }
      });
      
      if (existingItems.length !== items.length) {
        return res.status(400).json({ error: 'Some items do not belong to this order' });
      }
      
      const existingItemsMap = new Map(existingItems.map(item => [item.id, item]));
      
      const updates = await prisma.$transaction(async (tx) => {
        const updatedItems = [];
        
        for (const updateData of items) {
          const existing = existingItemsMap.get(updateData.itemId);
          if (!existing) continue;
          
          const itemChanges = [];
          const data = {};
          
          if (updateData.height !== undefined && updateData.height !== existing.height) {
            data.height = updateData.height;
            itemChanges.push({ field: 'height', oldValue: existing.height ? String(existing.height) : 'null', newValue: updateData.height ? String(updateData.height) : 'null' });
          }
          if (updateData.width !== undefined && updateData.width !== existing.width) {
            data.width = updateData.width;
            itemChanges.push({ field: 'width', oldValue: existing.width ? String(existing.width) : 'null', newValue: updateData.width ? String(updateData.width) : 'null' });
          }
          if (updateData.length !== undefined && updateData.length !== existing.length) {
            data.length = updateData.length;
            itemChanges.push({ field: 'length', oldValue: existing.length ? String(existing.length) : 'null', newValue: updateData.length ? String(updateData.length) : 'null' });
          }
          if (updateData.weight !== undefined && updateData.weight !== existing.weight) {
            data.weight = updateData.weight;
            itemChanges.push({ field: 'weight', oldValue: existing.weight ? String(existing.weight) : 'null', newValue: updateData.weight ? String(updateData.weight) : 'null' });
          }
          if (updateData.measurementUnit !== undefined && updateData.measurementUnit !== existing.measurementUnit) {
            data.measurementUnit = updateData.measurementUnit;
            itemChanges.push({ field: 'measurementUnit', oldValue: existing.measurementUnit || 'null', newValue: updateData.measurementUnit || 'null' });
          }
          if (updateData.weightUnit !== undefined && updateData.weightUnit !== existing.weightUnit) {
            data.weightUnit = updateData.weightUnit;
            itemChanges.push({ field: 'weightUnit', oldValue: existing.weightUnit || 'null', newValue: updateData.weightUnit || 'null' });
          }
          
          if (Object.keys(data).length > 0) {
            data.measuredAt = new Date();
            data.measuredBy = userName;
            
            const updated = await tx.orderItem.update({ where: { id: updateData.itemId }, data });
            updatedItems.push(updated);
            
            if (itemChanges.length > 0) {
              await tx.auditLog.create({
                data: {
                  entityType: 'Measurement',
                  entityId: updateData.itemId,
                  parentEntityId: orderId,
                  action: 'MEASUREMENTS_BULK_UPDATED',
                  changes: JSON.stringify(itemChanges),
                  metadata: JSON.stringify({ message: 'Bulk measurements update (bypassed lock)', updatedFields: itemChanges.map(c => c.field).join(', ') }),
                  performedByUserId: userId,
                  performedByName: userName
                }
              });
            }
          }
        }
        
        if (updatedItems.length > 0) {
          await tx.auditLog.create({
            data: {
              entityType: 'Order',
              entityId: orderId,
              parentEntityId: orderId,
              action: 'BULK_MEASUREMENTS_UPDATED',
              metadata: JSON.stringify({ message: `Bulk measurements update for ${updatedItems.length} items`, itemsUpdated: updatedItems.map(item => item.id) }),
              performedByUserId: userId,
              performedByName: userName
            }
          });
        }
        
        return updatedItems;
      });
      
      res.json({ updated: updates.length, items: updates });
    } catch (error) {
      console.error('Bulk measurement update error:', error);
      res.status(500).json({ error: 'Failed to update measurements' });
    }
  });

  return router;
}

export default createMeasurementsRouter;
