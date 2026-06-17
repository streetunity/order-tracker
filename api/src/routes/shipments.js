import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authGuard } from '../middleware/auth.js';
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from '../services/fileUploadService.js';
import {
  DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENT_TYPES, BROKER_DOCUMENT_TYPES,
  getDocumentsForShipment, resolveDocumentById, deleteResolvedDocument, buildChecklist
} from '../services/documentService.js';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware for internal staff (admin + agent) - can manage shipments
const requireInternalStaff = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'AGENT'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Middleware for admin-only routes (delete shipment, archive)
const requireAdmin = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Middleware for broker, admin, or agent (can view/edit shipments + upload broker docs)
const requireBrokerOrStaff = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'AGENT', 'BROKER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Middleware for read-only views and (now) shipment-doc upload/delete:
// admin, agent, broker, OR manufacturer.
// Manufacturers must have a linked manufacturer profile so we can scope by manufacturerId.
// Each handler is responsible for applying the manufacturerScope* helpers below.
const requireShipmentViewer = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'AGENT', 'BROKER', 'MANUFACTURER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (req.user.role === 'MANUFACTURER' && !req.user.manufacturer?.id) {
    return res.status(403).json({ error: 'No manufacturer profile linked to your account' });
  }
  next();
};

// Middleware for create + link/unlink: internal staff OR manufacturer (with profile).
// Used by POST /, GET /search-items, POST /:id/link-item, POST /:id/unlink-item.
// Each handler is still responsible for verifying that manufacturers only act on
// their own items and shipments they have access to.
const requireInternalStaffOrManufacturer = (req, res, next) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'AGENT', 'MANUFACTURER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (req.user.role === 'MANUFACTURER' && !req.user.manufacturer?.id) {
    return res.status(403).json({ error: 'No manufacturer profile linked to your account' });
  }
  next();
};

// =============================
// MANUFACTURER SCOPING HELPERS
// =============================

// Returns a Prisma where-clause fragment that limits a Shipment query to:
//   - shipments containing at least one non-archived item assigned to them, OR
//   - shipments they created (so brand-new empty shipments are visible).
// Returns {} for non-manufacturer users.
function manufacturerScopeForShipments(req) {
  if (req.user.role !== 'MANUFACTURER') return {};
  return {
    OR: [
      { items: { some: { manufacturerId: req.user.manufacturer.id, archivedAt: null } } },
      { createdByUserId: req.user.id },
    ],
  };
}

// Returns the items.where filter to apply when including items in a Shipment
// response. Manufacturers see ONLY their own items; everyone else sees all
// non-archived items.
function manufacturerItemFilter(req) {
  if (req.user.role !== 'MANUFACTURER') return { archivedAt: null };
  return {
    archivedAt: null,
    manufacturerId: req.user.manufacturer.id,
  };
}

// =============================
// HELPER: Sync status from shipment to all linked items
// =============================
async function syncShipmentStatusToItems(shipmentId, newStatus, additionalData = {}) {
  const itemUpdateData = {
    customsDocumentStatus: newStatus
  };

  if (additionalData.customsFiledDate) {
    itemUpdateData.customsFiledDate = additionalData.customsFiledDate;
  }
  if (additionalData.customsClearedDate) {
    itemUpdateData.customsClearedDate = additionalData.customsClearedDate;
  }

  const result = await prisma.orderItem.updateMany({
    where: {
      shipmentId: shipmentId,
      archivedAt: null
    },
    data: itemUpdateData
  });

  console.log(`[SHIPMENT SYNC] Synced status "${newStatus}" to ${result.count} items in shipment ${shipmentId}`);
  return result.count;
}

// =============================
// SHIPMENT CRUD OPERATIONS
// =============================

/**
 * GET /api/shipments
 */
