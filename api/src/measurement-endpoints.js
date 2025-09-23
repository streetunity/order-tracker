// Add these endpoints to your api/src/index.js file
// Place them after your existing order/item endpoints but before app.listen()

// ========================================
// MEASUREMENT ENDPOINTS (Always Editable)
// ========================================

// Update measurements for an item - BYPASSES LOCK CHECK
app.patch('/orders/:orderId/items/:itemId/measurements', authGuard, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { height, width, length, weight, measurementUnit, weightUnit } = req.body;
    const userId = req.user?.id || 'Unknown';
    const userName = req.user?.name || req.user?.email || 'Unknown';
    
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
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Prepare audit logs for changes
    const auditLogs = [];
    
    // Check each measurement for changes
    if (height !== undefined && height !== item.height) {
      auditLogs.push({
        orderItemId: itemId,
        orderId: orderId,
        field: 'height',
        oldValue: item.height,
        newValue: height === '' ? null : parseFloat(height),
        unit: measurementUnit || item.measurementUnit,
        performedBy: userName
      });
    }
    
    if (width !== undefined && width !== item.width) {
      auditLogs.push({
        orderItemId: itemId,
        orderId: orderId,
        field: 'width',
        oldValue: item.width,
        newValue: width === '' ? null : parseFloat(width),
        unit: measurementUnit || item.measurementUnit,
        performedBy: userName
      });
    }
    
    if (length !== undefined && length !== item.length) {
      auditLogs.push({
        orderItemId: itemId,
        orderId: orderId,
        field: 'length',
        oldValue: item.length,
        newValue: length === '' ? null : parseFloat(length),
        unit: measurementUnit || item.measurementUnit,
        performedBy: userName
      });
    }
    
    if (weight !== undefined && weight !== item.weight) {
      auditLogs.push({
        orderItemId: itemId,
        orderId: orderId,
        field: 'weight',
        oldValue: item.weight,
        newValue: weight === '' ? null : parseFloat(weight),
        unit: weightUnit || item.weightUnit,
        performedBy: userName
      });
    }
    
    // Build update data object
    const updateData = {};
    
    if (height !== undefined) updateData.height = height === '' ? null : parseFloat(height);
    if (width !== undefined) updateData.width = width === '' ? null : parseFloat(width);
    if (length !== undefined) updateData.length = length === '' ? null : parseFloat(length);
    if (weight !== undefined) updateData.weight = weight === '' ? null : parseFloat(weight);
    if (measurementUnit !== undefined) updateData.measurementUnit = measurementUnit;
    if (weightUnit !== undefined) updateData.weightUnit = weightUnit;
    
    // Only update measuredAt/By if we're actually changing measurements
    if (Object.keys(updateData).length > 0) {
      updateData.measuredAt = new Date();
      updateData.measuredBy = userName;
    }
    
    // Update item with new measurements
    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData
    });
    
    // Create audit logs for measurement changes
    if (auditLogs.length > 0) {
      await prisma.measurementAuditLog.createMany({
        data: auditLogs
      });
      
      // Also log to main audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'OrderItem',
          entityId: itemId,
          parentEntityId: orderId,
          action: 'MEASUREMENTS_UPDATED',
          changes: JSON.stringify(auditLogs.map(log => ({
            field: log.field,
            oldValue: log.oldValue,
            newValue: log.newValue,
            unit: log.unit
          }))),
          performedByUserId: userId !== 'Unknown' ? userId : null,
          performedByName: userName,
        }
      });
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Measurement update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get measurement history for an item
app.get('/orders/:orderId/items/:itemId/measurement-history', authGuard, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    
    // Verify item belongs to order
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: { orderId: true }
    });
    
    if (!item || item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const history = await prisma.measurementAuditLog.findMany({
      where: {
        orderItemId: itemId,
        orderId: orderId
      },
      orderBy: { performedAt: 'desc' },
      take: 50
    });
    
    res.json(history);
  } catch (error) {
    console.error('Measurement history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk update measurements for multiple items
app.patch('/orders/:orderId/measurements/bulk', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { items, measurementUnit, weightUnit } = req.body;
    const userName = req.user?.name || req.user?.email || 'Unknown';
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }
    
    // Verify all items belong to this order
    const itemIds = items.map(i => i.id);
    const existingItems = await prisma.orderItem.findMany({
      where: {
        id: { in: itemIds },
        orderId: orderId
      }
    });
    
    if (existingItems.length !== items.length) {
      return res.status(400).json({ error: 'Some items not found or don\'t belong to this order' });
    }
    
    const updates = [];
    const auditLogs = [];
    
    for (const itemData of items) {
      const existing = existingItems.find(e => e.id === itemData.id);
      const updateData = {};
      
      if (itemData.height !== undefined && itemData.height !== existing.height) {
        updateData.height = itemData.height === '' ? null : parseFloat(itemData.height);
        auditLogs.push({
          orderItemId: existing.id,
          orderId: orderId,
          field: 'height',
          oldValue: existing.height,
          newValue: updateData.height,
          unit: measurementUnit || existing.measurementUnit,
          performedBy: userName
        });
      }
      
      if (itemData.width !== undefined && itemData.width !== existing.width) {
        updateData.width = itemData.width === '' ? null : parseFloat(itemData.width);
        auditLogs.push({
          orderItemId: existing.id,
          orderId: orderId,
          field: 'width',
          oldValue: existing.width,
          newValue: updateData.width,
          unit: measurementUnit || existing.measurementUnit,
          performedBy: userName
        });
      }
      
      if (itemData.length !== undefined && itemData.length !== existing.length) {
        updateData.length = itemData.length === '' ? null : parseFloat(itemData.length);
        auditLogs.push({
          orderItemId: existing.id,
          orderId: orderId,
          field: 'length',
          oldValue: existing.length,
          newValue: updateData.length,
          unit: measurementUnit || existing.measurementUnit,
          performedBy: userName
        });
      }
      
      if (itemData.weight !== undefined && itemData.weight !== existing.weight) {
        updateData.weight = itemData.weight === '' ? null : parseFloat(itemData.weight);
        auditLogs.push({
          orderItemId: existing.id,
          orderId: orderId,
          field: 'weight',
          oldValue: existing.weight,
          newValue: updateData.weight,
          unit: weightUnit || existing.weightUnit,
          performedBy: userName
        });
      }
      
      if (Object.keys(updateData).length > 0) {
        updateData.measuredAt = new Date();
        updateData.measuredBy = userName;
        if (measurementUnit) updateData.measurementUnit = measurementUnit;
        if (weightUnit) updateData.weightUnit = weightUnit;
        
        updates.push(
          prisma.orderItem.update({
            where: { id: existing.id },
            data: updateData
          })
        );
      }
    }
    
    // Execute all updates
    const results = await prisma.$transaction(updates);
    
    // Create audit logs
    if (auditLogs.length > 0) {
      await prisma.measurementAuditLog.createMany({
        data: auditLogs
      });
    }
    
    res.json({ updated: results.length, items: results });
  } catch (error) {
    console.error('Bulk measurement update error:', error);
    res.status(500).json({ error: error.message });
  }
});