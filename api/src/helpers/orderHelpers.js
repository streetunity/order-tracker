// api/src/helpers/orderHelpers.js
/**
 * Order Helper Functions
 * Shared utility functions for order operations
 */

import { STAGE_THRESHOLDS } from '../config/stageThresholds.js';

/**
 * Calculate estimated ETA date based on average stage durations
 * Uses the average of warning + critical days for each key stage
 */
export function calculateETADate(orderDate = new Date()) {
  // Only include stages up to delivery (exclude post-delivery stages)
  const stageDurations = {
    MANUFACTURING: (STAGE_THRESHOLDS.MANUFACTURING.warningDays + STAGE_THRESHOLDS.MANUFACTURING.criticalDays) / 2,
    TESTING: (STAGE_THRESHOLDS.TESTING.warningDays + STAGE_THRESHOLDS.TESTING.criticalDays) / 2,
    SHIPPING: (STAGE_THRESHOLDS.SHIPPING.warningDays + STAGE_THRESHOLDS.SHIPPING.criticalDays) / 2,
    AT_SEA: (STAGE_THRESHOLDS.AT_SEA.warningDays + STAGE_THRESHOLDS.AT_SEA.criticalDays) / 2,
    SMT: (STAGE_THRESHOLDS.SMT.warningDays + STAGE_THRESHOLDS.SMT.criticalDays) / 2,
    QC: (STAGE_THRESHOLDS.QC.warningDays + STAGE_THRESHOLDS.QC.criticalDays) / 2,
    DELIVERED: (STAGE_THRESHOLDS.DELIVERED.warningDays + STAGE_THRESHOLDS.DELIVERED.criticalDays) / 2
  };
  
  const totalDays = Object.values(stageDurations).reduce((sum, days) => sum + days, 0);
  
  const eta = new Date(orderDate);
  eta.setDate(eta.getDate() + Math.round(totalDays));
  
  return eta;
}

/**
 * Check if an order is locked
 */
export async function checkOrderLock(prisma, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { isLocked: true }
  });
  return order?.isLocked || false;
}

/**
 * Normalize incoming item data
 */
export function normalizeIncomingItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({
      productCode: String(i?.productCode ?? i?.code ?? i?.name ?? '').trim(),
      qty: Number(i?.qty ?? i?.quantity ?? i?.count ?? 1) || 1,
      serialNumber: i?.serialNumber ? String(i.serialNumber).trim() : null,
      modelNumber: i?.modelNumber ? String(i.modelNumber).trim() : null,
      voltage: i?.voltage ? String(i.voltage).trim() : null,
      laserWattage: i?.laserWattage ? String(i.laserWattage).trim() : null,
      notes: i?.notes ? String(i.notes).trim() : null
    }))
    .filter((i) => i.productCode.length > 0);
}

/**
 * Helper function to safely convert strings to floats for measurements
 */
export function toFloat(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}