router.get('/', authGuard, requireShipmentViewer, async (req, res) => {
  try {
    const { status, search, includeArchived, archivedOnly } = req.query;

    // Build conditions as an AND-array so we can compose multiple OR clauses
    // (search OR + manufacturer scope OR) without one clobbering the other.
    const conditions = [];

    if (archivedOnly === 'true') {
      conditions.push({ archivedAt: { not: null } });
    } else if (includeArchived !== 'true') {
      conditions.push({ archivedAt: null });
    }

    if (status) {
      conditions.push({ customsDocumentStatus: status });
    }
    if (search) {
      // Search across shipment fields, customer/contact info on the linked
      // account, the order's PO number, and item-level identifiers. Customer
      // name and contact person are nested two levels deep:
      //   shipment -> items[] -> order -> account.{name,contactName}
      // Prisma needs `items: { some: { order: { account: {...} } } }` for that.
      conditions.push({
        OR: [
          // Shipment-level fields
          { containerNumber: { contains: search, mode: 'insensitive' } },
          { billOfLading:    { contains: search, mode: 'insensitive' } },
          { vesselName:      { contains: search, mode: 'insensitive' } },
          // Item-level fields (any one item in the shipment matches)
          { items: { some: { productCode:  { contains: search, mode: 'insensitive' } } } },
          { items: { some: { serialNumber: { contains: search, mode: 'insensitive' } } } },
          // Order-level (PO number) and account-level (customer + contact)
          { items: { some: { order: { poNumber: { contains: search, mode: 'insensitive' } } } } },
          { items: { some: { order: { account: { name:        { contains: search, mode: 'insensitive' } } } } } },
          { items: { some: { order: { account: { contactName: { contains: search, mode: 'insensitive' } } } } } },
        ],
      });
    }

    const mfgScope = manufacturerScopeForShipments(req);
    if (Object.keys(mfgScope).length > 0) {
      conditions.push(mfgScope);
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        items: {
          where: manufacturerItemFilter(req),
          select: {
            id: true,
            productCode: true,
            currentStage: true,
            order: {
              select: {
                id: true,
                poNumber: true,
                account: {
                  select: { name: true }
                }
              }
            },
            _count: {
              select: { documents: true }
            }
          }
        },
        documents: {
          select: {
            id: true,
            documentType: true
          }
        },
        _count: {
          select: { items: true, documents: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const isManufacturer = req.user.role === 'MANUFACTURER';

    const shipmentsWithDocCounts = shipments.map(shipment => {
      const itemDocCount = shipment.items.reduce((total, item) => {
        return total + (item._count?.documents || 0);
      }, 0);

      // For manufacturers, override the unfiltered _count.items so the UI
      // doesn't reveal the total item count of other manufacturers' items.
      const _count = isManufacturer
        ? { items: shipment.items.length, documents: shipment._count?.documents || 0 }
        : shipment._count;

      return {
        ...shipment,
        _count,
        itemDocCount,
        totalDocCount: (shipment._count?.documents || 0) + itemDocCount
      };
    });

    res.json(shipmentsWithDocCounts);
  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

/**
 * GET /api/shipments/active
 */
router.get('/active', authGuard, requireInternalStaff, async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        containerNumber: true,
        billOfLading: true,
        vesselName: true,
        etaDate: true,
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(shipments);
  } catch (error) {
    console.error('Error fetching active shipments:', error);
    res.status(500).json({ error: 'Failed to fetch active shipments' });
  }
});

/**
 * GET /api/shipments/stats
 */
router.get('/stats', authGuard, requireShipmentViewer, async (req, res) => {
  try {
    const mfgScope = manufacturerScopeForShipments(req);
    const isManufacturer = req.user.role === 'MANUFACTURER';

    // Build base where as an AND-array so we can mix the manufacturer OR-scope
    // with the archive filter without clobbering.
    const buildWhere = (extra = {}) => {
      const conds = [];
      if (Object.keys(extra).length > 0) conds.push(extra);
      if (Object.keys(mfgScope).length > 0) conds.push(mfgScope);
      return conds.length > 0 ? { AND: conds } : {};
    };

    const [total, active, archived, byStatus] = await Promise.all([
      prisma.shipment.count({ where: buildWhere() }),
      prisma.shipment.count({ where: buildWhere({ archivedAt: null }) }),
      prisma.shipment.count({ where: buildWhere({ archivedAt: { not: null } }) }),
      prisma.shipment.groupBy({
        by: ['customsDocumentStatus'],
        where: buildWhere({ archivedAt: null }),
        _count: true
      })
    ]);

    const itemStatsWhere = {
      shipmentId: { not: null },
      archivedAt: null
    };
    if (isManufacturer) {
      itemStatsWhere.manufacturerId = req.user.manufacturer.id;
    }
    const itemStats = await prisma.orderItem.aggregate({
      where: itemStatsWhere,
      _count: true
    });

    res.json({
      total,
      active,
      archived,
      linkedItems: itemStats._count,
      byStatus: byStatus.reduce((acc, s) => {
        acc[s.customsDocumentStatus] = s._count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching shipment stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/shipments/search-items
 * Returns unlinked items the requester is allowed to add to a shipment.
 * Manufacturers see only their own unlinked items.
 * MUST be before /:id to avoid Express catching it as an id param.
 */
router.get('/search-items', authGuard, requireInternalStaffOrManufacturer, async (req, res) => {
  try {
    const { search, stage } = req.query;

    const where = {
      shipmentId: null,
      archivedAt: null,
    };

    if (req.user.role === 'MANUFACTURER') {
      where.manufacturerId = req.user.manufacturer.id;
    }

    if (stage) {
      where.currentStage = stage;
    }

    if (search) {
      where.OR = [
        { productCode: { contains: search , mode: 'insensitive'} },
        { serialNumber: { contains: search , mode: 'insensitive'} },
        { billOfLading: { contains: search , mode: 'insensitive'} },
        { order: { poNumber: { contains: search , mode: 'insensitive'} } },
        { order: { account: { name: { contains: search , mode: 'insensitive'} } } },
        { order: { account: { contactName: { contains: search , mode: 'insensitive'} } } }
      ];
    }

    const items = await prisma.orderItem.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            poNumber: true,
            account: { select: { name: true } }
          }
        }
      },
      take: 50,
      orderBy: { createdAt: 'desc' }
    });

    res.json(items);
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({ error: 'Failed to search items' });
  }
});

/**
 * GET /api/shipments/:id
 */
router.get('/:id', authGuard, requireShipmentViewer, async (req, res) => {
  try {
    const { id } = req.params;
    const isManufacturer = req.user.role === 'MANUFACTURER';

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        items: {
          where: manufacturerItemFilter(req),
          include: {
            manufacturer: { select: { name: true } },
            order: {
              select: {
                id: true,
                poNumber: true,
                sku: true,
                account: {
                  select: { id: true, name: true, email: true, phone: true, contactName: true }
                }
              }
            },
            _count: {
              select: { documents: true }
            }
          }
        },
        documents: {
          orderBy: { uploadedAt: 'desc' }
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50
        }
      }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // For manufacturers: if the shipment has no items belonging to them AND
    // they didn't create it, treat as not found rather than leaking it.
    // (Manufacturer-created empty shipments stay accessible.)
    if (
      isManufacturer &&
      shipment.items.length === 0 &&
      shipment.createdByUserId !== req.user.id
    ) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const itemDocCount = shipment.items.reduce((total, item) => {
      return total + (item._count?.documents || 0);
    }, 0);

    res.json({
      ...shipment,
      itemDocCount,
      totalDocCount: shipment.documents.length + itemDocCount
    });
  } catch (error) {
    console.error('Error fetching shipment:', error);
    res.status(500).json({ error: 'Failed to fetch shipment' });
  }
});

/**
 * POST /api/shipments
 * Manufacturers can create shipments; createdByUserId records ownership so
 * they can subsequently see/edit-via-link-item their brand-new empty shipment.
 */
router.post('/', authGuard, requireInternalStaffOrManufacturer, async (req, res) => {
  try {
    const { containerNumber, billOfLading, etaDate, vesselName, portOfOrigin, portOfDestination } = req.body;

    if (!containerNumber && !billOfLading) {
      return res.status(400).json({ error: 'Container number or Bill of Lading is required' });
    }

    const shipment = await prisma.shipment.create({
      data: {
        containerNumber,
        billOfLading,
        etaDate: etaDate ? new Date(etaDate) : null,
        vesselName,
        portOfOrigin,
        portOfDestination,
        createdByUserId: req.user.id,
        createdByName: req.user.name
      }
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: shipment.id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'CREATED',
        notes: `Created shipment ${containerNumber || billOfLading}`
      }
    });

    res.json(shipment);
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({ error: 'Failed to create shipment' });
  }
});

/**
 * PUT /api/shipments/:id
 * Editing shipment metadata (BOL, vessel, customs status, etc.) remains
 * restricted to internal staff and brokers. Manufacturers create + link only.
 */
router.put('/:id', authGuard, requireBrokerOrStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { containerNumber, billOfLading, etaDate, vesselName, portOfOrigin, portOfDestination, customsDocumentStatus, customsNotes } = req.body;

    const current = await prisma.shipment.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const updateData = {};
    if (containerNumber !== undefined) updateData.containerNumber = containerNumber;
    if (billOfLading !== undefined) updateData.billOfLading = billOfLading;
    if (etaDate !== undefined) updateData.etaDate = etaDate ? new Date(etaDate) : null;
    if (vesselName !== undefined) updateData.vesselName = vesselName;
    if (portOfOrigin !== undefined) updateData.portOfOrigin = portOfOrigin;
    if (portOfDestination !== undefined) updateData.portOfDestination = portOfDestination;
    if (customsNotes !== undefined) updateData.customsNotes = customsNotes;

    const itemSyncData = {};

    if (customsDocumentStatus !== undefined && customsDocumentStatus !== current.customsDocumentStatus) {
      updateData.customsDocumentStatus = customsDocumentStatus;
      
      if (customsDocumentStatus === 'FILED' && !current.customsFiledDate) {
        updateData.customsFiledDate = new Date();
        itemSyncData.customsFiledDate = updateData.customsFiledDate;
      }
      if (customsDocumentStatus === 'CLEARED' && !current.customsClearedDate) {
        updateData.customsClearedDate = new Date();
        itemSyncData.customsClearedDate = updateData.customsClearedDate;
      }

      await prisma.shipmentActivityLog.create({
        data: {
          shipmentId: id,
          userId: req.user.id,
          userName: req.user.name,
          action: 'STATUS_UPDATED',
          oldStatus: current.customsDocumentStatus,
          newStatus: customsDocumentStatus,
          notes: customsNotes
        }
      });

      await syncShipmentStatusToItems(id, customsDocumentStatus, itemSyncData);
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          where: { archivedAt: null },
          select: { id: true, productCode: true }
        },
        _count: { select: { items: true, documents: true } }
      }
    });

    res.json(shipment);
  } catch (error) {
    console.error('Error updating shipment:', error);
    res.status(500).json({ error: 'Failed to update shipment' });
  }
});

