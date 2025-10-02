# API Changes for Internal Notes

## Changes to make in api/src/index.js:

### 1. In the GET /orders/:id endpoint (around line 500), add internalNotes to the select:
```javascript
const order = await prisma.order.findUnique({
  where: { id: req.params.id },
  include: {
    account: true,
    items: { include: { statusEvents: { orderBy: { createdAt: 'asc' } } } },
    statusEvents: { orderBy: { createdAt: 'asc' } },
    createdBy: {
      select: { id: true, name: true, email: true }
    }
  },
  // Add this to include internalNotes
  select: {
    id: true,
    accountId: true,
    poNumber: true,
    sku: true,
    internalNotes: true,  // ADD THIS LINE
    createdAt: true,
    updatedAt: true,
    etaDate: true,
    currentStage: true,
    trackingToken: true,
    trackingNumber: true,
    shippingCarrier: true,
    isLocked: true,
    lockedAt: true,
    lockedBy: true,
    createdByUserId: true,
    account: true,
    items: { include: { statusEvents: { orderBy: { createdAt: 'asc' } } } },
    statusEvents: { orderBy: { createdAt: 'asc' } },
    createdBy: {
      select: { id: true, name: true, email: true }
    }
  }
});
```

### 2. In the PATCH /orders/:id endpoint (around line 550), add internalNotes support:
```javascript
// Add internalNotes to destructuring
const { poNumber, sku, etaDate, trackingNumber, shippingCarrier, accountId, internalNotes } = req.body || {};

// Add check for internalNotes
if (internalNotes !== undefined && internalNotes !== original.internalNotes) {
  data.internalNotes = internalNotes;
  changes.push({
    field: 'internalNotes',
    oldValue: original.internalNotes || 'null',
    newValue: internalNotes || 'null'
  });
}
```

### 3. Add new endpoint for updating internal notes separately:
```javascript
// Update internal notes (separate endpoint for convenience)
app.patch('/orders/:id/internal-notes', authGuard, async (req, res) => {
  try {
    const { internalNotes } = req.body;
    
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, internalNotes: true }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: req.params.id },
        data: { internalNotes }
      });
      
      // Log the change
      await tx.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: req.params.id,
          parentEntityId: req.params.id,
          action: 'INTERNAL_NOTES_UPDATED',
          changes: JSON.stringify([{
            field: 'internalNotes',
            oldValue: order.internalNotes || 'null',
            newValue: internalNotes || 'null'
          }]),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      return updatedOrder;
    });
    
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

### 4. Make sure the public endpoint does NOT include internalNotes (around line 295):
The public endpoint should already exclude internalNotes by not selecting it.