import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl, validateFile } from "../services/fileUploadService.js";
import { authGuard } from "../middleware/auth.js";

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for memory storage (files go directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Document type constants (all types across the system)
export const DOCUMENT_TYPES = {
  // Vendor/Manufacturer document types
  ISF: 'ISF',
  ARRIVAL_NOTICE: 'ARRIVAL_NOTICE',
  BILL_OF_LADING: 'BILL_OF_LADING',
  COMMERCIAL_INVOICE: 'COMMERCIAL_INVOICE',
  PACKING_LIST: 'PACKING_LIST',
  DELIVERY_ORDER: 'DELIVERY_ORDER',
  // Broker-specific document types
  ISF_REPORT: 'ISF_REPORT',
  ENTRY_SUMMARY: 'ENTRY_SUMMARY',
  BROKER_INVOICE: 'BROKER_INVOICE',
  // General
  OTHER: 'OTHER'
};

// Required documents from vendor/manufacturer
export const REQUIRED_DOCUMENT_TYPES = [
  'ISF',
  'ARRIVAL_NOTICE',
  'BILL_OF_LADING',
  'COMMERCIAL_INVOICE',
  'PACKING_LIST',
  'DELIVERY_ORDER'
];

// Broker-specific document types
export const BROKER_DOCUMENT_TYPES = [
  'ISF_REPORT',
  'ENTRY_SUMMARY',
  'DELIVERY_ORDER',
  'BROKER_INVOICE',
  'OTHER'
];

// Labels for all document types
export const DOCUMENT_TYPE_LABELS = {
  // Vendor/Manufacturer types
  ISF: 'ISF (International Security Filing)',
  ARRIVAL_NOTICE: 'Arrival Notice',
  BILL_OF_LADING: 'Bill of Lading',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  PACKING_LIST: 'Packing List',
  DELIVERY_ORDER: 'Delivery Order',
  // Broker types
  ISF_REPORT: 'ISF Report',
  ENTRY_SUMMARY: 'Entry Summary',
  BROKER_INVOICE: 'Broker Invoice',
  // General
  OTHER: 'Other'
};

/**
 * Upload document to item
 * POST /api/items/:itemId/documents
 */
router.post("/items/:itemId/documents", authGuard, upload.single('file'), async (req, res) => {
  try {
    const { itemId } = req.params;
    const { documentType } = req.body;
    const file = req.file;
    const username = req.user.name;

    // Validate documentType
    if (!DOCUMENT_TYPES[documentType]) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    // Validate file
    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    // Get item and check access
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: {
          include: { account: { select: { name: true } } }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to upload to this item" });
    }
    if (req.user.role === 'MANUFACTURER' && item.manufacturerId !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to upload to this item" });
    }

    // Upload to S3
    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: item.orderId, // Keep folder structure by order
      uploadedBy: username
    });

    // Create document record with audit log
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.itemDocument.create({
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

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'ItemDocument',
          entityId: doc.id,
          parentEntityId: item.orderId,
          action: 'DOCUMENT_UPLOADED',
          metadata: JSON.stringify({
            fileName: s3Data.fileName,
            fileSize: s3Data.fileSize,
            fileType: s3Data.fileType,
            documentType,
            documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType],
            itemId,
            productCode: item.productCode,
            orderPO: item.order?.poNumber,
            customerName: item.order?.account?.name
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      return doc;
    });

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

/**
 * Get all documents for an item with checklist status
 * Includes shipment documents if item is linked to a shared shipment
 * Also includes ItemDocuments from other items in the same shipment (for legacy uploads)
 * GET /api/items/:itemId/documents
 */
router.get("/items/:itemId/documents", authGuard, async (req, res) => {
  try {
    const { itemId } = req.params;

    // Get item with shipment info
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: true,
        shipment: {
          include: {
            items: {
              select: { id: true, productCode: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Get item-level documents for this specific item
    const itemDocuments = await prisma.itemDocument.findMany({
      where: { itemId },
      orderBy: { uploadedAt: 'desc' }
    });

    // Get shipment documents if item is linked to a shipment
    let shipmentDocuments = [];
    let otherItemDocuments = [];
    let isSharedShipment = false;
    let shipmentInfo = null;

    if (item.shipmentId && item.shipment) {
      isSharedShipment = true;
      
      // Get IDs of other items in this shipment
      const otherItemIds = item.shipment.items
        .filter(i => i.id !== itemId)
        .map(i => i.id);
      
      shipmentInfo = {
        id: item.shipment.id,
        containerNumber: item.shipment.containerNumber,
        billOfLading: item.shipment.billOfLading,
        linkedItems: item.shipment.items.filter(i => i.id !== itemId).map(i => ({
          id: i.id,
          productCode: i.productCode
        }))
      };

      // Get ShipmentDocument records (new shared documents)
      const rawShipmentDocs = await prisma.shipmentDocument.findMany({
        where: { shipmentId: item.shipmentId },
        orderBy: { uploadedAt: 'desc' }
      });

      // Mark shipment documents as shared
      shipmentDocuments = rawShipmentDocs.map(doc => ({
        ...doc,
        isShipmentDocument: true,
        shipmentId: item.shipmentId
      }));

      // Also get ItemDocument records from OTHER items in the same shipment
      // This handles legacy uploads that were made before items were linked to a shipment
      if (otherItemIds.length > 0) {
        const rawOtherItemDocs = await prisma.itemDocument.findMany({
          where: { 
            itemId: { in: otherItemIds }
          },
          include: {
            item: {
              select: { productCode: true }
            }
          },
          orderBy: { uploadedAt: 'desc' }
        });

        // Mark these as shared (they come from sibling items)
        otherItemDocuments = rawOtherItemDocs.map(doc => ({
          ...doc,
          isShipmentDocument: true, // Mark as shared since they're from sibling items
          fromItemId: doc.itemId,
          fromItemProductCode: doc.item?.productCode
        }));
      }
    }

    // Combine all documents:
    // 1. ShipmentDocument records (explicitly shared)
    // 2. ItemDocument from other items in the shipment (legacy shared)
    // 3. ItemDocument from this specific item
    const allDocuments = [...shipmentDocuments, ...otherItemDocuments, ...itemDocuments];

    // Deduplicate by ID (in case same doc appears multiple times)
    const seenIds = new Set();
    const uniqueDocuments = allDocuments.filter(doc => {
      if (seenIds.has(doc.id)) return false;
      seenIds.add(doc.id);
      return true;
    });

    // Build checklist from ALL documents (both item and shipment)
    const checklist = {};
    for (const [key, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
      const count = uniqueDocuments.filter(d => d.documentType === key).length;
      checklist[key] = {
        uploaded: count > 0,
        count,
        label
      };
    }

    // Calculate stats
    const uploadedRequired = REQUIRED_DOCUMENT_TYPES.filter(
      type => checklist[type].uploaded
    ).length;

    res.json({
      documents: uniqueDocuments,
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
    console.error("Get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents" });
  }
});

/**
 * Get signed download URL for document
 * GET /api/items/:itemId/documents/:documentId/download
 */
router.get("/items/:itemId/documents/:documentId/download", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    // Get the item with shipment info to check all possible document sources
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: true,
        shipment: {
          include: {
            items: { select: { id: true } }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check permissions
    if (req.user.role === 'AGENT' && item.order.sku !== req.user.name) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Try to find the document in different tables

    // 1. Check ItemDocument for this specific item
    let document = await prisma.itemDocument.findUnique({
      where: { id: documentId }
    });

    if (document && document.itemId === itemId) {
      const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);
      return res.json({ downloadUrl, fileName: document.fileName });
    }

    // 2. Check ShipmentDocument if item is in a shipment
    if (item.shipmentId) {
      const shipmentDoc = await prisma.shipmentDocument.findUnique({
        where: { id: documentId }
      });

      if (shipmentDoc && shipmentDoc.shipmentId === item.shipmentId) {
        const downloadUrl = await getSignedDownloadUrl(shipmentDoc.s3Key, shipmentDoc.fileName);
        return res.json({ downloadUrl, fileName: shipmentDoc.fileName });
      }

      // 3. Check ItemDocument from other items in the same shipment
      if (item.shipment && item.shipment.items) {
        const siblingItemIds = item.shipment.items.map(i => i.id);
        
        if (document && siblingItemIds.includes(document.itemId)) {
          const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);
          return res.json({ downloadUrl, fileName: document.fileName });
        }
      }
    }

    return res.status(404).json({ error: "Document not found" });
  } catch (error) {
    console.error("Download URL error:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/**
 * Delete document
 * DELETE /api/items/:itemId/documents/:documentId
 */
router.delete("/items/:itemId/documents/:documentId", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    // Get the item with shipment info
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: {
          include: { account: { select: { name: true } } }
        },
        shipment: {
          include: {
            items: { select: { id: true } }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Try to find the document in different tables

    // 1. Check ItemDocument for this specific item
    let document = await prisma.itemDocument.findUnique({
      where: { id: documentId }
    });

    if (document && document.itemId === itemId) {
      // Check permissions (only uploader, admin, or super admin can delete)
      const canDelete =
        document.uploadedBy === req.user.name ||
        req.user.role === 'SUPER_ADMIN' ||
        req.user.role === 'ADMIN';

      if (!canDelete) {
        return res.status(403).json({ error: "Not authorized to delete this document" });
      }

      await deleteFileFromS3(document.s3Key);
      
      await prisma.$transaction(async (tx) => {
        await tx.itemDocument.delete({ where: { id: documentId } });
        
        // Create audit log
        await tx.auditLog.create({
          data: {
            entityType: 'ItemDocument',
            entityId: documentId,
            parentEntityId: item.orderId,
            action: 'DOCUMENT_DELETED',
            metadata: JSON.stringify({
              fileName: document.fileName,
              fileSize: document.fileSize,
              documentType: document.documentType,
              documentTypeLabel: DOCUMENT_TYPE_LABELS[document.documentType],
              itemId,
              productCode: item.productCode,
              orderPO: item.order?.poNumber,
              customerName: item.order?.account?.name,
              originalUploader: document.uploadedBy
            }),
            performedByUserId: req.user.id,
            performedByName: req.user.name
          }
        });
      });
      
      return res.json({ message: "Document deleted successfully" });
    }

    // 2. Check ShipmentDocument if item is in a shipment
    if (item.shipmentId) {
      const shipmentDoc = await prisma.shipmentDocument.findUnique({
        where: { id: documentId }
      });

      if (shipmentDoc && shipmentDoc.shipmentId === item.shipmentId) {
        const canDelete =
          shipmentDoc.uploadedBy === req.user.name ||
          req.user.role === 'SUPER_ADMIN' ||
          req.user.role === 'ADMIN';

        if (!canDelete) {
          return res.status(403).json({ error: "Not authorized to delete this document" });
        }

        await deleteFileFromS3(shipmentDoc.s3Key);
        
        await prisma.$transaction(async (tx) => {
          await tx.shipmentDocument.delete({ where: { id: documentId } });
          
          // Create audit log
          await tx.auditLog.create({
            data: {
              entityType: 'ShipmentDocument',
              entityId: documentId,
              parentEntityId: item.shipmentId,
              action: 'DOCUMENT_DELETED',
              metadata: JSON.stringify({
                fileName: shipmentDoc.fileName,
                fileSize: shipmentDoc.fileSize,
                documentType: shipmentDoc.documentType,
                documentTypeLabel: DOCUMENT_TYPE_LABELS[shipmentDoc.documentType],
                shipmentId: item.shipmentId,
                containerNumber: item.shipment?.containerNumber,
                originalUploader: shipmentDoc.uploadedBy
              }),
              performedByUserId: req.user.id,
              performedByName: req.user.name
            }
          });
        });
        
        return res.json({ message: "Shipment document deleted successfully" });
      }

      // 3. Check ItemDocument from other items in the same shipment
      // Only allow deletion by admin/super_admin for sibling item docs
      if (document && item.shipment && item.shipment.items) {
        const siblingItemIds = item.shipment.items.map(i => i.id);
        
        if (siblingItemIds.includes(document.itemId)) {
          const canDelete =
            document.uploadedBy === req.user.name ||
            req.user.role === 'SUPER_ADMIN' ||
            req.user.role === 'ADMIN';

          if (!canDelete) {
            return res.status(403).json({ error: "Not authorized to delete this document" });
          }

          await deleteFileFromS3(document.s3Key);
          
          await prisma.$transaction(async (tx) => {
            await tx.itemDocument.delete({ where: { id: documentId } });
            
            // Create audit log
            await tx.auditLog.create({
              data: {
                entityType: 'ItemDocument',
                entityId: documentId,
                parentEntityId: item.orderId,
                action: 'DOCUMENT_DELETED',
                metadata: JSON.stringify({
                  fileName: document.fileName,
                  fileSize: document.fileSize,
                  documentType: document.documentType,
                  documentTypeLabel: DOCUMENT_TYPE_LABELS[document.documentType],
                  itemId: document.itemId,
                  deletedFromShipmentContext: true,
                  originalUploader: document.uploadedBy
                }),
                performedByUserId: req.user.id,
                performedByName: req.user.name
              }
            });
          });
          
          return res.json({ message: "Document deleted successfully" });
        }
      }
    }

    return res.status(404).json({ error: "Document not found" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// =============================
// MANUFACTURER DOCUMENT ENDPOINTS
// =============================

/**
 * Get documents for a manufacturer's assigned item
 * GET /api/manufacturer/item/:itemId/documents
 */
router.get("/manufacturer/item/:itemId/documents", authGuard, async (req, res) => {
  try {
    const { itemId } = req.params;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Use manufacturer from auth middleware
    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Verify item is assigned to this manufacturer
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId }
    });

    if (!item || item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Item not assigned to you" });
    }

    // Get documents
    const documents = await prisma.itemDocument.findMany({
      where: { itemId },
      orderBy: { uploadedAt: 'desc' }
    });

    // Build checklist (exclude OTHER for manufacturer view)
    const checklist = {};
    for (const type of REQUIRED_DOCUMENT_TYPES) {
      const count = documents.filter(d => d.documentType === type).length;
      checklist[type] = {
        uploaded: count > 0,
        count,
        label: DOCUMENT_TYPE_LABELS[type]
      };
    }

    const uploadedRequired = REQUIRED_DOCUMENT_TYPES.filter(
      type => checklist[type].uploaded
    ).length;

    res.json({
      documents: documents.filter(d => d.documentType !== 'OTHER'), // Hide OTHER from manufacturers
      checklist,
      stats: {
        complete: uploadedRequired === REQUIRED_DOCUMENT_TYPES.length,
        uploadedRequired,
        totalRequired: REQUIRED_DOCUMENT_TYPES.length
      }
    });
  } catch (error) {
    console.error("Manufacturer get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents" });
  }
});

/**
 * Upload document (manufacturer - 6 required types only, NO "Other")
 * POST /api/manufacturer/item/:itemId/documents
 */
router.post("/manufacturer/item/:itemId/documents", authGuard, upload.single('file'), async (req, res) => {
  try {
    const { itemId } = req.params;
    const { documentType } = req.body;
    const file = req.file;
    const username = req.user.name;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    // MANUFACTURERS CAN ONLY UPLOAD REQUIRED TYPES (NOT OTHER)
    if (!REQUIRED_DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({
        error: 'Invalid document type. Allowed types: ISF, Arrival Notice, Bill of Lading, Commercial Invoice, Packing List, Delivery Order'
      });
    }

    // Validate file
    const validationErrors = validateFile(file);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    // Use manufacturer from auth middleware
    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Verify item is assigned to this manufacturer
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { 
        order: {
          include: { account: { select: { name: true } } }
        }
      }
    });

    if (!item || item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Item not assigned to you" });
    }

    // Upload to S3
    const s3Data = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId: item.orderId,
      uploadedBy: username
    });

    // Create document record with audit log
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.itemDocument.create({
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

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'ItemDocument',
          entityId: doc.id,
          parentEntityId: item.orderId,
          action: 'DOCUMENT_UPLOADED',
          metadata: JSON.stringify({
            fileName: s3Data.fileName,
            fileSize: s3Data.fileSize,
            fileType: s3Data.fileType,
            documentType,
            documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType],
            itemId,
            productCode: item.productCode,
            orderPO: item.order?.poNumber,
            customerName: item.order?.account?.name,
            uploadedByRole: 'MANUFACTURER',
            manufacturerName: req.user.manufacturer?.name
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });

      return doc;
    });

    res.json({ message: "Document uploaded successfully", document });
  } catch (error) {
    console.error("Manufacturer upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload document" });
  }
});

/**
 * Get signed download URL for manufacturer
 * GET /api/manufacturer/item/:itemId/documents/:documentId/download
 */
router.get("/manufacturer/item/:itemId/documents/:documentId/download", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Use manufacturer from auth middleware
    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Get document and verify access
    const document = await prisma.itemDocument.findUnique({
      where: { id: documentId },
      include: { item: true }
    });

    if (!document || document.itemId !== itemId) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Pass original filename to preserve it in downloads (supports Chinese characters)
    const downloadUrl = await getSignedDownloadUrl(document.s3Key, document.fileName);

    res.json({ downloadUrl, fileName: document.fileName });
  } catch (error) {
    console.error("Manufacturer download URL error:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/**
 * Delete document (manufacturer can only delete own uploads)
 * DELETE /api/manufacturer/item/:itemId/documents/:documentId
 */
router.delete("/manufacturer/item/:itemId/documents/:documentId", authGuard, async (req, res) => {
  try {
    const { itemId, documentId } = req.params;

    if (req.user.role !== 'MANUFACTURER') {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Use manufacturer from auth middleware
    if (!req.user.manufacturer || !req.user.manufacturer.id) {
      return res.status(403).json({ error: "No manufacturer profile found" });
    }

    const manufacturerId = req.user.manufacturer.id;

    // Get document and verify access
    const document = await prisma.itemDocument.findUnique({
      where: { id: documentId },
      include: { 
        item: {
          include: {
            order: {
              include: { account: { select: { name: true } } }
            }
          }
        }
      }
    });

    if (!document || document.itemId !== itemId) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.item.manufacturerId !== manufacturerId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Manufacturer can only delete documents they uploaded
    if (document.uploadedBy !== req.user.name) {
      return res.status(403).json({ error: "Not authorized to delete this document" });
    }

    // Delete from S3
    await deleteFileFromS3(document.s3Key);

    // Delete from database with audit log
    await prisma.$transaction(async (tx) => {
      await tx.itemDocument.delete({
        where: { id: documentId }
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'ItemDocument',
          entityId: documentId,
          parentEntityId: document.item.orderId,
          action: 'DOCUMENT_DELETED',
          metadata: JSON.stringify({
            fileName: document.fileName,
            fileSize: document.fileSize,
            documentType: document.documentType,
            documentTypeLabel: DOCUMENT_TYPE_LABELS[document.documentType],
            itemId,
            productCode: document.item.productCode,
            orderPO: document.item.order?.poNumber,
            customerName: document.item.order?.account?.name,
            deletedByRole: 'MANUFACTURER',
            manufacturerName: req.user.manufacturer?.name
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
    });

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Manufacturer delete error:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