/**
 * POST /api/shipments/:id/archive
 */
router.post('/:id/archive', authGuard, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (shipment.archivedAt) {
      return res.status(400).json({ error: 'Shipment is already archived' });
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        archivedBy: req.user.name
      }
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'ARCHIVED',
        notes: `Shipment archived by ${req.user.name}`
      }
    });

    res.json({ message: 'Shipment archived successfully', shipment: updated });
  } catch (error) {
    console.error('Error archiving shipment:', error);
    res.status(500).json({ error: 'Failed to archive shipment' });
  }
});

/**
 * POST /api/shipments/:id/unarchive
 */
router.post('/:id/unarchive', authGuard, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (!shipment.archivedAt) {
      return res.status(400).json({ error: 'Shipment is not archived' });
    }

    const updated = await prisma.shipment.update({
      where: { id },
      data: {
        archivedAt: null,
        archivedBy: null
      }
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'UNARCHIVED',
        notes: `Shipment restored by ${req.user.name}`
      }
    });

    res.json({ message: 'Shipment restored successfully', shipment: updated });
  } catch (error) {
    console.error('Error unarchiving shipment:', error);
    res.status(500).json({ error: 'Failed to restore shipment' });
  }
});

/**
 * DELETE /api/shipments/:id
 */
router.delete('/:id', authGuard, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } }
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (shipment._count.items > 0) {
      return res.status(400).json({ error: 'Cannot delete shipment with linked items. Unlink items first.' });
    }

    await prisma.shipment.delete({ where: { id } });

    res.json({ message: 'Shipment deleted successfully' });
  } catch (error) {
    console.error('Error deleting shipment:', error);
    res.status(500).json({ error: 'Failed to delete shipment' });
  }
});

