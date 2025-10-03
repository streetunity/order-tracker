// api/src/utils/reportHelpers.js
import { STAGES, STAGE_INDEX } from '../state.js';

/**
 * Parse common query filters for reports
 */
export function parseReportFilters(query) {
  const {
    date_mode = 'created',
    date_from,
    date_to,
    accountId,
    repId,
    stage,
    productCode,
    minValue,
    includeArchived = 'false',
    timezone = 'UTC',
    page = 1,
    pageSize = 50,
    sortBy = 'createdAt',
    sortDir = 'desc'
  } = query;

  const filters = {
    dateMode: date_mode,
    dateFrom: date_from ? new Date(date_from) : null,
    dateTo: date_to ? new Date(date_to) : null,
    accountId: accountId || null,
    repId: repId || null,
    stages: stage ? (Array.isArray(stage) ? stage : [stage]) : [],
    productCodes: productCode ? (Array.isArray(productCode) ? productCode : [productCode]) : [],
    minValue: minValue ? parseFloat(minValue) : null,
    includeArchived: includeArchived === 'true',
    timezone,
    page: parseInt(page, 10),
    pageSize: Math.min(parseInt(pageSize, 10), 100),
    sortBy,
    sortDir
  };

  return filters;
}

/**
 * Build Prisma where clause from filters
 */
export function buildWhereClause(filters, targetEntity = 'order') {
  const where = {};
  const { dateMode, dateFrom, dateTo, accountId, repId, stages, productCodes, includeArchived } = filters;

  // Date filtering
  if (dateFrom || dateTo) {
    const dateField = targetEntity === 'order' && dateMode === 'completed' ? 'completedAt' : 'createdAt';
    where[dateField] = {};
    if (dateFrom) where[dateField].gte = dateFrom;
    if (dateTo) where[dateField].lte = dateTo;
  }

  // Account filter
  if (accountId) {
    where.accountId = accountId;
  }

  // Rep filter (creator)
  if (repId) {
    where.createdByUserId = repId;
  }

  // Stage filter
  if (stages && stages.length > 0) {
    where.currentStage = { in: stages };
  }

  // Product code filter (for items)
  if (productCodes && productCodes.length > 0 && targetEntity === 'item') {
    where.productCode = { in: productCodes };
  }

  // Archived filter
  if (!includeArchived && targetEntity === 'item') {
    where.archivedAt = null;
  }

  return where;
}

/**
 * Calculate statistics (median, percentile)
 */
export function calculateStats(values) {
  if (!values || values.length === 0) {
    return { min: null, max: null, median: null, mean: null, p90: null, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;

  const median = count % 2 === 0 
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 
    : sorted[Math.floor(count / 2)];

  const p90Index = Math.floor(count * 0.9);
  const p90 = sorted[p90Index];

  return {
    min: sorted[0],
    max: sorted[count - 1],
    median,
    mean,
    p90,
    count
  };
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return 'N/A';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format currency
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Bucket dates by month
 */
export function bucketByMonth(date, timezone = 'UTC') {
  if (!date) return null;
  const d = new Date(date);
  // Simple UTC-based bucketing (can be enhanced with timezone support)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Bucket dates by week
 */
export function bucketByWeek(date, timezone = 'UTC') {
  if (!date) return null;
  const d = new Date(date);
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diff = d - startOfYear;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const week = Math.floor(diff / oneWeek) + 1;
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Calculate completion status for an order
 */
export async function calculateOrderCompletion(order, prisma) {
  const items = await prisma.orderItem.findMany({
    where: { orderId: order.id },
    include: {
      statusEvents: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  const finalStage = STAGES[STAGES.length - 1];
  const allComplete = items.every(item => {
    const currentStage = item.currentStage || order.currentStage;
    return currentStage === finalStage;
  });

  if (allComplete && items.length > 0) {
    // Find the latest completion time across all items
    let latestCompletion = null;
    for (const item of items) {
      const finalEvent = item.statusEvents.find(e => e.stage === finalStage);
      if (finalEvent) {
        if (!latestCompletion || finalEvent.createdAt > latestCompletion) {
          latestCompletion = finalEvent.createdAt;
        }
      }
    }
    return { isComplete: true, completedAt: latestCompletion };
  }

  return { isComplete: false, completedAt: null };
}

/**
 * Calculate cycle time from creation to completion
 */
export function calculateCycleTime(createdAt, completedAt) {
  if (!createdAt || !completedAt) return null;
  const diff = new Date(completedAt) - new Date(createdAt);
  return Math.floor(diff / 1000); // Return seconds
}

/**
 * Detect if an item has backward stage movements
 */
export function hasBackwardMovement(statusEvents) {
  if (!statusEvents || statusEvents.length <= 1) return false;
  
  for (let i = 1; i < statusEvents.length; i++) {
    const prevStage = statusEvents[i - 1].stage;
    const currStage = statusEvents[i].stage;
    const prevIndex = STAGE_INDEX[prevStage] || 0;
    const currIndex = STAGE_INDEX[currStage] || 0;
    
    if (currIndex < prevIndex) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get stage duration for an item
 */
export function calculateStageDurations(statusEvents) {
  if (!statusEvents || statusEvents.length === 0) return [];
  
  const durations = [];
  const sorted = [...statusEvents].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    if (next) {
      const durationSec = Math.floor((new Date(next.createdAt) - new Date(current.createdAt)) / 1000);
      durations.push({
        stage: current.stage,
        startedAt: current.createdAt,
        endedAt: next.createdAt,
        durationSec
      });
    } else {
      // Current stage (still in progress)
      const durationSec = Math.floor((new Date() - new Date(current.createdAt)) / 1000);
      durations.push({
        stage: current.stage,
        startedAt: current.createdAt,
        endedAt: null,
        durationSec
      });
    }
  }
  
  return durations;
}

/**
 * Check if order/item is on-time
 */
export function isOnTime(completedAt, etaDate) {
  if (!completedAt || !etaDate) return null;
  return new Date(completedAt) <= new Date(etaDate);
}

/**
 * Calculate slippage in days
 */
export function calculateSlippage(completedAt, etaDate) {
  if (!completedAt || !etaDate) return null;
  const diff = new Date(completedAt) - new Date(etaDate);
  return Math.floor(diff / (1000 * 60 * 60 * 24)); // Days
}

/**
 * Paginate results
 */
export function paginateResults(results, page = 1, pageSize = 50) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  return {
    data: results.slice(start, end),
    pagination: {
      page,
      pageSize,
      total: results.length,
      totalPages: Math.ceil(results.length / pageSize),
      hasMore: end < results.length
    }
  };
}
