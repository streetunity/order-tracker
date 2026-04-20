import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authGuard } from '../middleware/auth.js';
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from '../services/fileUploadService.js';
import {
  DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS,
  getDocumentsForItem, resolveDocumentById, deleteResolvedDocument
} from '../services/documentService.js';
import { queueBrokerDocumentNotification } from '../services/brokerEmailService.js';

const prisma = new PrismaClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const requireBrokerRole = (req, res, next) => {
  if (req.user.role !== 'BROKER' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Access denied. Broker role required.' });
  }
  next();
};

function calculateDaysAtSeaAndPriority(item, now) {
  let atSeaDate;
  if (item.statusEvents && item.statusEvents.length > 0) {
    atSeaDate = new Date(item.statusEvents[0].createdAt);
  } else {
    atSeaDate = new Date(item.createdAt);
  }

  const daysAtSea = Math.floor((now - atSeaDate) / (1000 * 60 * 60 * 24));

  let priority = 'NORMAL';
  if (daysAtSea >= 15) priority = 'CRITICAL';
  else if (daysAtSea >= 10) priority = 'HIGH';
  else if (daysAtSea >= 5) priority = 'MEDIUM';

  return { daysAtSea, priority, atSeaDate };
}

async function syncItemStatusToShipmentAndSiblings(itemId, shipmentId, newStatus, dateFields = {}) {
  const shipmentUpdateData = { customsDocumentStatus: newStatus };
  if (dateFields.customsFiledDate) shipmentUpdateData.customsFiledDate = dateFields.customsFiledDate;
  if (dateFields.customsClearedDate) shipmentUpdateData.customsClearedDate = dateFields.customsClearedDate;

  await prisma.shipment.update({ where: { id: shipmentId }, data: shipmentUpdateData });

  const siblingUpdateData = { customsDocumentStatus: newStatus };
  if (dateFields.customsFiledDate) siblingUpdateData.customsFiledDate = dateFields.customsFiledDate;
  if (dateFields.customsClearedDate) siblingUpdateData.customsClearedDate = dateFields.customsClearedDate;

  const result = await prisma.orderItem.updateMany({
    where: { shipmentId, id: { not: itemId }, archivedAt: null },
    data: siblingUpdateData
  });

  console.log(`[BROKER SYNC] Synced status "${newStatus}" from item ${itemId} to shipment ${shipmentId} and ${result.count} sibling items`);
  return result.count;
}

