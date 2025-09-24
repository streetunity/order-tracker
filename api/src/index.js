              qty: item.qty
            }))
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      return createdItems;
    });
    
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update item with comprehensive field change logging - MODIFIED TO ALLOW MEASUREMENTS ON LOCKED ORDERS
app.patch('/orders/:orderId/items/:itemId', authGuard, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const item = await prisma.orderItem.findUnique({ 
      where: { id: itemId }, 
      select: { 
        id: true, 
        orderId: true,
        productCode: true,
        qty: true,
        serialNumber: true,
        modelNumber: true,
        voltage: true,
        notes: true,
        archivedAt: true,
        currentStage: true,
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
    
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isLocked: true }
    });
    
    const data = {};
    const changes = [];
    
    // Archive/restore is allowed even when locked
    if (req.body.archivedAt !== undefined) {
      const newArchived = req.body.archivedAt ? new Date(req.body.archivedAt) : null;
      const oldArchived = item.archivedAt;
      
      const oldArchivedStr = oldArchived ? oldArchived.toISOString() : null;
      const newArchivedStr = newArchived ? newArchived.toISOString() : null;
      
      if (oldArchivedStr !== newArchivedStr) {
        data.archivedAt = newArchived;
        changes.push({
          field: 'archivedAt',
          oldValue: oldArchivedStr || 'null',
          newValue: newArchivedStr || 'null'
        });
      }
    }
    
    // Measurements are allowed even when locked - CONVERT TO FLOATS
    const measurementFields = ['height', 'width', 'length', 'weight', 'measurementUnit', 'weightUnit'];
    const hasMeasurementFields = measurementFields.some(field => req.body.hasOwnProperty(field));
    
    if (hasMeasurementFields) {
      // Process measurement fields
      if (req.body.hasOwnProperty('height') && req.body.height !== item.height) {
        data.height = toFloat(req.body.height);
        changes.push({
          field: 'height',
          oldValue: item.height ? String(item.height) : 'null',
          newValue: req.body.height ? String(req.body.height) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('width') && req.body.width !== item.width) {
        data.width = toFloat(req.body.width);
        changes.push({
          field: 'width',
          oldValue: item.width ? String(item.width) : 'null',
          newValue: req.body.width ? String(req.body.width) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('length') && req.body.length !== item.length) {
        data.length = toFloat(req.body.length);
        changes.push({
          field: 'length',
          oldValue: item.length ? String(item.length) : 'null',
          newValue: req.body.length ? String(req.body.length) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('weight') && req.body.weight !== item.weight) {
        data.weight = toFloat(req.body.weight);
        changes.push({
          field: 'weight',
          oldValue: item.weight ? String(item.weight) : 'null',
          newValue: req.body.weight ? String(req.body.weight) : 'null'
        });
      }
      
      if (req.body.hasOwnProperty('measurementUnit') && req.body.measurementUnit !== item.measurementUnit) {
        data.measurementUnit = req.body.measurementUnit;
        changes.push({
          field: 'measurementUnit',
          oldValue: item.measurementUnit || 'null',
          newValue: req.body.measurementUnit || 'null'
        });
      }
      
      if (req.body.hasOwnProperty('weightUnit') && req.body.weightUnit !== item.weightUnit) {
        data.weightUnit = req.body.weightUnit;
        changes.push({
          field: 'weightUnit',
          oldValue: item.weightUnit || 'null',
          newValue: req.body.weightUnit || 'null'
        });
      }
      
      // Add measurement metadata if measurements were updated
      if (changes.some(c => measurementFields.includes(c.field))) {
        data.measuredAt = new Date();
        data.measuredBy = req.user.name;
      }
    }
    
    // Check if trying to edit non-archive/non-measurement fields on a locked order
    const editFields = ['productCode', 'qty', 'serialNumber', 'modelNumber', 'voltage', 'notes'];
    const hasEditFields = editFields.some(field => req.body.hasOwnProperty(field));
    
    if (hasEditFields && order.isLocked) {
      await logAuditEvent(
        orderId, 
        'EDIT_ATTEMPTED_WHILE_LOCKED', 
        'Tried to edit item details', 
        req.user.id,
        req.user.name
      );
      return res.status(403).json({ 
        error: 'Cannot edit item details in a locked order. Please unlock it first. Use /measurements endpoint for dimension updates.' 
      });
    }
    
    // Process all other fields (only if not locked)
    if (req.body.hasOwnProperty('productCode') && typeof req.body.productCode === 'string') {
      const newCode = req.body.productCode.trim();
      if (newCode !== item.productCode) {
        data.productCode = newCode;
        changes.push({
          field: 'productCode',
          oldValue: item.productCode,
          newValue: newCode
        });
      }
    }
    
    if (req.body.hasOwnProperty('qty')) {
      const q = Number(req.body.qty);
      if (!Number.isFinite(q) || q <= 0) {
        return res.status(400).json({ error: 'qty must be a positive number' });
      }
      if (q !== item.qty) {
        data.qty = q;
        changes.push({
          field: 'qty',
          oldValue: String(item.qty),
          newValue: String(q)
        });
      }
    }
    
    if (req.body.hasOwnProperty('serialNumber')) {
      const newSerial = (req.body.serialNumber === '' || req.body.serialNumber === null) 
        ? null 
        : String(req.body.serialNumber).trim();
      
      if (newSerial !== item.serialNumber) {
        data.serialNumber = newSerial;
        changes.push({
          field: 'serialNumber',
          oldValue: item.serialNumber || 'null',
          newValue: newSerial || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('modelNumber')) {
      const newModel = (req.body.modelNumber === '' || req.body.modelNumber === null)
        ? null
        : String(req.body.modelNumber).trim();
      
      if (newModel !== item.modelNumber) {
        data.modelNumber = newModel;
        changes.push({
          field: 'modelNumber',
          oldValue: item.modelNumber || 'null',
          newValue: newModel || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('voltage')) {
      const newVoltage = (req.body.voltage === '' || req.body.voltage === null)
        ? null
        : String(req.body.voltage).trim();
      
      if (newVoltage !== item.voltage) {
        data.voltage = newVoltage;
        changes.push({
          field: 'voltage',
          oldValue: item.voltage || 'null',
          newValue: newVoltage || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('notes')) {
      const newNotes = (req.body.notes === '' || req.body.notes === null)
        ? null
        : String(req.body.notes).trim();
      
      if (newNotes !== item.notes) {
        data.notes = newNotes;
        changes.push({
          field: 'notes',
          oldValue: item.notes || 'null',
          newValue: newNotes || 'null'
        });
      }
    }
    
    if (req.body.hasOwnProperty('currentStage')) {
      const newStage = req.body.currentStage;
      if (newStage !== item.currentStage) {
        data.currentStage = newStage;
        changes.push({
          field: 'currentStage',
          oldValue: item.currentStage || 'null',
          newValue: newStage || 'null'
        });
      }
    }
    
    if (Object.keys(data).length === 0) {
      console.log('No changes detected for item:', itemId);
      return res.json(item);
    }

    console.log('Updating item with data:', data);
    console.log('Changes to log:', changes);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({ 
        where: { id: itemId }, 
        data 
      });
      
      console.log('Item updated successfully:', updatedItem);
      
      // Log field changes using appropriate audit type
      if (changes.length > 0) {
        const isMeasurementUpdate = changes.every(c => measurementFields.includes(c.field));
        
        await tx.auditLog.create({
          data: {
            entityType: isMeasurementUpdate ? 'Measurement' : 'OrderItem',
            entityId: itemId,
            parentEntityId: orderId,
            action: isMeasurementUpdate ? 'MEASUREMENTS_UPDATED' : 'ORDERITEM_UPDATED',
            changes: JSON.stringify(changes),
            metadata: isMeasurementUpdate ? JSON.stringify({
              message: 'Measurements updated via item endpoint',
              updatedFields: changes.map(c => c.field).join(', ')
            }) : null,
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
        console.log('Audit log created for changes');
      }
      
      return updatedItem;
    });
    
    console.log('Transaction completed, returning updated item');
    res.json(updated);
  } catch (e) {
    console.error('Error updating item:', e);
    res.status(500).json({ error: e.message });
  }
});

// Delete item with logging
app.delete('/orders/:orderId/items/:itemId', authGuard, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const item = await prisma.orderItem.findUnique({ 
      where: { id: itemId }, 
      select: { id: true, orderId: true, productCode: true } 
    });
    if (!item || item.orderId !== orderId) {
      return res.status(404).json({ error: 'Item not found for this order' });
    }
    
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isLocked: true }
    });
    
    if (order.isLocked) {
      await logAuditEvent(
        orderId, 
        'DELETE_ATTEMPTED_WHILE_LOCKED', 
        'Tried to delete item', 
        req.user.id,
        req.user.name
      );
      return res.status(403).json({ 
        error: 'Cannot delete items from a locked order. Please unlock it first.' 
      });
    }

    await prisma.$transaction(async (tx) => {
      // Log deletion using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'OrderItem',
          entityId: itemId,
          parentEntityId: orderId,
          action: 'ITEM_DELETED',
          metadata: JSON.stringify({
            entity: 'OrderItem',
            entityId: itemId,
            productCode: item.productCode
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      await tx.orderItem.delete({ where: { id: itemId } });
    });
    
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Comprehensive Audit Log Retrieval
// -----------------------------
app.get('/comprehensive-audit/:entityId', authGuard, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: req.params.entityId },
          { parentEntityId: req.params.entityId }
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
      orderBy: { createdAt: 'desc' }
    });
    
    // Parse and format the logs
    const formattedLogs = logs.map(log => {
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
        action: log.action,
        entity: log.entityType,
        entityId: log.entityId,
        changes: changes,
        data: metadata.data || null,
        message: metadata.message || null,
        performedBy: log.performedBy,
        performedByName: log.performedByName,
        createdAt: log.createdAt
      };
    });
    
    res.json(formattedLogs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// Startup
// -----------------------------
app.listen(PORT, HOST, () => {
  console.log(`API server running at http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\nDefault credentials (change in production!):`);
  console.log(`Admin: admin@stealthmachinetools.com / admin123`);
  console.log(`Agent: john@stealthmachinetools.com / agent123`);
});
