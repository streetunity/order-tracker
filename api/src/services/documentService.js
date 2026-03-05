/**
 * documentService.js
 * 
 * Centralized document query logic for the Order Tracker.
 * 
 * Documents live in two tables:
 *   - ShipmentDocument: uploaded at the shipment level (shared across all items)
 *   - ItemDocument: uploaded to a specific item (shared with siblings via shipment)
 * 
 * Every endpoint that reads, downloads, or deletes documents must present a
 * unified view across both tables. This service is the single source of truth
 * for that logic — route files should never query these tables directly for
 * combined document views.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// =============================
// CONSTANTS
// =============================

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

export const REQUIRED_DOCUMENT_TYPES = [
  'ISF',
  'ARRIVAL_NOTICE',
  'BILL_OF_LADING',
  'COMMERCIAL_INVOICE',
  'PACKING_LIST',
  'DELIVERY_ORDER'
];

export const BROKER_DOCUMENT_TYPES = [
  'ISF_REPORT',
  'ENTRY_SUMMARY',
  'DELIVERY_ORDER',
  'BROKER_INVOICE',
  'OTHER'
];

export const DOCUMENT_TYPE_LABELS = {
  ISF: 'ISF (International Security Filing)',
  ARRIVAL_NOTICE: 'Arrival Notice',
  BILL_OF_LADING: 'Bill of Lading',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  PACKING_LIST: 'Packing List',
  DELIVERY_ORDER: 'Delivery Order',
  ISF_REPORT: 'ISF Report',
  ENTRY_SUMMARY: 'Entry Summary',
  BROKER_INVOICE: 'Broker Invoice',
  OTHER: 'Other'
};

// =============================
// QUERY HELPERS
// =============================

/**
 * Get all documents visible from a shipment context.
 * Returns ShipmentDocuments + ItemDocuments from all linked items,
 * deduplicated and annotated with source metadata.
 * 
 * @param {string} shipmentId
 * @returns {Promise<{ documents, checklist, stats, shipmentItems }>}
 */
export async function getDocumentsForShipment(shipmentId) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      items: {
        where: { archivedAt: null },
        select: { id: true, productCode: true }
      }
    }
  });

  if (!shipment) return null;

  // 1. ShipmentDocument records
  const shipmentDocs = await prisma.shipmentDocument.findMany({
    where: { shipmentId },
    orderBy: { uploadedAt: 'desc' }
  });

  const markedShipmentDocs = shipmentDocs.map(doc => ({
    ...doc,
    isShipmentDocument: true
  }));

  // 2. ItemDocument records from all linked items
  const itemIds = shipment.items.map(i => i.id);
  let markedItemDocs = [];

  if (itemIds.length > 0) {
    const itemDocs = await prisma.itemDocument.findMany({
      where: { itemId: { in: itemIds } },
      include: { item: { select: { productCode: true } } },
      orderBy: { uploadedAt: 'desc' }
    });

    markedItemDocs = itemDocs.map(doc => ({
      ...doc,
      isItemDocument: true,
      fromItemProductCode: doc.item?.productCode
    }));
  }

  // 3. Combine + deduplicate
  const documents = deduplicateDocuments([...markedShipmentDocs, ...markedItemDocs]);
  const { checklist, stats } = buildChecklist(documents);

  return { documents, checklist, stats, shipmentItems: shipment.items };
}

/**
 * Get all documents visible from an item context.
 * If the item belongs to a shipment, includes ShipmentDocuments and
 * ItemDocuments from sibling items. Otherwise, just the item's own docs.
 * 
 * @param {string} itemId
 * @returns {Promise<{ documents, checklist, stats, isSharedShipment, shipmentInfo }>}
 */
