import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authGuard } from '../middleware/auth.js';
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from '../services/fileUploadService.js';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENT_TYPES, BROKER_DOCUMENT_TYPES } from './itemDocuments.js';

const prisma = new PrismaClient();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware to ensure only broker role can access
const requireBrokerRole = (req, res, next) => {
  if (req.user.role !== 'BROKER' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Access denied. Broker role required.' });
  }
  next();
};

// Helper function to calculate days at sea and priority
// Used by both /items-at-sea and /statistics endpoints for consistency
function calculateDaysAtSeaAndPriority(item, now) {
  // Get the date item entered AT_SEA stage
  let atSeaDate;
  if (item.statusEvents && item.statusEvents.length > 0) {
    atSeaDate = new Date(item.statusEvents[0].createdAt);
  } else {
    // Fallback: use item creation date (for legacy items without status events)
    atSeaDate = new Date(item.createdAt);
  }

  // Calculate days at sea
  const daysAtSea = Math.floor((now - atSeaDate) / (1000 * 60 * 60 * 24));

  // Determine priority based on days at sea
  let priority = 'NORMAL';
  if (daysAtSea >= 15) {
    priority = 'CRITICAL';
  } else if (daysAtSea >= 10) {
    priority = 'HIGH';
  } else if (daysAtSea >= 5) {
    priority = 'MEDIUM';
  }

  return { daysAtSea, priority, atSeaDate };
}