// =============================
// ITEM LINKING
// =============================

// Helper: for manufacturers, verify they have access to the given shipment.
// Shipment is accessible if: contains at least one of their items, or they created it.
async function manufacturerCanAccessShipment(req, shipmentId) {
  if (req.user.role !== 'MANUFACTURER') return true;
  const accessible = await prisma.shipment.findFirst({
    where: {
      id: shipmentId,
      OR: [
        { items: { some: { manufacturerId: req.user.manufacturer.id, archivedAt: null } } },
        { createdByUserId: req.user.id },
      ],
    },
    select: { id: true },
  });
  return !!accessible;
}

/**
 * POST /api/shipments/:id/link-item
 * Manufacturers can link their own items to shipments they have access to
 * (shipments containing their items or shipments they created).
 */
router.post('/:id/link-item', authGuard, requireInternalStaffOrManufacturer, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (shipment.archivedAt) {
      return res.status(400).json({ error: 'Cannot link items to archived shipments. Restore the shipment first.' });
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: { select: { poNumber: true, account: { select: { name: true } } } } }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Manufacturer guards: item must belong to them AND they must have access to the shipment.
    if (req.user.role === 'MANUFACTURER') {
      if (item.manufacturerId !== req.user.manufacturer.id) {
        return res.status(403).json({ error: 'You can only link items assigned to you' });
      }
      if (!(await manufacturerCanAccessShipment(req, id))) {
        return res.status(404).json({ error: 'Shipment not found' });
      }
    }

    if (item.shipmentId) {
      return res.status(400).json({ error: 'Item is already linked to a shipment' });
    }

    const updateData = { shipmentId: id };
    if (shipment.customsDocumentStatus) {
      updateData.customsDocumentStatus = shipment.customsDocumentStatus;
    }
    if (shipment.customsFiledDate) {
      updateData.customsFiledDate = shipment.customsFiledDate;
    }
    if (shipment.customsClearedDate) {
      updateData.customsClearedDate = shipment.customsClearedDate;
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: updateData
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'ITEM_LINKED',
        notes: `Linked item ${item.productCode} from ${item.order.account?.name || 'Unknown'}`,
        metadata: JSON.stringify({ itemId, productCode: item.productCode, customer: item.order.account?.name })
      }
    });

    res.json({ message: 'Item linked successfully' });
  } catch (error) {
    console.error('Error linking item:', error);
    res.status(500).json({ error: 'Failed to link item' });
  }
});