export async function getDocumentsForItem(itemId) {
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: {
      order: true,
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

  if (!item) return null;

  let documents = [];
  let isSharedShipment = false;
  let shipmentInfo = null;

  if (item.shipmentId && item.shipment) {
    isSharedShipment = true;

    const allItemIds = item.shipment.items.map(i => i.id);
    const otherItemIds = allItemIds.filter(id => id !== itemId);

    shipmentInfo = {
      id: item.shipment.id,
      containerNumber: item.shipment.containerNumber,
      billOfLading: item.shipment.billOfLading,
      itemCount: item.shipment.items.length,
      items: item.shipment.items,
      linkedItems: item.shipment.items.filter(i => i.id !== itemId).map(i => ({
        id: i.id,
        productCode: i.productCode
      }))
    };

    // ShipmentDocument records
    const shipmentDocs = await prisma.shipmentDocument.findMany({
      where: { shipmentId: item.shipmentId },
      orderBy: { uploadedAt: 'desc' }
    });

    const markedShipmentDocs = shipmentDocs.map(doc => ({
      ...doc,
      isShipmentDocument: true
    }));

    // ItemDocument records from ALL items in the shipment
    const itemDocs = await prisma.itemDocument.findMany({
      where: { itemId: { in: allItemIds } },
      include: { item: { select: { productCode: true } } },
      orderBy: { uploadedAt: 'desc' }
    });

    const markedItemDocs = itemDocs.map(doc => ({
      ...doc,
      isShipmentDocument: doc.itemId !== itemId, // shared if from another item
      fromItemProductCode: doc.item?.productCode
    }));

    documents = deduplicateDocuments([...markedShipmentDocs, ...markedItemDocs]);
  } else {
    // No shipment — just this item's own documents
    documents = await prisma.itemDocument.findMany({
      where: { itemId },
      orderBy: { uploadedAt: 'desc' }
    });
  }

  const { checklist, stats } = buildChecklist(documents);

  return { documents, checklist, stats, isSharedShipment, shipmentInfo };
}

/**
 * Resolve a document ID across both tables, verifying it belongs to
 * the given shipment or item context.
 * 
 * @param {string} documentId 
 * @param {{ shipmentId?: string, itemId?: string }} context
 *   Provide shipmentId for shipment-context lookups, itemId for item-context.
 * @returns {Promise<{ document, table: 'ShipmentDocument'|'ItemDocument' } | null>}
 */
export async function resolveDocumentById(documentId, { shipmentId, itemId } = {}) {
  // 1. Check ShipmentDocument
  const shipmentDoc = await prisma.shipmentDocument.findUnique({
    where: { id: documentId }
  });

  if (shipmentDoc) {
    // Verify access: must match the provided shipment, or the item's shipment
    if (shipmentId && shipmentDoc.shipmentId === shipmentId) {
      return { document: shipmentDoc, table: 'ShipmentDocument' };
    }
    if (itemId) {
      const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        select: { shipmentId: true }
      });
      if (item && item.shipmentId === shipmentDoc.shipmentId) {
        return { document: shipmentDoc, table: 'ShipmentDocument' };
      }
    }
  }

  // 2. Check ItemDocument
  const itemDoc = await prisma.itemDocument.findUnique({
    where: { id: documentId },
    include: {
      item: { select: { shipmentId: true, productCode: true } }
    }
  });

  if (itemDoc) {
    // Direct item match
    if (itemId && itemDoc.itemId === itemId) {
      return { document: itemDoc, table: 'ItemDocument' };
    }

    // Shipment context: doc belongs to an item in this shipment
    if (shipmentId && itemDoc.item?.shipmentId === shipmentId) {
      return { document: itemDoc, table: 'ItemDocument' };
    }

    // Item context: doc belongs to a sibling item in the same shipment
    if (itemId) {
      const requestingItem = await prisma.orderItem.findUnique({
        where: { id: itemId },
        select: { shipmentId: true }
      });
      if (requestingItem?.shipmentId && requestingItem.shipmentId === itemDoc.item?.shipmentId) {
        return { document: itemDoc, table: 'ItemDocument' };
      }
    }
  }

  return null;
}

/**
 * Delete a resolved document from S3 and the database.
 * 
 * @param {{ document, table }} resolved - Output from resolveDocumentById
 * @param {Function} deleteFileFromS3 - S3 deletion function
 * @param {object} [tx] - Optional Prisma transaction client
 */
export async function deleteResolvedDocument(resolved, deleteFileFromS3, tx) {
  const client = tx || prisma;
  await deleteFileFromS3(resolved.document.s3Key);

  if (resolved.table === 'ShipmentDocument') {
    await client.shipmentDocument.delete({ where: { id: resolved.document.id } });
  } else {
    await client.itemDocument.delete({ where: { id: resolved.document.id } });
  }
}

// =============================
// INTERNAL HELPERS
// =============================

/**
 * Build a document checklist and completion stats from a list of documents.
 */
export function buildChecklist(documents) {
  const checklist = {};
  for (const [key, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
    const count = documents.filter(d => d.documentType === key).length;
    checklist[key] = { uploaded: count > 0, count, label };
  }

  const uploadedRequired = REQUIRED_DOCUMENT_TYPES.filter(
    type => checklist[type]?.uploaded
  ).length;

  return {
    checklist,
    stats: {
      complete: uploadedRequired === REQUIRED_DOCUMENT_TYPES.length,
      uploadedRequired,
      totalRequired: REQUIRED_DOCUMENT_TYPES.length
    }
  };
}

/**
 * Deduplicate documents by ID, keeping first occurrence.
 */
function deduplicateDocuments(docs) {
  const seen = new Set();
  return docs.filter(doc => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });
}
