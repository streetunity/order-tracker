import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createAuditBackfillRouter() {
  const router = express.Router();

  // DIAGNOSTIC: Check what commission payouts exist in the database
  router.get('/diagnose-commission-data', async (req, res) => {
    try {
      // Get sample audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where: { entityType: 'CommissionPayout' },
        take: 5,
        orderBy: { createdAt: 'desc' }
      });

      // Get sample payouts
      const payouts = await prisma.commissionPayout.findMany({
        take: 10,
        include: {
          itemCommission: {
            include: {
              commission: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Check if any audit log entityIds match payout IDs
      const auditEntityIds = auditLogs.map(l => l.entityId);
      const payoutIds = payouts.map(p => p.id);

      const matchingIds = auditEntityIds.filter(id => payoutIds.includes(id));

      res.json({
        auditLogCount: await prisma.auditLog.count({ where: { entityType: 'CommissionPayout' } }),
        payoutCount: await prisma.commissionPayout.count(),
        sampleAuditLogs: auditLogs.map(l => ({
          id: l.id,
          entityId: l.entityId,
          action: l.action,
          createdAt: l.createdAt
        })),
        samplePayouts: payouts.map(p => ({
          id: p.id,
          status: p.status,
          amount: p.amount,
          stage: p.stage,
          salesPerson: p.itemCommission?.commission?.salesPersonName,
          paidAt: p.paidAt,
          createdAt: p.createdAt
        })),
        matchingIds,
        message: matchingIds.length > 0
          ? `Found ${matchingIds.length} matching IDs`
          : 'No audit log entityIds match any payout IDs - records may have been recreated'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // SMART BACKFILL: Try multiple strategies to enrich commission audit logs
  router.post('/backfill-commission-smart', async (req, res) => {
    try {
      console.log('🔄 Starting SMART commission audit metadata backfill...');

      // Get all commission audit logs that need enrichment
      const commissionLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'CommissionPayout',
          OR: [
            { metadata: null },
            { metadata: { not: { contains: 'salesPerson' } } }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`📋 Found ${commissionLogs.length} commission audit logs to process`);

      // Get ALL payouts with full data for matching
      // Note: ItemCommission.item is the relation to OrderItem (not orderItem)
      const allPayouts = await prisma.commissionPayout.findMany({
        include: {
          itemCommission: {
            include: {
              commission: {
                include: {
                  order: {
                    include: {
                      account: true
                    }
                  }
                }
              },
              item: true  // This is the OrderItem relation
            }
          }
        }
      });

      console.log(`📊 Loaded ${allPayouts.length} payouts for matching`);

      // Create lookup maps
      const payoutById = new Map(allPayouts.map(p => [p.id, p]));
      const payoutsByPaidAt = new Map();
      const payoutsByApprovedAt = new Map();

      allPayouts.forEach(p => {
        if (p.paidAt) {
          const key = p.paidAt.toISOString().substring(0, 16); // Match by minute
          if (!payoutsByPaidAt.has(key)) payoutsByPaidAt.set(key, []);
          payoutsByPaidAt.get(key).push(p);
        }
        if (p.approvedAt) {
          const key = p.approvedAt.toISOString().substring(0, 16);
          if (!payoutsByApprovedAt.has(key)) payoutsByApprovedAt.set(key, []);
          payoutsByApprovedAt.get(key).push(p);
        }
      });

      let updated = 0;
      let skipped = 0;
      let matchedById = 0;
      let matchedByTime = 0;
      let notFound = 0;

      for (const log of commissionLogs) {
        try {
          let existingMetadata = {};
          try {
            if (log.metadata) existingMetadata = JSON.parse(log.metadata);
          } catch {}

          // Skip if already has good metadata
          if (existingMetadata.salesPerson && existingMetadata.itemName && !existingMetadata._recordNotFound) {
            skipped++;
            continue;
          }

          let matchedPayout = null;

          // Strategy 1: Direct ID lookup
          matchedPayout = payoutById.get(log.entityId);
          if (matchedPayout) {
            matchedById++;
          }

          // Strategy 2: Match by timestamp (within same minute)
          if (!matchedPayout) {
            const logTime = log.createdAt.toISOString().substring(0, 16);

            if (log.action === 'PAID') {
              const candidates = payoutsByPaidAt.get(logTime) || [];
              if (candidates.length === 1) {
                matchedPayout = candidates[0];
                matchedByTime++;
              } else if (candidates.length > 1) {
                // Multiple matches - try to narrow down
                console.log(`  ⚠️ Multiple paid payouts at ${logTime}, skipping`);
              }
            } else if (log.action === 'APPROVED') {
              const candidates = payoutsByApprovedAt.get(logTime) || [];
              if (candidates.length === 1) {
                matchedPayout = candidates[0];
                matchedByTime++;
              }
            }
          }

          // Strategy 3: Try nearby minutes (±2 minutes)
          if (!matchedPayout) {
            const logDate = new Date(log.createdAt);
            for (let offset = -2; offset <= 2; offset++) {
              if (matchedPayout) break;
              const checkDate = new Date(logDate.getTime() + offset * 60000);
              const checkKey = checkDate.toISOString().substring(0, 16);

              const candidates = log.action === 'PAID'
                ? payoutsByPaidAt.get(checkKey) || []
                : payoutsByApprovedAt.get(checkKey) || [];

              if (candidates.length === 1) {
                matchedPayout = candidates[0];
                matchedByTime++;
                console.log(`  ✅ Matched by nearby time (offset ${offset} min)`);
              }
            }
          }

          if (matchedPayout) {
            const commission = matchedPayout.itemCommission?.commission;
            const order = commission?.order;
            // Note: it's 'item' not 'orderItem' per the Prisma schema
            const orderItem = matchedPayout.itemCommission?.item;

            const enrichedMetadata = {
              ...existingMetadata,
              salesPerson: commission?.salesPersonName || null,
              customerName: order?.account?.name || null,
              itemName: orderItem?.productCode || null,
              stage: matchedPayout.stage,
              amount: matchedPayout.amount,
              payoutId: matchedPayout.id,
              _matchedBy: payoutById.has(log.entityId) ? 'id' : 'timestamp'
            };

            // Remove old backfill markers
            delete enrichedMetadata._backfillAttempted;
            delete enrichedMetadata._recordNotFound;

            await prisma.auditLog.update({
              where: { id: log.id },
              data: { metadata: JSON.stringify(enrichedMetadata) }
            });
            updated++;
            console.log(`✅ Updated ${log.id}: ${enrichedMetadata.salesPerson} / ${enrichedMetadata.itemName} ($${enrichedMetadata.amount})`);
          } else {
            notFound++;
            // Mark as attempted but not found
            const enrichedMetadata = {
              ...existingMetadata,
              _backfillAttempted: true,
              _recordNotFound: true,
              _attemptedAt: new Date().toISOString()
            };
            await prisma.auditLog.update({
              where: { id: log.id },
              data: { metadata: JSON.stringify(enrichedMetadata) }
            });
          }
        } catch (logError) {
          console.error(`❌ Error processing log ${log.id}:`, logError.message);
        }
      }

      const summary = {
        total: commissionLogs.length,
        updated,
        skipped,
        matchedById,
        matchedByTime,
        notFound,
        message: `Smart backfill complete: ${updated} updated (${matchedById} by ID, ${matchedByTime} by timestamp), ${skipped} skipped, ${notFound} not found`
      };

      console.log('🏁 Smart backfill complete:', summary);
      res.json(summary);
    } catch (e) {
      console.error('Backfill error:', e);
      res.status(500).json({ error: 'Failed to backfill commission metadata', details: e.message });
    }
  });

  // ONE-TIME BACKFILL: Populate missing metadata on commission audit logs
  // POST /api/audit/backfill-commission-metadata
  router.post('/backfill-commission-metadata', async (req, res) => {
    try {
      console.log('🔄 Starting commission audit metadata backfill...');

      // Find all commission-related audit logs
      const commissionLogs = await prisma.auditLog.findMany({
        where: {
          entityType: {
            in: ['Commission', 'CommissionPayout', 'ItemCommission']
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`📋 Found ${commissionLogs.length} commission audit logs to process`);

      let updated = 0;
      let skipped = 0;
      let notFound = 0;
      const errorDetails = [];

      for (const log of commissionLogs) {
        try {
          // Parse existing metadata and changes
          let existingMetadata = {};
          let existingChanges = [];
          try {
            if (log.metadata) existingMetadata = JSON.parse(log.metadata);
          } catch {}
          try {
            if (log.changes) existingChanges = JSON.parse(log.changes);
          } catch {}

          // Check if already has enriched metadata (skip if complete)
          if (existingMetadata.salesPerson && existingMetadata.itemName && existingMetadata.stage !== undefined) {
            skipped++;
            continue;
          }

          // Try to find the related records
          let payout = null;
          let itemCommission = null;
          let orderItem = null;
          let order = null;
          let account = null;

          // entityId could be a CommissionPayout ID or ItemCommission ID
          if (log.entityType === 'CommissionPayout') {
            try {
              payout = await prisma.commissionPayout.findUnique({
                where: { id: log.entityId },
                include: {
                  itemCommission: {
                    include: {
                      item: {
                        include: {
                          order: {
                            include: {
                              account: true
                            }
                          }
                        }
                      },
                      commission: true
                    }
                  }
                }
              });

              if (payout) {
                itemCommission = payout.itemCommission;
                orderItem = itemCommission?.item;
                order = orderItem?.order;
                account = order?.account;
              }
            } catch (e) {
              console.log(`  ⚠️ Payout lookup failed for ${log.entityId}: ${e.message}`);
            }
          } else if (log.entityType === 'ItemCommission' || log.entityType === 'Commission') {
            try {
              itemCommission = await prisma.itemCommission.findUnique({
                where: { id: log.entityId },
                include: {
                  item: {
                    include: {
                      order: {
                        include: {
                          account: true
                        }
                      }
                    }
                  },
                  payouts: true,
                  commission: true
                }
              });

              if (itemCommission) {
                orderItem = itemCommission.item;
                order = orderItem?.order;
                account = order?.account;
                // Get the first payout for stage/amount info
                if (itemCommission.payouts && itemCommission.payouts.length > 0) {
                  payout = itemCommission.payouts[0];
                }
              }
            } catch (e) {
              console.log(`  ⚠️ ItemCommission lookup failed for ${log.entityId}: ${e.message}`);
            }
          }

          // Build enriched metadata starting with existing
          const enrichedMetadata = { ...existingMetadata };

          // Sales person (agent) - try multiple sources
          if (!enrichedMetadata.salesPerson) {
            if (itemCommission?.commission?.salesPersonName) {
              enrichedMetadata.salesPerson = itemCommission.commission.salesPersonName;
            } else if (order?.sku) {
              enrichedMetadata.salesPerson = order.sku;
            } else if (existingMetadata.agent) {
              enrichedMetadata.salesPerson = existingMetadata.agent;
            }
          }

          // Customer name
          if (!enrichedMetadata.customerName && account?.name) {
            enrichedMetadata.customerName = account.name;
          }

          // Item name
          if (!enrichedMetadata.itemName) {
            if (orderItem?.productCode) {
              enrichedMetadata.itemName = orderItem.productCode;
            } else if (existingMetadata.item) {
              enrichedMetadata.itemName = existingMetadata.item;
            }
          }

          // Stage (P1/P2)
          if (enrichedMetadata.stage === undefined) {
            if (payout?.stage) {
              enrichedMetadata.stage = payout.stage;
            } else if (existingMetadata.phase) {
              enrichedMetadata.stage = existingMetadata.phase;
            }
          }

          // Amount
          if (enrichedMetadata.amount === undefined) {
            if (payout?.amount !== undefined) {
              enrichedMetadata.amount = payout.amount;
            } else if (existingMetadata.payoutAmount !== undefined) {
              enrichedMetadata.amount = existingMetadata.payoutAmount;
            }
          }

          // If we couldn't find the record and have no useful data, mark it
          if (!itemCommission && !payout && !enrichedMetadata.salesPerson && !enrichedMetadata.itemName) {
            notFound++;
            // Still save a marker that we tried
            enrichedMetadata._backfillAttempted = true;
            enrichedMetadata._recordNotFound = true;
          }

          // Check if we actually added any new data
          const newMetadataStr = JSON.stringify(enrichedMetadata);
          const oldMetadataStr = log.metadata || '{}';

          if (newMetadataStr !== oldMetadataStr) {
            // Update the audit log
            await prisma.auditLog.update({
              where: { id: log.id },
              data: { metadata: newMetadataStr }
            });
            updated++;
            console.log(`✅ Updated log ${log.id}: ${log.action} - ${enrichedMetadata.salesPerson || 'unknown'} / ${enrichedMetadata.itemName || 'unknown item'}`);
          } else {
            skipped++;
          }
        } catch (logError) {
          console.error(`❌ Error processing log ${log.id}:`, logError.message);
          errorDetails.push({ logId: log.id, error: logError.message });
        }
      }

      const summary = {
        total: commissionLogs.length,
        updated,
        skipped,
        notFound,
        errors: errorDetails.length,
        errorDetails: errorDetails.slice(0, 10), // Show first 10 errors
        message: `Backfill complete: ${updated} updated, ${skipped} skipped, ${notFound} records not found, ${errorDetails.length} errors`
      };

      console.log('🏁 Backfill complete:', summary);
      res.json(summary);
    } catch (e) {
      console.error('Backfill error:', e);
      res.status(500).json({ error: 'Failed to backfill commission metadata', details: e.message });
    }
  });

  // SYNTHETIC BACKFILL: Create audit log entries for documents uploaded before logging was enabled
  // POST /api/audit/backfill-documents-synthetic
  router.post('/backfill-documents-synthetic', async (req, res) => {
    try {
      console.log('🔄 Starting SYNTHETIC document audit backfill...');
      console.log('📋 This will create audit log entries for documents that were never logged');

      // Document type labels for display
      const DOC_TYPE_LABELS = {
        'ISF': 'ISF (10+2)',
        'ARRIVAL_NOTICE': 'Arrival Notice',
        'BILL_OF_LADING': 'Bill of Lading',
        'COMMERCIAL_INVOICE': 'Commercial Invoice',
        'PACKING_LIST': 'Packing List',
        'DELIVERY_ORDER': 'Delivery Order',
        'ISF_REPORT': 'ISF Report',
        'ENTRY_SUMMARY': 'Entry Summary',
        'BROKER_INVOICE': 'Broker Invoice',
        'OTHER': 'Other'
      };

      let created = 0;
      let skipped = 0;
      let errors = 0;
      const details = {
        itemDocuments: { created: 0, skipped: 0 },
        orderDocuments: { created: 0, skipped: 0 },
        shipmentDocuments: { created: 0, skipped: 0 },
        customerDocuments: { created: 0, skipped: 0 }
      };

      // Get all existing document audit log entityIds to avoid duplicates
      const existingLogs = await prisma.auditLog.findMany({
        where: {
          entityType: {
            in: ['Document', 'ItemDocument', 'ShipmentDocument', 'CustomerDocument', 'OrderDocument']
          }
        },
        select: { entityId: true, entityType: true }
      });
      const existingEntityIds = new Set(existingLogs.map(l => `${l.entityType}:${l.entityId}`));
      console.log(`📊 Found ${existingLogs.length} existing document audit logs`);

      // 1. Process ItemDocuments
      console.log('📄 Processing ItemDocuments...');
      const itemDocs = await prisma.itemDocument.findMany({
        include: {
          item: {
            include: {
              order: {
                include: {
                  account: true
                }
              }
            }
          }
        }
      });

      for (const doc of itemDocs) {
        try {
          const key = `ItemDocument:${doc.id}`;
          if (existingEntityIds.has(key)) {
            skipped++;
            details.itemDocuments.skipped++;
            continue;
          }

          const metadata = {
            fileName: doc.fileName,
            documentType: doc.documentType,
            documentTypeLabel: DOC_TYPE_LABELS[doc.documentType] || doc.documentType,
            fileSize: doc.fileSize,
            fileType: doc.fileType,
            productCode: doc.item?.productCode,
            itemId: doc.item?.id,
            orderId: doc.item?.order?.id,
            orderPO: doc.item?.order?.poNumber,
            customerName: doc.item?.order?.account?.name,
            _retroactiveBackfill: true,
            _backfilledAt: new Date().toISOString()
          };

          await prisma.auditLog.create({
            data: {
              entityType: 'ItemDocument',
              entityId: doc.id,
              parentEntityId: doc.item?.orderId || null,
              action: 'DOCUMENT_UPLOADED',
              changes: null,
              metadata: JSON.stringify(metadata),
              performedByName: doc.uploadedBy || 'System',
              createdAt: doc.uploadedAt
            }
          });

          created++;
          details.itemDocuments.created++;
          console.log(`  ✅ Created log for ItemDocument: ${doc.fileName}`);
        } catch (e) {
          console.error(`  ❌ Error processing ItemDocument ${doc.id}:`, e.message);
          errors++;
        }
      }

      // 2. Process OrderDocuments
      console.log('📄 Processing OrderDocuments...');
      const orderDocs = await prisma.orderDocument.findMany({
        include: {
          order: {
            include: {
              account: true
            }
          }
        }
      });

      for (const doc of orderDocs) {
        try {
          const key = `OrderDocument:${doc.id}`;
          if (existingEntityIds.has(key)) {
            skipped++;
            details.orderDocuments.skipped++;
            continue;
          }

          const metadata = {
            fileName: doc.fileName,
            documentTypeLabel: 'Order Document',
            fileSize: doc.fileSize,
            fileType: doc.fileType,
            orderId: doc.order?.id,
            orderPO: doc.order?.poNumber,
            customerName: doc.order?.account?.name,
            _retroactiveBackfill: true,
            _backfilledAt: new Date().toISOString()
          };

          await prisma.auditLog.create({
            data: {
              entityType: 'OrderDocument',
              entityId: doc.id,
              parentEntityId: doc.orderId,
              action: 'DOCUMENT_UPLOADED',
              changes: null,
              metadata: JSON.stringify(metadata),
              performedByName: doc.uploadedBy || 'System',
              createdAt: doc.uploadedAt
            }
          });

          created++;
          details.orderDocuments.created++;
          console.log(`  ✅ Created log for OrderDocument: ${doc.fileName}`);
        } catch (e) {
          console.error(`  ❌ Error processing OrderDocument ${doc.id}:`, e.message);
          errors++;
        }
      }

      // 3. Process ShipmentDocuments
      console.log('📄 Processing ShipmentDocuments...');
      const shipmentDocs = await prisma.shipmentDocument.findMany({
        include: {
          shipment: {
            include: {
              items: {
                take: 1,
                include: {
                  order: {
                    include: {
                      account: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      for (const doc of shipmentDocs) {
        try {
          const key = `ShipmentDocument:${doc.id}`;
          if (existingEntityIds.has(key)) {
            skipped++;
            details.shipmentDocuments.skipped++;
            continue;
          }

          const firstItem = doc.shipment?.items?.[0];
          const metadata = {
            fileName: doc.fileName,
            documentType: doc.documentType,
            documentTypeLabel: DOC_TYPE_LABELS[doc.documentType] || doc.documentType,
            fileSize: doc.fileSize,
            fileType: doc.fileType,
            shipmentId: doc.shipment?.id,
            containerNumber: doc.shipment?.containerNumber,
            billOfLading: doc.shipment?.billOfLading,
            productCode: firstItem?.productCode,
            orderId: firstItem?.order?.id,
            orderPO: firstItem?.order?.poNumber,
            customerName: firstItem?.order?.account?.name,
            _retroactiveBackfill: true,
            _backfilledAt: new Date().toISOString()
          };

          await prisma.auditLog.create({
            data: {
              entityType: 'ShipmentDocument',
              entityId: doc.id,
              parentEntityId: doc.shipmentId,
              action: 'DOCUMENT_UPLOADED',
              changes: null,
              metadata: JSON.stringify(metadata),
              performedByName: doc.uploadedBy || 'System',
              createdAt: doc.uploadedAt
            }
          });

          created++;
          details.shipmentDocuments.created++;
          console.log(`  ✅ Created log for ShipmentDocument: ${doc.fileName}`);
        } catch (e) {
          console.error(`  ❌ Error processing ShipmentDocument ${doc.id}:`, e.message);
          errors++;
        }
      }

      // 4. Process CustomerDocuments
      console.log('📄 Processing CustomerDocuments...');
      const customerDocs = await prisma.customerDocument.findMany({
        include: {
          order: {
            include: {
              account: true
            }
          },
          uploadedBy: {
            select: { name: true, email: true }
          }
        }
      });

      for (const doc of customerDocs) {
        try {
          const key = `CustomerDocument:${doc.id}`;
          if (existingEntityIds.has(key)) {
            skipped++;
            details.customerDocuments.skipped++;
            continue;
          }

          const metadata = {
            fileName: doc.fileName,
            documentTypeLabel: 'Customer Document',
            fileSize: Number(doc.fileSize), // BigInt to Number
            fileType: doc.mimeType,
            description: doc.description,
            orderId: doc.order?.id,
            orderPO: doc.order?.poNumber,
            customerName: doc.order?.account?.name,
            uploadedByName: doc.uploadedBy?.name || doc.uploadedBy?.email,
            _retroactiveBackfill: true,
            _backfilledAt: new Date().toISOString()
          };

          await prisma.auditLog.create({
            data: {
              entityType: 'CustomerDocument',
              entityId: doc.id,
              parentEntityId: doc.orderId,
              action: 'DOCUMENT_UPLOADED',
              changes: null,
              metadata: JSON.stringify(metadata),
              performedByUserId: doc.uploadedById,
              performedByName: doc.uploadedBy?.name || doc.uploadedBy?.email || 'System',
              createdAt: doc.uploadedAt
            }
          });

          created++;
          details.customerDocuments.created++;
          console.log(`  ✅ Created log for CustomerDocument: ${doc.fileName}`);
        } catch (e) {
          console.error(`  ❌ Error processing CustomerDocument ${doc.id}:`, e.message);
          errors++;
        }
      }

      const summary = {
        totalDocuments: itemDocs.length + orderDocs.length + shipmentDocs.length + customerDocs.length,
        created,
        skipped,
        errors,
        details,
        message: `Synthetic backfill complete: ${created} audit logs created, ${skipped} skipped (already logged), ${errors} errors`
      };

      console.log('🏁 Synthetic document backfill complete:', summary);
      res.json(summary);
    } catch (e) {
      console.error('Synthetic backfill error:', e);
      res.status(500).json({ error: 'Failed to create synthetic document audit logs', details: e.message });
    }
  });

  // ONE-TIME BACKFILL: Populate missing metadata on document audit logs
  // POST /api/audit/backfill-document-metadata
  router.post('/backfill-document-metadata', async (req, res) => {
    try {
      console.log('🔄 Starting document audit metadata backfill...');

      // Find all document-related audit logs
      const documentLogs = await prisma.auditLog.findMany({
        where: {
          entityType: {
            in: ['Document', 'ItemDocument', 'ShipmentDocument', 'CustomerDocument', 'OrderDocument']
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`📋 Found ${documentLogs.length} document audit logs to process`);

      // Document type labels for display
      const DOC_TYPE_LABELS = {
        'ISF': 'ISF (10+2)',
        'ARRIVAL_NOTICE': 'Arrival Notice',
        'BILL_OF_LADING': 'Bill of Lading',
        'COMMERCIAL_INVOICE': 'Commercial Invoice',
        'PACKING_LIST': 'Packing List',
        'DELIVERY_ORDER': 'Delivery Order',
        'ISF_REPORT': 'ISF Report',
        'ENTRY_SUMMARY': 'Entry Summary',
        'BROKER_INVOICE': 'Broker Invoice',
        'OTHER': 'Other'
      };

      let updated = 0;
      let skipped = 0;
      let notFound = 0;
      let errors = 0;

      for (const log of documentLogs) {
        try {
          // Parse existing metadata
          let existingMetadata = {};
          try {
            if (log.metadata) existingMetadata = JSON.parse(log.metadata);
          } catch {}

          // Check if already has enriched metadata (skip if complete)
          if (existingMetadata.fileName && existingMetadata.documentTypeLabel) {
            skipped++;
            continue;
          }

          // Build enriched metadata starting with existing
          const enrichedMetadata = { ...existingMetadata };
          let foundDocument = false;

          // Try to find the document based on entity type
          if (log.entityType === 'ItemDocument') {
            try {
              const doc = await prisma.itemDocument.findUnique({
                where: { id: log.entityId },
                include: {
                  item: {
                    include: {
                      order: {
                        include: {
                          account: true
                        }
                      }
                    }
                  }
                }
              });

              if (doc) {
                foundDocument = true;
                enrichedMetadata.fileName = doc.fileName;
                enrichedMetadata.documentType = doc.documentType;
                enrichedMetadata.documentTypeLabel = DOC_TYPE_LABELS[doc.documentType] || doc.documentType;
                enrichedMetadata.fileSize = doc.fileSize;
                enrichedMetadata.fileType = doc.fileType;
                if (doc.item) {
                  enrichedMetadata.productCode = doc.item.productCode;
                  enrichedMetadata.itemId = doc.item.id;
                  if (doc.item.order) {
                    enrichedMetadata.orderId = doc.item.order.id;
                    enrichedMetadata.orderPO = doc.item.order.poNumber;
                    if (doc.item.order.account) {
                      enrichedMetadata.customerName = doc.item.order.account.name;
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`  ⚠️ ItemDocument lookup failed for ${log.entityId}: ${e.message}`);
            }
          } else if (log.entityType === 'OrderDocument') {
            try {
              const doc = await prisma.orderDocument.findUnique({
                where: { id: log.entityId },
                include: {
                  order: {
                    include: {
                      account: true
                    }
                  }
                }
              });

              if (doc) {
                foundDocument = true;
                enrichedMetadata.fileName = doc.fileName;
                enrichedMetadata.fileSize = doc.fileSize;
                enrichedMetadata.fileType = doc.fileType;
                enrichedMetadata.documentTypeLabel = 'Order Document';
                if (doc.order) {
                  enrichedMetadata.orderId = doc.order.id;
                  enrichedMetadata.orderPO = doc.order.poNumber;
                  if (doc.order.account) {
                    enrichedMetadata.customerName = doc.order.account.name;
                  }
                }
              }
            } catch (e) {
              console.log(`  ⚠️ OrderDocument lookup failed for ${log.entityId}: ${e.message}`);
            }
          } else if (log.entityType === 'ShipmentDocument') {
            try {
              const doc = await prisma.shipmentDocument.findUnique({
                where: { id: log.entityId },
                include: {
                  shipment: {
                    include: {
                      items: {
                        take: 1,
                        include: {
                          order: {
                            include: {
                              account: true
                            }
                          }
                        }
                      }
                    }
                  }
                }
              });

              if (doc) {
                foundDocument = true;
                enrichedMetadata.fileName = doc.fileName;
                enrichedMetadata.documentType = doc.documentType;
                enrichedMetadata.documentTypeLabel = DOC_TYPE_LABELS[doc.documentType] || doc.documentType;
                enrichedMetadata.fileSize = doc.fileSize;
                enrichedMetadata.fileType = doc.fileType;
                if (doc.shipment) {
                  enrichedMetadata.shipmentId = doc.shipment.id;
                  enrichedMetadata.containerNumber = doc.shipment.containerNumber;
                  enrichedMetadata.billOfLading = doc.shipment.billOfLading;
                  // Get order info from first item in shipment
                  if (doc.shipment.items && doc.shipment.items.length > 0) {
                    const firstItem = doc.shipment.items[0];
                    enrichedMetadata.productCode = firstItem.productCode;
                    if (firstItem.order) {
                      enrichedMetadata.orderId = firstItem.order.id;
                      enrichedMetadata.orderPO = firstItem.order.poNumber;
                      if (firstItem.order.account) {
                        enrichedMetadata.customerName = firstItem.order.account.name;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`  ⚠️ ShipmentDocument lookup failed for ${log.entityId}: ${e.message}`);
            }
          } else if (log.entityType === 'CustomerDocument') {
            try {
              const doc = await prisma.customerDocument.findUnique({
                where: { id: log.entityId },
                include: {
                  order: {
                    include: {
                      account: true
                    }
                  },
                  uploadedBy: {
                    select: { name: true, email: true }
                  }
                }
              });

              if (doc) {
                foundDocument = true;
                enrichedMetadata.fileName = doc.fileName;
                enrichedMetadata.fileSize = Number(doc.fileSize); // BigInt to Number
                enrichedMetadata.fileType = doc.mimeType;
                enrichedMetadata.documentTypeLabel = 'Customer Document';
                enrichedMetadata.description = doc.description;
                if (doc.order) {
                  enrichedMetadata.orderId = doc.order.id;
                  enrichedMetadata.orderPO = doc.order.poNumber;
                  if (doc.order.account) {
                    enrichedMetadata.customerName = doc.order.account.name;
                  }
                }
                if (doc.uploadedBy) {
                  enrichedMetadata.uploadedByName = doc.uploadedBy.name || doc.uploadedBy.email;
                }
              }
            } catch (e) {
              console.log(`  ⚠️ CustomerDocument lookup failed for ${log.entityId}: ${e.message}`);
            }
          }

          // If we couldn't find the document, mark it
          if (!foundDocument) {
            notFound++;
            enrichedMetadata._backfillAttempted = true;
            enrichedMetadata._recordNotFound = true;
          }

          // Check if we actually added any new data
          const newMetadataStr = JSON.stringify(enrichedMetadata);
          const oldMetadataStr = log.metadata || '{}';

          if (newMetadataStr !== oldMetadataStr) {
            // Update the audit log
            await prisma.auditLog.update({
              where: { id: log.id },
              data: { metadata: newMetadataStr }
            });
            updated++;
            console.log(`✅ Updated log ${log.id}: ${log.action} - ${enrichedMetadata.fileName || 'unknown'} (${enrichedMetadata.documentTypeLabel || 'unknown type'})`);
          } else {
            skipped++;
          }
        } catch (logError) {
          console.error(`❌ Error processing log ${log.id}:`, logError.message);
          errors++;
        }
      }

      const summary = {
        total: documentLogs.length,
        updated,
        skipped,
        notFound,
        errors,
        message: `Backfill complete: ${updated} updated, ${skipped} skipped, ${notFound} records not found, ${errors} errors`
      };

      console.log('🏁 Document backfill complete:', summary);
      res.json(summary);
    } catch (e) {
      console.error('Document backfill error:', e);
      res.status(500).json({ error: 'Failed to backfill document metadata', details: e.message });
    }
  });

  // ONE-TIME BACKFILL: Populate missing metadata on user audit logs
  // POST /api/audit/backfill-user-metadata
  router.post('/backfill-user-metadata', async (req, res) => {
    try {
      console.log('🔄 Starting user audit metadata backfill...');

      // Find all user-related audit logs
      const userLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'User'
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`📋 Found ${userLogs.length} user audit logs to process`);

      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const log of userLogs) {
        try {
          // Parse existing metadata
          let existingMetadata = {};
          try {
            if (log.metadata) existingMetadata = JSON.parse(log.metadata);
          } catch {}

          // Check if already has enriched metadata (skip if complete)
          if (existingMetadata.userName && existingMetadata.userRole) {
            skipped++;
            continue;
          }

          // Try to find the user record
          const user = await prisma.user.findUnique({
            where: { id: log.entityId },
            select: { id: true, name: true, email: true, role: true }
          });

          // Build enriched metadata
          const enrichedMetadata = { ...existingMetadata };

          if (user) {
            if (!enrichedMetadata.userName) {
              enrichedMetadata.userName = user.name || user.email;
            }
            if (!enrichedMetadata.userEmail) {
              enrichedMetadata.userEmail = user.email;
            }
            if (!enrichedMetadata.userRole) {
              enrichedMetadata.userRole = user.role;
            }
          }

          // Also try to extract from changes if available
          if (!enrichedMetadata.userName || !enrichedMetadata.userRole) {
            let changes = [];
            try {
              if (log.changes) changes = JSON.parse(log.changes);
            } catch {}

            for (const change of changes) {
              if (change.field === 'name' && !enrichedMetadata.userName) {
                enrichedMetadata.userName = change.newValue || change.oldValue;
              }
              if (change.field === 'role' && !enrichedMetadata.userRole) {
                enrichedMetadata.userRole = change.newValue || change.oldValue;
              }
              if (change.field === 'email' && !enrichedMetadata.userEmail) {
                enrichedMetadata.userEmail = change.newValue || change.oldValue;
              }
            }
          }

          // Check if we actually added any new data
          const newMetadataStr = JSON.stringify(enrichedMetadata);
          const oldMetadataStr = log.metadata || '{}';

          if (newMetadataStr !== oldMetadataStr && Object.keys(enrichedMetadata).length > Object.keys(existingMetadata).length) {
            // Update the audit log
            await prisma.auditLog.update({
              where: { id: log.id },
              data: { metadata: newMetadataStr }
            });
            updated++;
            console.log(`✅ Updated log ${log.id}: ${log.action} - added metadata for ${enrichedMetadata.userName || 'unknown user'}`);
          } else {
            skipped++;
          }
        } catch (logError) {
          console.error(`❌ Error processing log ${log.id}:`, logError.message);
          errors++;
        }
      }

      const summary = {
        total: userLogs.length,
        updated,
        skipped,
        errors,
        message: `Backfill complete: ${updated} updated, ${skipped} skipped, ${errors} errors`
      };

      console.log('🏁 Backfill complete:', summary);
      res.json(summary);
    } catch (e) {
      console.error('Backfill error:', e);
      res.status(500).json({ error: 'Failed to backfill user metadata', details: e.message });
    }
  });

  return router;
}

export default createAuditBackfillRouter;