/**
 * POST /api/shipments/:id/unlink-item
 * Manufacturers can unlink their own items from any shipment.
 */
router.post('/:id/unlink-item', authGuard, requireInternalStaffOrManufacturer, async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: { select: { account: { select: { name: true } } } } }
    });

    if (!item || item.shipmentId !== id) {
      return res.status(400).json({ error: 'Item is not linked to this shipment' });
    }

    // Manufacturer guard: item must belong to them.
    if (req.user.role === 'MANUFACTURER' && item.manufacturerId !== req.user.manufacturer.id) {
      return res.status(403).json({ error: 'You can only unlink items assigned to you' });
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: { shipmentId: null }
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'ITEM_UNLINKED',
        notes: `Unlinked item ${item.productCode}`,
        metadata: JSON.stringify({ itemId, productCode: item.productCode })
      }
    });

    res.json({ message: 'Item unlinked successfully' });
  } catch (error) {
    console.error('Error unlinking item:', error);
    res.status(500).json({ error: 'Failed to unlink item' });
  }
});

// =============================
// SHIPMENT DOCUMENTS
// =============================

// Helper: for manufacturers, verify access to the shipment for document operations.
// Shipment is accessible if: contains one of their items, OR they created it.
async function manufacturerHasShipmentAccess(req, shipmentId) {
  if (req.user.role !== 'MANUFACTURER') return true;
  const hasItem = await prisma.orderItem.findFirst({
    where: {
      shipmentId,
      manufacturerId: req.user.manufacturer.id,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (hasItem) return true;
  // Fallback: manufacturer-created shipments stay accessible even when empty.
  const created = await prisma.shipment.findFirst({
    where: { id: shipmentId, createdByUserId: req.user.id },
    select: { id: true },
  });
  return !!created;
}

// Helper: for manufacturers, verify a given itemId belongs to one of their items.
async function manufacturerOwnsItem(req, itemId) {
  if (req.user.role !== 'MANUFACTURER') return true;
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    select: { manufacturerId: true },
  });
  return !!item && item.manufacturerId === req.user.manufacturer.id;
}

/**
 * GET /api/shipments/:id/documents
 * Uses documentService for unified view across both tables.
 * For manufacturers, filters out ItemDocuments from items they don't own.
 */
router.get('/:id/documents', authGuard, requireShipmentViewer, async (req, res) => {
  try {
    const { id } = req.params;

    if (!(await manufacturerHasShipmentAccess(req, id))) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const result = await getDocumentsForShipment(id);
    if (!result) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // Manufacturer scope: keep ShipmentDocuments (no itemId) plus ItemDocuments
    // from items they own. Rebuild checklist/stats from the filtered list.
    if (req.user.role === 'MANUFACTURER') {
      const myItems = await prisma.orderItem.findMany({
        where: {
          shipmentId: id,
          manufacturerId: req.user.manufacturer.id,
          archivedAt: null,
        },
        select: { id: true },
      });
      const myItemIds = new Set(myItems.map(i => i.id));

      const filtered = (result.documents || []).filter(d => {
        // Pure ShipmentDocument has no itemId
        if (!d.itemId) return true;
        // ItemDocument: must belong to one of their items
        return myItemIds.has(d.itemId);
      });

      const { checklist, stats } = buildChecklist(filtered);
      result.documents = filtered;
      result.checklist = checklist;
      result.stats = stats;
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching shipment documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * POST /api/shipments/:id/documents
 * Upload document to shipment (creates ShipmentDocument).
 * Manufacturers can upload to shipments they have access to, restricted
 * to the same 6 document types they're allowed at the item level.
 */
router.post('/:id/documents', authGuard, requireShipmentViewer, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType } = req.body;
    const file = req.file;
    const username = req.user.name;

    if (!(await manufacturerHasShipmentAccess(req, id))) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    let allowedTypes;
    if (req.user.role === 'BROKER') {
      allowedTypes = BROKER_DOCUMENT_TYPES;
    } else if (req.user.role === 'MANUFACTURER') {
      allowedTypes = REQUIRED_DOCUMENT_TYPES;
    } else {
      allowedTypes = Object.keys(DOCUMENT_TYPES);
    }
    if (!documentType || !allowedTypes.includes(documentType)) {
      return res.status(400).json({ error: `Invalid document type. Allowed: ${allowedTypes.join(', ')}` });
    }

    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: `shipment-${id}`,
      uploadedBy: username
    });

    const document = await prisma.shipmentDocument.create({
      data: {
        shipmentId: id,
        fileName: s3Data.fileName,
        fileSize: s3Data.fileSize,
        fileType: s3Data.fileType,
        documentType,
        s3Key: s3Data.s3Key,
        s3Url: s3Data.s3Url,
        uploadedBy: username
      }
    });

    await prisma.shipmentActivityLog.create({
      data: {
        shipmentId: id,
        userId: req.user.id,
        userName: req.user.name,
        action: 'DOCUMENT_UPLOADED',
        notes: `Uploaded ${DOCUMENT_TYPE_LABELS[documentType] || documentType}: ${file.originalname}`
      }
    });

    res.json({ message: 'Document uploaded successfully', document });
  } catch (error) {
    console.error('Error uploading shipment document:', error);
    res.status(500).json({ error: error.message || 'Failed to upload document' });
  }
});