export function createBrokerRouter() {
  const router = express.Router();

  // GET /api/broker/items-at-sea
  // Returns all items currently at "AT_SEA" stage
  router.get('/items-at-sea', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const items = await prisma.orderItem.findMany({
        where: {
          currentStage: 'AT_SEA',
          archivedAt: null
        },
        include: {
          order: {
            select: {
              id: true,
              poNumber: true,
              sku: true, // Sales person
              orderDate: true,
              etaDate: true,
              brokerDocsLink: true,
              account: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  contactName: true
                }
              }
            }
          },
          shipment: {
            select: {
              id: true,
              containerNumber: true,
              billOfLading: true,
              _count: { select: { items: true } }
            }
          },
          statusEvents: {
            where: {
              stage: 'AT_SEA'
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          }
        },
        orderBy: [
          { createdAt: 'desc' }
        ]
      });

      // Calculate priority based on days at sea
      const now = new Date();
      const itemsWithPriority = items.map(item => {
        const { daysAtSea, priority } = calculateDaysAtSeaAndPriority(item, now);

        return {
          ...item,
          priority,
          daysAtSea,
          // Keep daysUntilArrival for backwards compatibility (negative means overdue)
          daysUntilArrival: 15 - daysAtSea
        };
      });

      // Sort by priority (critical first), then by days at sea (longest first)
      const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'NORMAL': 3 };
      itemsWithPriority.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.daysAtSea - a.daysAtSea; // Longest at sea first within same priority
      });

      console.log(`[BROKER] Found ${itemsWithPriority.length} items at AT_SEA stage`);
      res.json(itemsWithPriority);
    } catch (error) {
      console.error('Error fetching items at sea:', error);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  // GET /api/broker/item/:id
  // Get detailed item information
  router.get('/item/:id', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { id } = req.params;

      const item = await prisma.orderItem.findUnique({
        where: { id: id },
        include: {
          order: {
            include: {
              account: true,
              items: {
                where: { archivedAt: null },
                select: {
                  id: true,
                  productCode: true,
                  currentStage: true,
                  containers: true
                }
              }
            }
          },
          shipment: {
            include: {
              items: {
                where: { archivedAt: null },
                select: {
                  id: true,
                  productCode: true,
                  order: {
                    select: {
                      poNumber: true,
                      account: { select: { name: true } }
                    }
                  }
                }
              },
              _count: { select: { items: true, documents: true } }
            }
          }
        }
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Log the view
      await prisma.brokerActivityLog.create({
        data: {
          orderItemId: item.id,
          userId: req.user.id,
          action: 'VIEWED'
        }
      });

      // Update last viewed date
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { brokerLastViewedDate: new Date() }
      });

      res.json(item);
    } catch (error) {
      console.error('Error fetching item details:', error);
      res.status(500).json({ error: 'Failed to fetch item details' });
    }
  });

  // POST /api/broker/update-status/:id
  // Update customs document status
  router.post('/update-status/:id', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const validStatuses = ['PENDING', 'IN_PROGRESS', 'FILED', 'CLEARED', 'ISSUES'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      // Get current item for logging
      const currentItem = await prisma.orderItem.findUnique({
        where: { id: id },
        include: {
          order: {
            select: {
              id: true,
              poNumber: true,
              account: {
                select: { name: true }
              }
            }
          }
        }
      });

      if (!currentItem) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Update item
      const updateData = {
        customsDocumentStatus: status,
        customsNotes: notes || undefined
      };

      // Set filed date when status changes to FILED
      if (status === 'FILED' && currentItem.customsDocumentStatus !== 'FILED') {
        updateData.customsFiledDate = new Date();
      }

      // Set cleared date when status changes to CLEARED
      if (status === 'CLEARED' && currentItem.customsDocumentStatus !== 'CLEARED') {
        updateData.customsClearedDate = new Date();
      }

      const item = await prisma.orderItem.update({
        where: { id: id },
        data: updateData,
        include: {
          order: {
            select: {
              id: true,
              poNumber: true,
              account: {
                select: { name: true }
              }
            }
          }
        }
      });

      // Log the activity
      await prisma.brokerActivityLog.create({
        data: {
          orderItemId: item.id,
          userId: req.user.id,
          action: 'STATUS_UPDATED',
          oldStatus: currentItem.customsDocumentStatus || 'PENDING',
          newStatus: status,
          notes: notes
        }
      });

      // Create notifications for SUPER_ADMINs only
      const superAdmins = await prisma.user.findMany({
        where: {
          role: 'SUPER_ADMIN',
          isActive: true
        },
        select: { id: true }
      });

      // Determine priority and type based on status
      let priority = 'NORMAL';
      let type = 'BROKER_STATUS_UPDATE';

      if (status === 'CLEARED') {
        priority = 'HIGH';
        type = 'BROKER_CLEARED';
      } else if (status === 'ISSUES') {
        priority = 'CRITICAL';
        type = 'BROKER_ISSUES';
      } else if (status === 'FILED') {
        priority = 'HIGH';
        type = 'BROKER_FILED';
      }

      // Create notification for each super admin
      for (const admin of superAdmins) {
        await prisma.notification.create({
          data: {
            userId: String(admin.id),
            type,
            category: 'BROKER',
            title: `Customs ${status}: ${item.productCode}`,
            message: `Broker updated customs status to ${status} for ${item.productCode} in order ${item.order.poNumber || item.order.id}${notes ? '. Note: ' + notes : ''}`,
            relatedOrderId: item.order.id,
            relatedItemId: item.id,
            metadata: JSON.stringify({
              oldStatus: currentItem.customsDocumentStatus || 'PENDING',
              newStatus: status,
              customerName: item.order.account?.name,
              brokerName: req.user.name,
              notes: notes || null
            }),
            priority
          }
        });
      }

      console.log(`[BROKER] Created ${superAdmins.length} notifications for status update: ${status}`);

      res.json(item);
    } catch (error) {
      console.error('Error updating customs status:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  // POST /api/broker/add-note/:id
  // Add a note to an item
  router.post('/add-note/:id', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const item = await prisma.orderItem.update({
        where: { id: id },
        data: { customsNotes: notes }
      });

      // Log the activity
      await prisma.brokerActivityLog.create({
        data: {
          orderItemId: item.id,
          userId: req.user.id,
          action: 'NOTE_ADDED',
          notes: notes
        }
      });

      res.json(item);
    } catch (error) {
      console.error('Error adding note:', error);
      res.status(500).json({ error: 'Failed to add note' });
    }
  });

  // GET /api/broker/activity-log/:itemId
  // Get activity log for an item
  router.get('/activity-log/:itemId', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { itemId } = req.params;

      const logs = await prisma.brokerActivityLog.findMany({
        where: { orderItemId: itemId },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(logs);
    } catch (error) {
      console.error('Error fetching activity log:', error);
      res.status(500).json({ error: 'Failed to fetch activity log' });
    }
  });

  // GET /api/broker/statistics
  // Get broker dashboard statistics
  router.get('/statistics', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const stats = await prisma.orderItem.groupBy({
        by: ['customsDocumentStatus'],
        where: {
          currentStage: 'AT_SEA',
          archivedAt: null
        },
        _count: true
      });

      const total = await prisma.orderItem.count({
        where: {
          currentStage: 'AT_SEA',
          archivedAt: null
        }
      });

      // Get all items at sea with their status events to calculate days at sea
      const itemsAtSea = await prisma.orderItem.findMany({
        where: {
          currentStage: 'AT_SEA',
          archivedAt: null
        },
        include: {
          statusEvents: {
            where: {
              stage: 'AT_SEA'
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          }
        }
      });

      // Count critical items (at sea for 15+ days) using same logic as /items-at-sea
      const now = new Date();
      const critical = itemsAtSea.filter(item => {
        const { priority } = calculateDaysAtSeaAndPriority(item, now);
        return priority === 'CRITICAL';
      }).length;

      res.json({
        total,
        critical,
        byStatus: stats
      });
    } catch (error) {
      console.error('Error fetching statistics:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  // GET /api/broker/history
  // Get completed shipments (for reference)
  router.get('/history', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      const items = await prisma.orderItem.findMany({
        where: {
          OR: [
            { currentStage: 'Arrived at SMT' },
            { currentStage: 'Quality Control' },
            { currentStage: 'Delivered' }
          ],
          customsDocumentStatus: 'CLEARED',
          archivedAt: null
        },
        include: {
          order: {
            select: {
              poNumber: true,
              account: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: { customsClearedDate: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      });

      const total = await prisma.orderItem.count({
        where: {
          OR: [
            { currentStage: 'Arrived at SMT' },
            { currentStage: 'Quality Control' },
            { currentStage: 'Delivered' }
          ],
          customsDocumentStatus: 'CLEARED',
          archivedAt: null
        }
      });

      res.json({
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching history:', error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // =============================
  // BROKER DOCUMENT ENDPOINTS
  // =============================

  // GET /broker/item/:itemId/documents
  // Get documents for an item (includes all shared docs from shipment and sibling items)
  router.get('/item/:itemId/documents', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { itemId } = req.params;

      // Get item with shipment info
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: {
          shipment: {
            include: {
              items: {
                where: { archivedAt: null },
                select: { id: true, productCode: true }
              }
            }
          }
        }
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      let documents = [];
      let isSharedShipment = false;
      let shipmentInfo = null;

      // If item is linked to a shipment, get all shared documents
      if (item.shipmentId && item.shipment) {
        isSharedShipment = true;
        
        // Get IDs of other items in this shipment
        const allItemIds = item.shipment.items.map(i => i.id);
        const otherItemIds = allItemIds.filter(id => id !== itemId);
        
        shipmentInfo = {
          id: item.shipment.id,
          containerNumber: item.shipment.containerNumber,
          billOfLading: item.shipment.billOfLading,
          itemCount: item.shipment.items.length,
          items: item.shipment.items
        };

        // Get ShipmentDocument records (explicitly shared)
        const shipmentDocs = await prisma.shipmentDocument.findMany({
          where: { shipmentId: item.shipmentId },
          orderBy: { uploadedAt: 'desc' }
        });

        // Mark shipment docs as shared
        const markedShipmentDocs = shipmentDocs.map(doc => ({
          ...doc,
          isShipmentDocument: true
        }));

        // Get ItemDocument records from ALL items in the shipment (including this one)
        const itemDocs = await prisma.itemDocument.findMany({
          where: { itemId: { in: allItemIds } },
          include: {
            item: { select: { productCode: true } }
          },
          orderBy: { uploadedAt: 'desc' }
        });

        // Mark item docs - those from other items are shared
        const markedItemDocs = itemDocs.map(doc => ({
          ...doc,
          isShipmentDocument: doc.itemId !== itemId, // Shared if from another item
          fromItemProductCode: doc.item?.productCode
        }));

        // Combine all documents
        documents = [...markedShipmentDocs, ...markedItemDocs];

        // Deduplicate by ID
        const seenIds = new Set();
        documents = documents.filter(doc => {
          if (seenIds.has(doc.id)) return false;
          seenIds.add(doc.id);
          return true;
        });
      } else {
        // Get item-level documents only
        documents = await prisma.itemDocument.findMany({
          where: { itemId },
          orderBy: { uploadedAt: 'desc' }
        });
      }

      // Build checklist
      const checklist = {};
      for (const [key, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
        const count = documents.filter(d => d.documentType === key).length;
        checklist[key] = { uploaded: count > 0, count, label };
      }

      const uploadedRequired = REQUIRED_DOCUMENT_TYPES.filter(
        type => checklist[type]?.uploaded
      ).length;

      res.json({
        documents,
        checklist,
        stats: {
          complete: uploadedRequired === REQUIRED_DOCUMENT_TYPES.length,
          uploadedRequired,
          totalRequired: REQUIRED_DOCUMENT_TYPES.length
        },
        isSharedShipment,
        shipmentInfo
      });
    } catch (error) {
      console.error('Broker get documents error:', error);
      res.status(500).json({ error: 'Failed to retrieve documents' });
    }
  });

  // POST /broker/item/:itemId/documents
  // Upload document (to shipment if linked, otherwise to item)
  router.post('/item/:itemId/documents', authGuard, requireBrokerRole, upload.single('file'), async (req, res) => {
    try {
      const { itemId } = req.params;
      const { documentType } = req.body;
      const file = req.file;
      const username = req.user.name;

      // Validate documentType - broker can only upload broker-specific types
      if (!documentType || !BROKER_DOCUMENT_TYPES.includes(documentType)) {
        return res.status(400).json({ 
          error: 'Invalid document type. Allowed types: ISF Report, Entry Summary, Delivery Order, Broker Invoice, Other'
        });
      }

      // Validate file
      const validationErrors = validateFile(file);
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: validationErrors.join(', ') });
      }

      // Verify item exists and check for shipment link
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: { order: true, shipment: true }
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Determine upload destination
      const isSharedShipment = !!item.shipmentId;

      // Upload to S3
      const s3Data = await uploadFileToS3({
        fileBuffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        orderId: isSharedShipment ? `shipment-${item.shipmentId}` : item.orderId,
        uploadedBy: username
      });

      let document;

      if (isSharedShipment) {
        // Create shipment document
        document = await prisma.shipmentDocument.create({
          data: {
            shipmentId: item.shipmentId,
            fileName: s3Data.fileName,
            fileSize: s3Data.fileSize,
            fileType: s3Data.fileType,
            documentType,
            s3Key: s3Data.s3Key,
            s3Url: s3Data.s3Url,
            uploadedBy: username
          }
        });

        // Log to shipment activity
        await prisma.shipmentActivityLog.create({
          data: {
            shipmentId: item.shipmentId,
            userId: req.user.id,
            userName: req.user.name,
            action: 'DOCUMENT_UPLOADED',
            notes: `Uploaded ${DOCUMENT_TYPE_LABELS[documentType] || documentType}: ${file.originalname}`
          }
        });
      } else {
        // Create item document
        document = await prisma.itemDocument.create({
          data: {
            itemId,
            fileName: s3Data.fileName,
            fileSize: s3Data.fileSize,
            fileType: s3Data.fileType,
            documentType,
            s3Key: s3Data.s3Key,
            s3Url: s3Data.s3Url,
            uploadedBy: username
          }
        });
      }

      // Log activity to item
      await prisma.brokerActivityLog.create({
        data: {
          orderItemId: itemId,
          userId: req.user.id,
          action: 'DOCUMENT_UPLOADED',
          notes: `Uploaded ${DOCUMENT_TYPE_LABELS[documentType] || documentType}: ${file.originalname}${isSharedShipment ? ' (to shared shipment)' : ''}`
        }
      });

      res.json({ 
        message: 'Document uploaded successfully', 
        document,
        uploadedToShipment: isSharedShipment
      });
    } catch (error) {
      console.error('Broker upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload document' });
    }
  });

  // GET /broker/item/:itemId/documents/:documentId/download
  // Get signed download URL (handles item docs, shipment docs, and sibling item docs)
  router.get('/item/:itemId/documents/:documentId/download', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { itemId, documentId } = req.params;

      // Get item with shipment info
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: {
          shipment: {
            include: {
              items: { select: { id: true } }
            }
          }
        }
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // 1. Check item documents for this item
      let document = await prisma.itemDocument.findUnique({
        where: { id: documentId }
      });

      if (document && document.itemId === itemId) {
        const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);
        return res.json({ downloadUrl, fileName: document.fileName });
      }

      // 2. Check shipment documents if item is in a shipment
      if (item.shipmentId) {
        const shipmentDoc = await prisma.shipmentDocument.findUnique({
          where: { id: documentId }
        });

        if (shipmentDoc && shipmentDoc.shipmentId === item.shipmentId) {
          const downloadUrl = await getSignedDownloadUrl(shipmentDoc.s3Key, shipmentDoc.fileName);
          return res.json({ downloadUrl, fileName: shipmentDoc.fileName });
        }

        // 3. Check item documents from sibling items in the same shipment
        if (document && item.shipment && item.shipment.items) {
          const siblingItemIds = item.shipment.items.map(i => i.id);
          if (siblingItemIds.includes(document.itemId)) {
            const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);
            return res.json({ downloadUrl, fileName: document.fileName });
          }
        }
      }

      return res.status(404).json({ error: 'Document not found' });
    } catch (error) {
      console.error('Broker download URL error:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  // DELETE /broker/item/:itemId/documents/:documentId
  // Delete document (handles item docs, shipment docs, and sibling item docs)
  router.delete('/item/:itemId/documents/:documentId', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { itemId, documentId } = req.params;

      // Get item with shipment info
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: {
          shipment: {
            include: {
              items: { select: { id: true } }
            }
          }
        }
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // 1. Check item documents for this item
      let document = await prisma.itemDocument.findUnique({
        where: { id: documentId }
      });

      if (document && document.itemId === itemId) {
        // Broker can only delete documents they uploaded
        if (document.uploadedBy !== req.user.name && req.user.role !== 'SUPER_ADMIN') {
          return res.status(403).json({ error: 'Not authorized to delete this document' });
        }

        await deleteFileFromS3(document.s3Key);
        await prisma.itemDocument.delete({ where: { id: documentId } });
        return res.json({ message: 'Document deleted successfully' });
      }

      // 2. Check shipment documents if item is in a shipment
      if (item.shipmentId) {
        const shipmentDoc = await prisma.shipmentDocument.findUnique({
          where: { id: documentId }
        });

        if (shipmentDoc && shipmentDoc.shipmentId === item.shipmentId) {
          if (shipmentDoc.uploadedBy !== req.user.name && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Not authorized to delete this document' });
          }

          await deleteFileFromS3(shipmentDoc.s3Key);
          await prisma.shipmentDocument.delete({ where: { id: documentId } });
          return res.json({ message: 'Shipment document deleted successfully' });
        }

        // 3. Check item documents from sibling items (broker can only delete their own uploads)
        if (document && item.shipment && item.shipment.items) {
          const siblingItemIds = item.shipment.items.map(i => i.id);
          if (siblingItemIds.includes(document.itemId)) {
            if (document.uploadedBy !== req.user.name && req.user.role !== 'SUPER_ADMIN') {
              return res.status(403).json({ error: 'Not authorized to delete this document' });
            }

            await deleteFileFromS3(document.s3Key);
            await prisma.itemDocument.delete({ where: { id: documentId } });
            return res.json({ message: 'Document deleted successfully' });
          }
        }
      }

      return res.status(404).json({ error: 'Document not found' });
    } catch (error) {
      console.error('Broker delete error:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  return router;
}