export function createBrokerRouter() {
  const router = express.Router();

  router.get('/items-at-sea', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const items = await prisma.orderItem.findMany({
        where: { currentStage: 'AT_SEA', archivedAt: null },
        include: {
          order: {
            select: {
              id: true, poNumber: true, sku: true, orderDate: true, etaDate: true, brokerDocsLink: true,
              account: { select: { id: true, name: true, email: true, phone: true, contactName: true } }
            }
          },
          shipment: { select: { id: true, containerNumber: true, billOfLading: true, _count: { select: { items: true } } } },
          statusEvents: { where: { stage: 'AT_SEA' }, orderBy: { createdAt: 'desc' }, take: 1 }
        },
        orderBy: [{ createdAt: 'desc' }]
      });

      const now = new Date();
      const itemsWithPriority = items.map(item => {
        const { daysAtSea, priority } = calculateDaysAtSeaAndPriority(item, now);
        return { ...item, priority, daysAtSea, daysUntilArrival: 15 - daysAtSea };
      });

      const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'NORMAL': 3 };
      itemsWithPriority.sort((a, b) => {
        const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return diff !== 0 ? diff : b.daysAtSea - a.daysAtSea;
      });

      console.log(`[BROKER] Found ${itemsWithPriority.length} items at AT_SEA stage`);
      res.json(itemsWithPriority);
    } catch (error) {
      console.error('Error fetching items at sea:', error);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  router.get('/item/:id', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { id } = req.params;

      const item = await prisma.orderItem.findUnique({
        where: { id },
        include: {
          order: {
            include: {
              account: true,
              items: { where: { archivedAt: null }, select: { id: true, productCode: true, currentStage: true, containers: true } }
            }
          },
          shipment: {
            include: {
              items: {
                where: { archivedAt: null },
                select: { id: true, productCode: true, order: { select: { poNumber: true, account: { select: { name: true } } } } }
              },
              _count: { select: { items: true, documents: true } }
            }
          }
        }
      });

      if (!item) return res.status(404).json({ error: 'Item not found' });

      await prisma.brokerActivityLog.create({ data: { orderItemId: item.id, userId: req.user.id, action: 'VIEWED' } });
      await prisma.orderItem.update({ where: { id: item.id }, data: { brokerLastViewedDate: new Date() } });

      res.json(item);
    } catch (error) {
      console.error('Error fetching item details:', error);
      res.status(500).json({ error: 'Failed to fetch item details' });
    }
  });

  router.post('/update-status/:id', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes, entryNumber } = req.body;

      const validStatuses = ['PENDING', 'FILED', 'RELEASED', 'UNDER_EXAM'];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

      const currentItem = await prisma.orderItem.findUnique({
        where: { id },
        include: { order: { select: { id: true, poNumber: true, account: { select: { name: true } } } } }
      });

      if (!currentItem) return res.status(404).json({ error: 'Item not found' });

      const updateData = {
        customsDocumentStatus: status,
        customsNotes: notes || undefined,
        entryNumber: entryNumber !== undefined ? (entryNumber || null) : undefined
      };
      const dateFields = {};

      if (status === 'FILED' && currentItem.customsDocumentStatus !== 'FILED') {
        updateData.customsFiledDate = new Date();
        dateFields.customsFiledDate = updateData.customsFiledDate;
      }
      if (status === 'RELEASED' && currentItem.customsDocumentStatus !== 'RELEASED') {
        updateData.customsClearedDate = new Date();
        dateFields.customsClearedDate = updateData.customsClearedDate;
      }

      const item = await prisma.orderItem.update({
        where: { id },
        data: updateData,
        include: { order: { select: { id: true, poNumber: true, account: { select: { name: true } } } } }
      });

      if (currentItem.shipmentId) {
        await syncItemStatusToShipmentAndSiblings(id, currentItem.shipmentId, status, dateFields);
        await prisma.shipmentActivityLog.create({
          data: {
            shipmentId: currentItem.shipmentId, userId: req.user.id, userName: req.user.name,
            action: 'STATUS_UPDATED',
            oldStatus: currentItem.customsDocumentStatus || 'PENDING', newStatus: status,
            notes: `Status synced from item ${currentItem.productCode || id} update by broker`
          }
        });
      }

      await prisma.brokerActivityLog.create({
        data: {
          orderItemId: item.id, userId: req.user.id, action: 'STATUS_UPDATED',
          oldStatus: currentItem.customsDocumentStatus || 'PENDING', newStatus: status, notes
        }
      });

      const superAdmins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } });

      let priority = 'NORMAL';
      let type = 'BROKER_STATUS_UPDATE';
      if (status === 'RELEASED') { priority = 'HIGH'; type = 'BROKER_RELEASED'; }
      else if (status === 'UNDER_EXAM') { priority = 'HIGH'; type = 'BROKER_UNDER_EXAM'; }
      else if (status === 'FILED') { priority = 'HIGH'; type = 'BROKER_FILED'; }

      for (const admin of superAdmins) {
        await prisma.notification.create({
          data: {
            userId: String(admin.id), type, category: 'BROKER',
            title: `Customs ${status}: ${item.productCode}`,
            message: `Broker updated customs status to ${status} for ${item.productCode} in order ${item.order.poNumber || item.order.id}${currentItem.shipmentId ? ' (synced to shipment)' : ''}${notes ? '. Note: ' + notes : ''}`,
            relatedOrderId: item.order.id, relatedItemId: item.id,
            metadata: JSON.stringify({
              oldStatus: currentItem.customsDocumentStatus || 'PENDING', newStatus: status,
              customerName: item.order.account?.name, brokerName: req.user.name,
              notes: notes || null, entryNumber: entryNumber || null, syncedToShipment: !!currentItem.shipmentId
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

  router.post('/add-note/:id', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const item = await prisma.orderItem.update({ where: { id }, data: { customsNotes: notes } });
      await prisma.brokerActivityLog.create({ data: { orderItemId: item.id, userId: req.user.id, action: 'NOTE_ADDED', notes } });
      res.json(item);
    } catch (error) {
      console.error('Error adding note:', error);
      res.status(500).json({ error: 'Failed to add note' });
    }
  });

  router.get('/activity-log/:itemId', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const logs = await prisma.brokerActivityLog.findMany({
        where: { orderItemId: req.params.itemId },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(logs);
    } catch (error) {
      console.error('Error fetching activity log:', error);
      res.status(500).json({ error: 'Failed to fetch activity log' });
    }
  });

  router.get('/statistics', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const stats = await prisma.orderItem.groupBy({
        by: ['customsDocumentStatus'],
        where: { currentStage: 'AT_SEA', archivedAt: null },
        _count: true
      });
      const total = await prisma.orderItem.count({ where: { currentStage: 'AT_SEA', archivedAt: null } });
      const itemsAtSea = await prisma.orderItem.findMany({
        where: { currentStage: 'AT_SEA', archivedAt: null },
        include: { statusEvents: { where: { stage: 'AT_SEA' }, orderBy: { createdAt: 'desc' }, take: 1 } }
      });
      const now = new Date();
      const critical = itemsAtSea.filter(item => calculateDaysAtSeaAndPriority(item, now).priority === 'CRITICAL').length;
      res.json({ total, critical, byStatus: stats });
    } catch (error) {
      console.error('Error fetching statistics:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  router.get('/history', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const skip = (page - 1) * limit;
      const where = {
        currentStage: { not: 'AT_SEA' },
        customsDocumentStatus: status ? status : { not: 'PENDING' },
        archivedAt: null
      };
      const items = await prisma.orderItem.findMany({
        where,
        include: {
          order: { select: { poNumber: true, account: { select: { name: true, contactName: true } } } },
          shipment: { select: { id: true, containerNumber: true } }
        },
        orderBy: [{ customsClearedDate: 'desc' }, { updatedAt: 'desc' }],
        skip: parseInt(skip), take: parseInt(limit)
      });
      const total = await prisma.orderItem.count({ where });
      res.json({ items, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
    } catch (error) {
      console.error('Error fetching history:', error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // =============================
  // BROKER DOCUMENT ENDPOINTS
  // =============================

  router.get('/item/:itemId/documents', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const result = await getDocumentsForItem(req.params.itemId);
      if (!result) return res.status(404).json({ error: 'Item not found' });
      res.json(result);
    } catch (error) {
      console.error('Broker get documents error:', error);
      res.status(500).json({ error: 'Failed to retrieve documents' });
    }
  });

  // POST /broker/item/:itemId/documents
  // Brokers upload their own docs; SUPER_ADMINs trigger a digest notification to brokers.
  router.post('/item/:itemId/documents', authGuard, requireBrokerRole, upload.single('file'), async (req, res) => {
    try {
      const { itemId } = req.params;
      const { documentType } = req.body;
      const file = req.file;
      const username = req.user.name;

      if (!documentType || !DOCUMENT_TYPES[documentType]) {
        return res.status(400).json({ error: 'Invalid document type' });
      }

      const validationErrors = validateFile(file);
      if (validationErrors.length > 0) return res.status(400).json({ error: validationErrors.join(', ') });

      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: { order: { include: { account: { select: { name: true } } } }, shipment: true }
      });

      if (!item) return res.status(404).json({ error: 'Item not found' });

      const isSharedShipment = !!item.shipmentId;

      const s3Data = await uploadFileToS3({
        fileBuffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype,
        orderId: isSharedShipment ? `shipment-${item.shipmentId}` : item.orderId,
        uploadedBy: username
      });

      let document;

      if (isSharedShipment) {
        document = await prisma.shipmentDocument.create({
          data: {
            shipmentId: item.shipmentId, fileName: s3Data.fileName, fileSize: s3Data.fileSize,
            fileType: s3Data.fileType, documentType, s3Key: s3Data.s3Key, s3Url: s3Data.s3Url, uploadedBy: username
          }
        });
        await prisma.shipmentActivityLog.create({
          data: {
            shipmentId: item.shipmentId, userId: req.user.id, userName: req.user.name,
            action: 'DOCUMENT_UPLOADED',
            notes: `Uploaded ${DOCUMENT_TYPE_LABELS[documentType] || documentType}: ${file.originalname}`
          }
        });
      } else {
        document = await prisma.itemDocument.create({
          data: {
            itemId, fileName: s3Data.fileName, fileSize: s3Data.fileSize, fileType: s3Data.fileType,
            documentType, s3Key: s3Data.s3Key, s3Url: s3Data.s3Url, uploadedBy: username
          }
        });
      }

      await prisma.brokerActivityLog.create({
        data: {
          orderItemId: itemId, userId: req.user.id, action: 'DOCUMENT_UPLOADED',
          notes: `Uploaded ${DOCUMENT_TYPE_LABELS[documentType] || documentType}: ${file.originalname}${isSharedShipment ? ' (to shared shipment)' : ''}`
        }
      });

      // Queue digest notification when a SUPER_ADMIN uploads through the broker portal
      if (req.user.role === 'SUPER_ADMIN') {
        queueBrokerDocumentNotification(prisma, {
          item, document, uploadedBy: username, documentType, isShipmentDoc: isSharedShipment
        }).catch(err => console.error('[BROKER EMAIL] Queue error:', err.message));
      }

      res.json({ message: 'Document uploaded successfully', document, uploadedToShipment: isSharedShipment });
    } catch (error) {
      console.error('Broker upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload document' });
    }
  });

  router.get('/item/:itemId/documents/:documentId/download', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { itemId, documentId } = req.params;
      const resolved = await resolveDocumentById(documentId, { itemId });
      if (!resolved) return res.status(404).json({ error: 'Document not found' });
      const downloadUrl = await getSignedDownloadUrl(resolved.document.s3Key, resolved.document.fileName);
      res.json({ downloadUrl, fileName: resolved.document.fileName });
    } catch (error) {
      console.error('Broker download URL error:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  router.delete('/item/:itemId/documents/:documentId', authGuard, requireBrokerRole, async (req, res) => {
    try {
      const { itemId, documentId } = req.params;
      const resolved = await resolveDocumentById(documentId, { itemId });
      if (!resolved) return res.status(404).json({ error: 'Document not found' });
      if (resolved.document.uploadedBy !== req.user.name && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Not authorized to delete this document' });
      }
      await deleteResolvedDocument(resolved, deleteFileFromS3);
      res.json({ message: 'Document deleted successfully' });
    } catch (error) {
      console.error('Broker delete error:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  return router;
}