/**
 * GET /api/shipments/:id/documents/:documentId/download
 * Uses documentService to resolve across both tables.
 * For manufacturers, ItemDocuments must belong to items they own.
 */
router.get('/:id/documents/:documentId/download', authGuard, requireShipmentViewer, async (req, res) => {
  try {
    const { id, documentId } = req.params;

    if (!(await manufacturerHasShipmentAccess(req, id))) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const resolved = await resolveDocumentById(documentId, { shipmentId: id });
    if (!resolved) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Manufacturer additional check for ItemDocuments: must belong to one of their items.
    if (
      req.user.role === 'MANUFACTURER' &&
      resolved.table === 'ItemDocument' &&
      !(await manufacturerOwnsItem(req, resolved.document.itemId))
    ) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const downloadUrl = await getSignedDownloadUrl(resolved.document.s3Key, resolved.document.fileName);
    res.json({ downloadUrl, fileName: resolved.document.fileName });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

/**
 * DELETE /api/shipments/:id/documents/:documentId
 * Uses documentService to resolve and delete from correct table.
 * Manufacturers can delete documents they uploaded; admins can delete any.
 */
router.delete('/:id/documents/:documentId', authGuard, requireShipmentViewer, async (req, res) => {
  try {
    const { id, documentId } = req.params;

    if (!(await manufacturerHasShipmentAccess(req, id))) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const resolved = await resolveDocumentById(documentId, { shipmentId: id });
    if (!resolved) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Manufacturer additional check for ItemDocuments: must belong to one of their items.
    if (
      req.user.role === 'MANUFACTURER' &&
      resolved.table === 'ItemDocument' &&
      !(await manufacturerOwnsItem(req, resolved.document.itemId))
    ) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only uploader or admin can delete (applies uniformly across all roles).
    if (resolved.document.uploadedBy !== req.user.name && !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to delete this document' });
    }

    await deleteResolvedDocument(resolved, deleteFileFromS3);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting shipment document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
