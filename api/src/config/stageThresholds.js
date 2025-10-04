// api/src/config/stageThresholds.js
/**
 * Stage-specific time thresholds based on SMT's documented manufacturing timeline
 * 
 * These thresholds represent the expected maximum time for each stage based on:
 * - Standard equipment: 30-50 days manufacturing + 25-45 days sea freight + 7-14 days customs
 * - Complex equipment (Mega3/4, H-Series, Large Autoloading): 90-100 days manufacturing
 * 
 * Source: SMT's Purchasing and Manufacturing Timeline document
 */

export const STAGE_THRESHOLDS = {
  // Phase 3: Manufacturing & Assembly
  // Standard: 30-50 days, Complex: 90-100 days
  // Using 60 days as alert threshold (beyond standard, before complex max)
  MANUFACTURING: {
    warningDays: 50,
    criticalDays: 90,
    warningSeconds: 50 * 86400,
    criticalSeconds: 90 * 86400,
    description: 'Manufacturing & Assembly phase'
  },

  // Phase 4-5: Quality Check, Calibration & Export Prep
  // Document says: 3-5 days testing + 3-6 days export prep = ~8 days total
  TESTING: {
    warningDays: 10,
    criticalDays: 15,
    warningSeconds: 10 * 86400,
    criticalSeconds: 15 * 86400,
    description: 'Testing, calibration & export preparation'
  },

  // Phase 6: Sea Freight & Shipping Transit
  // Document says: 25-45 days typical
  SHIPPING: {
    warningDays: 45,
    criticalDays: 60,
    warningSeconds: 45 * 86400,
    criticalSeconds: 60 * 86400,
    description: 'Ocean freight transit'
  },

  // Phase 6 Alternative: Items on vessel
  AT_SEA: {
    warningDays: 45,
    criticalDays: 60,
    warningSeconds: 45 * 86400,
    criticalSeconds: 60 * 86400,
    description: 'Ocean freight transit (on vessel)'
  },

  // Phase 7: Customs & Domestic Trucking
  // Document says: 7-14 days typical
  SMT: {
    warningDays: 14,
    criticalDays: 21,
    warningSeconds: 14 * 86400,
    criticalSeconds: 21 * 86400,
    description: 'At SMT facility - customs clearance and domestic routing'
  },

  // Phase 4: Quality Control at SMT
  QC: {
    warningDays: 7,
    criticalDays: 14,
    warningSeconds: 7 * 86400,
    criticalSeconds: 14 * 86400,
    description: 'Quality control inspection at SMT'
  },

  // Post-delivery stages (should be quick)
  DELIVERED: {
    warningDays: 3,
    criticalDays: 7,
    warningSeconds: 3 * 86400,
    criticalSeconds: 7 * 86400,
    description: 'Delivered to customer location'
  },

  ONSITE: {
    warningDays: 10,
    criticalDays: 15,
    warningSeconds: 10 * 86400,
    criticalSeconds: 15 * 86400,
    description: 'On-site installation and training'
  },

  COMPLETED: {
    warningDays: 5,
    criticalDays: 10,
    warningSeconds: 5 * 86400,
    criticalSeconds: 10 * 86400,
    description: 'Awaiting final documentation'
  },

  FOLLOW_UP: {
    warningDays: 14,
    criticalDays: 30,
    warningSeconds: 14 * 86400,
    criticalSeconds: 30 * 86400,
    description: 'Post-delivery follow-up'
  }
};

/**
 * Get the threshold for a specific stage
 */
export function getStageThreshold(stage, level = 'warning') {
  const threshold = STAGE_THRESHOLDS[stage];
  if (!threshold) {
    // Default fallback for unknown stages
    return level === 'warning' ? 30 * 86400 : 60 * 86400;
  }
  return level === 'warning' ? threshold.warningSeconds : threshold.criticalSeconds;
}

/**
 * Get all thresholds in days for display
 */
export function getThresholdDays(stage) {
  const threshold = STAGE_THRESHOLDS[stage];
  if (!threshold) {
    return { warning: 30, critical: 60 };
  }
  return {
    warning: threshold.warningDays,
    critical: threshold.criticalDays
  };
}

/**
 * Check if an order/item is at risk based on time in current stage
 */
export function assessRiskLevel(stage, timeInStageSeconds) {
  const threshold = STAGE_THRESHOLDS[stage];
  if (!threshold) {
    // Default assessment
    if (timeInStageSeconds > 60 * 86400) return 'critical';
    if (timeInStageSeconds > 30 * 86400) return 'warning';
    return 'normal';
  }

  if (timeInStageSeconds > threshold.criticalSeconds) return 'critical';
  if (timeInStageSeconds > threshold.warningSeconds) return 'warning';
  return 'normal';
}

/**
 * Calculate total expected cycle time based on stages an order will pass through
 * Useful for ETA estimation
 */
export function calculateExpectedCycleTime(isComplex = false) {
  const manufacturing = isComplex ? 95 : 40; // days
  const testing = 8;
  const shipping = 35;
  const customs = 10;
  const qc = 5;
  const delivery = 3;
  const onsite = 7;
  
  return {
    totalDays: manufacturing + testing + shipping + customs + qc + delivery + onsite,
    breakdown: {
      manufacturing,
      testing,
      shipping,
      customs,
      qc,
      delivery,
      onsite
    }
  };
}

export default STAGE_THRESHOLDS;
