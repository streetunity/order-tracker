/**
 * SQLite → Postgres data migration script for the Order Tracker.
 *
 * Usage:
 *   node migrate.js \
 *     --source="file:/path/to/source.db" \
 *     --target="postgresql://user:pass@localhost:5432/dbname?schema=public"
 *
 * Behavior:
 *   - Reads from SQLite via better-sqlite3 (read-only, source cannot be corrupted).
 *   - Writes to Postgres via Prisma client (uses target DATABASE_URL).
 *   - Migrates tables in foreign-key dependency order.
 *   - Pages through large tables in batches of BATCH_SIZE.
 *   - Coerces SQLite 0/1 booleans to native booleans, ISO strings to Date.
 *   - Verifies row counts after each model and reports any mismatch.
 *
 * See docs/POSTGRES_MIGRATION.md for the full runbook and rollback procedure.
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    })
);

if (!args.source || !args.target) {
  console.error('Usage: node migrate.js --source="file:/path/to/db" --target="postgresql://..."');
  process.exit(1);
}

const sqlitePath = args.source.replace(/^file:/, '');
process.env.DATABASE_URL = args.target;

const sqlite = new Database(sqlitePath, { readonly: true });
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Migration order — dependency-sorted so FK constraints never fire
// ---------------------------------------------------------------------------
//
// Models that other models depend on come first. The order is determined by
// reading schema.prisma and topo-sorting the foreign-key graph by hand.
// If the schema gains new models or new relations, update this list.

const MIGRATION_ORDER = [
  // ---- Layer 0: no FK dependencies (or only on themselves) ----
  { model: 'User', table: 'User', dateFields: ['lastLogin', 'createdAt', 'updatedAt'], boolFields: ['isActive', 'isEmployee', 'showInSalesRepDropdown'] },
  { model: 'Account', table: 'Account', dateFields: ['createdAt', 'updatedAt'], boolFields: ['emailNotifications'] },
  { model: 'StageThreshold', table: 'StageThreshold', dateFields: ['updatedAt'] },
  { model: 'SystemSetting', table: 'SystemSetting', dateFields: ['updatedAt'] },
  { model: 'CompanySettings', table: 'CompanySettings', dateFields: ['createdAt', 'updatedAt'] },
  { model: 'InvoicingSettings', table: 'InvoicingSettings', dateFields: ['createdAt', 'updatedAt'] },
  { model: 'CommissionSettings', table: 'CommissionSettings', dateFields: ['createdAt', 'updatedAt'], boolFields: ['enabled'] },
  { model: 'CommissionStageSetting', table: 'CommissionStageSetting', dateFields: ['createdAt', 'updatedAt'], boolFields: ['isActive'] },
  { model: 'CommissionRate', table: 'CommissionRate', dateFields: ['createdAt', 'updatedAt'] },
  { model: 'EmailTemplate', table: 'EmailTemplate', dateFields: ['createdAt', 'updatedAt'] },
  { model: 'EmailStageConfig', table: 'EmailStageConfig', dateFields: ['createdAt', 'updatedAt'], boolFields: ['notify'] },
  { model: 'ZapierWebhook', table: 'ZapierWebhook', dateFields: ['createdAt', 'updatedAt', 'lastReceivedAt'], boolFields: ['isActive'] },
  { model: 'Product', table: 'Product', dateFields: ['createdAt', 'updatedAt'], boolFields: ['taxable', 'isActive'] },
  { model: 'Bundle', table: 'Bundle', dateFields: ['createdAt', 'updatedAt'], boolFields: ['isActive'] },
  { model: 'EstimateTemplate', table: 'EstimateTemplate', dateFields: ['createdAt', 'updatedAt'], boolFields: ['isActive'] },
  { model: 'Signature', table: 'Signature', dateFields: ['signedAt', 'createdAt'] },
  { model: 'Shipment', table: 'Shipment', dateFields: ['etaDate', 'customsFiledDate', 'customsClearedDate', 'archivedAt', 'createdAt', 'updatedAt'] },

  // ---- Layer 1: depends on User / Account / etc. ----
  { model: 'Manufacturer', table: 'Manufacturer', dateFields: ['createdAt', 'updatedAt'], boolFields: ['isActive'] },
  { model: 'UserEmailSettings', table: 'UserEmailSettings', dateFields: ['createdAt', 'updatedAt'] },
  { model: 'GlobalCustomerDocument', table: 'global_customer_documents', dateFields: ['uploadedAt', 'createdAt', 'updatedAt'], boolFields: ['isActive', 'isComplete'], bigIntFields: ['fileSize'] },
  { model: 'BundleItem', table: 'BundleItem' },
  { model: 'BundleAttachment', table: 'BundleAttachment', dateFields: ['createdAt'], boolFields: ['includeInEstimate'] },
  { model: 'ProductAttachment', table: 'ProductAttachment', dateFields: ['createdAt'], boolFields: ['includeInEstimate', 'includeInInvoice', 'isPrimary'] },
  { model: 'EstimateTemplateItem', table: 'EstimateTemplateItem' },

  // ---- Layer 2: Customer + Lead + Order ----
  { model: 'Lead', table: 'Lead', dateFields: ['convertedAt', 'followUpDate', 'lastContactAt', 'deletedAt', 'createdAt', 'updatedAt'], boolFields: ['isDeleted'] },
  { model: 'Customer', table: 'Customer', dateFields: ['portalTokenExpiry', 'deletedAt', 'createdAt', 'updatedAt'], boolFields: ['shippingSameAsBilling', 'sameAsBilling', 'taxExempt', 'portalEnabled', 'isDeleted'] },
  { model: 'Order', table: 'Order', dateFields: ['orderDate', 'createdAt', 'updatedAt', 'etaDate', 'onsiteInstallationDate', 'lockedAt', 'archivedAt'], boolFields: ['isLocked', 'isArchived'] },

  // ---- Layer 3: depends on Customer ----
  { model: 'CustomerContact', table: 'CustomerContact', dateFields: ['createdAt', 'updatedAt'], boolFields: ['isPrimary'] },
  { model: 'RecurringInvoice', table: 'RecurringInvoice', dateFields: ['startDate', 'endDate', 'nextInvoiceDate', 'lastGeneratedAt', 'createdAt', 'updatedAt'] },
  { model: 'Estimate', table: 'Estimate', dateFields: ['estimateDate', 'expirationDate', 'expiryDate', 'outcomeDate', 'pdfGeneratedAt', 'lastSentAt', 'lastViewedAt', 'approvedAt', 'convertedAt', 'followUpDate', 'deletedAt', 'createdAt', 'updatedAt'], boolFields: ['requiresApproval', 'isTemplate', 'isDeleted'] },

  // ---- Layer 4: depends on Estimate / Customer / Order ----
  { model: 'EstimateItem', table: 'EstimateItem', dateFields: ['createdAt', 'updatedAt'], boolFields: ['taxable'] },
  { model: 'Invoice', table: 'Invoice', dateFields: ['invoiceDate', 'dueDate', 'pdfGeneratedAt', 'lastSentAt', 'lastViewedAt', 'convertedAt', 'deletedAt', 'createdAt', 'updatedAt'], boolFields: ['depositPaid', 'convertedToOrder', 'isDeleted'] },

  // ---- Layer 5: depends on Invoice ----
  { model: 'InvoiceItem', table: 'InvoiceItem', dateFields: ['createdAt', 'updatedAt'], boolFields: ['taxable'] },
  { model: 'InvoicePaymentSchedule', table: 'InvoicePaymentSchedule', dateFields: ['dueDate', 'paidAt', 'createdAt'], boolFields: ['triggersOrder'] },
  { model: 'Payment', table: 'Payment', dateFields: ['paymentDate', 'refundedAt', 'createdAt', 'updatedAt'] },
  { model: 'CreditMemo', table: 'CreditMemo', dateFields: ['issueDate', 'appliedDate', 'deletedAt', 'createdAt', 'updatedAt'], boolFields: ['isDeleted'] },
  { model: 'RecurringInvoiceItem', table: 'RecurringInvoiceItem' },

  // ---- Layer 6: depends on Order ----
  { model: 'OrderItem', table: 'OrderItem', dateFields: ['orderedAt', 'measuredAt', 'customsFiledDate', 'brokerNotifiedDate', 'brokerLastViewedDate', 'customsClearedDate', 'archivedAt', 'createdAt', 'updatedAt'], boolFields: ['isOrdered', 'hasExtendedShipping'] },
  { model: 'OrderStatusEvent', table: 'OrderStatusEvent', dateFields: ['createdAt'] },
  { model: 'OrderDocument', table: 'order_documents', dateFields: ['uploadedAt'] },
  { model: 'CustomerDocument', table: 'customer_documents', dateFields: ['uploadedAt', 'expiresAt'], boolFields: ['isComplete'], bigIntFields: ['fileSize'] },
  { model: 'ShipmentDocument', table: 'shipment_documents', dateFields: ['uploadedAt'] },
  { model: 'ShipmentActivityLog', table: 'shipment_activity_logs', dateFields: ['createdAt'] },
  { model: 'CalendarEvent', table: 'CalendarEvent', dateFields: ['startDate', 'endDate', 'createdAt', 'updatedAt'], boolFields: ['allDay', 'customerNotified'] },

  // ---- Layer 7: depends on OrderItem ----
  { model: 'OrderItemStatusEvent', table: 'OrderItemStatusEvent', dateFields: ['createdAt'] },
  { model: 'MeasurementAuditLog', table: 'MeasurementAuditLog', dateFields: ['performedAt'] },
  { model: 'BrokerActivityLog', table: 'BrokerActivityLog', dateFields: ['createdAt'] },
  { model: 'ItemDocument', table: 'item_documents', dateFields: ['uploadedAt'] },

  // ---- Layer 8: commission models depend on Order, OrderItem ----
  { model: 'Commission', table: 'Commission', dateFields: ['calculatedAt', 'lastReviewedAt', 'createdAt', 'updatedAt'], boolFields: ['isFlagged'] },
  { model: 'ItemCommission', table: 'ItemCommission', dateFields: ['createdAt', 'updatedAt'] },
  { model: 'CommissionPayout', table: 'CommissionPayout', dateFields: ['triggeredAt', 'approvedAt', 'paidAt', 'rejectedAt', 'createdAt', 'updatedAt'] },

  // ---- Layer 9: cross-cutting (depend on many) ----
  { model: 'AuditLog', table: 'AuditLog', dateFields: ['createdAt'] },
  { model: 'Notification', table: 'Notification', dateFields: ['readAt', 'dismissedAt', 'createdAt', 'expiresAt'], boolFields: ['isRead', 'isDismissed'] },
  { model: 'EmailLog', table: 'EmailLog', dateFields: ['sentAt', 'deliveredAt', 'openedAt', 'bouncedAt'] },
  { model: 'Comment', table: 'Comment', dateFields: ['createdAt', 'updatedAt'] },
  { model: 'CustomerActivityLog', table: 'CustomerActivityLog', dateFields: ['createdAt'] },
  { model: 'Reminder', table: 'Reminder', dateFields: ['dueDate', 'completedAt', 'createdAt', 'updatedAt'] }
];

// ---------------------------------------------------------------------------
// Row coercion helpers (SQLite stores booleans as 0/1, dates as ISO strings)
// ---------------------------------------------------------------------------

function coerceRow(row, { dateFields = [], boolFields = [], bigIntFields = [] }) {
  const out = { ...row };

  for (const f of dateFields) {
    if (out[f] !== null && out[f] !== undefined) {
      out[f] = new Date(out[f]);
    }
  }

  for (const f of boolFields) {
    if (out[f] !== null && out[f] !== undefined) {
      out[f] = Boolean(out[f]);
    }
  }

  for (const f of bigIntFields) {
    if (out[f] !== null && out[f] !== undefined) {
      out[f] = BigInt(out[f]);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Per-model migration
// ---------------------------------------------------------------------------

async function migrateModel({ model, table, dateFields, boolFields, bigIntFields }) {
  const start = Date.now();
  const total = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;

  if (total === 0) {
    console.log(`  ${model.padEnd(28)}  0 rows (skipped)`);
    return { model, sourceCount: 0, targetCount: 0 };
  }

  let migrated = 0;
  let offset = 0;

  while (offset < total) {
    const batch = sqlite
      .prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`)
      .all(BATCH_SIZE, offset);

    const coerced = batch.map((r) => coerceRow(r, { dateFields, boolFields, bigIntFields }));

    // Use createMany for speed; skipDuplicates handles re-runs without a full reset
    await prisma[model.charAt(0).toLowerCase() + model.slice(1)].createMany({
      data: coerced,
      skipDuplicates: true
    });

    migrated += batch.length;
    offset += BATCH_SIZE;
  }

  // Verify
  const targetCount = await prisma[model.charAt(0).toLowerCase() + model.slice(1)].count();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const status = targetCount === total ? '✓' : '✗';
  console.log(
    `  ${status} ${model.padEnd(28)}  ${String(total).padStart(6)} rows in ${elapsed}s` +
      (targetCount === total ? '' : `  (target=${targetCount}!)`)
  );

  return { model, sourceCount: total, targetCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('SQLite → Postgres migration');
  console.log(`  Source: ${sqlitePath}`);
  console.log(`  Target: ${args.target.replace(/:[^:@]+@/, ':***@')}`);
  console.log('');

  // Verify Postgres is empty (or warn)
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.warn(
      `  WARNING: target Postgres already contains ${userCount} User rows. ` +
        `Re-running with skipDuplicates=true. To start fresh, run:\n` +
        `    npx prisma db push --force-reset --skip-generate\n`
    );
  }

  const start = Date.now();
  const results = [];

  for (const spec of MIGRATION_ORDER) {
    try {
      const r = await migrateModel(spec);
      results.push(r);
    } catch (err) {
      console.error(`\n✗ FAILED on ${spec.model}:`);
      console.error(err);
      console.error(`\nMigration aborted. Postgres state is partial. To retry from clean:`);
      console.error(`  cd /var/www/order-tracker/api`);
      console.error(
        `  DATABASE_URL="${args.target}" npx prisma db push --force-reset --skip-generate`
      );
      process.exit(1);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const totalRows = results.reduce((s, r) => s + r.sourceCount, 0);
  const mismatches = results.filter((r) => r.sourceCount !== r.targetCount);

  console.log('');
  if (mismatches.length === 0) {
    console.log(`Verification: all tables match. Total rows: ${totalRows} in ${elapsed}s`);
  } else {
    console.log(`Verification: ${mismatches.length} table(s) mismatched:`);
    for (const m of mismatches) {
      console.log(`  ${m.model}: source=${m.sourceCount}, target=${m.targetCount}`);
    }
    process.exit(2);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
