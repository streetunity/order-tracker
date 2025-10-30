// Commission utility functions for consistent calculations and formatting

/**
 * Format currency with proper decimal places and comma separators
 * @param {number} amount - The amount to format
 * @param {boolean} showCents - Whether to show cents (default true)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, showCents = true) => {
  if (amount === null || amount === undefined) return '$0.00';
  const options = {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0
  };
  return new Intl.NumberFormat('en-US', options).format(amount);
};

/**
 * Format percentage with proper decimal places
 * @param {number} value - The percentage value
 * @param {number} decimals - Number of decimal places (default 1)
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 1) => {
  if (value === null || value === undefined) return '0%';
  return `${value.toFixed(decimals)}%`;
};

/**
 * Calculate commission amount based on order total and rate
 * @param {number} orderTotal - Total order value
 * @param {number} rate - Commission rate as percentage (e.g., 5 for 5%)
 * @param {number} split - Split percentage if applicable (default 100)
 * @returns {number} Calculated commission amount
 */
export const calculateCommissionAmount = (orderTotal, rate, split = 100) => {
  const amount = (orderTotal * rate * split) / 10000;
  return roundMoney(amount);
};

/**
 * Round money to 2 decimal places for consistent financial calculations
 * @param {number} amount - The amount to round
 * @returns {number} Rounded amount
 */
export const roundMoney = (amount) => {
  return Math.round(amount * 100) / 100;
};

/**
 * Validate that stage distribution totals 100%
 * @param {Array} distribution - Array of stage distribution objects
 * @returns {boolean} True if valid (totals 100%)
 */
export const validateStageDistribution = (distribution) => {
  const total = distribution.reduce((sum, item) => sum + item.percentage, 0);
  return Math.abs(total - 100) < 0.01; // Allow 0.01 tolerance for floating point
};

/**
 * Get commission status badge styling
 * @param {string} status - Commission status
 * @returns {object} CSS classes for badge styling
 */
export const getCommissionStatusStyle = (status) => {
  const styles = {
    AWAITING_PRICES: 'badge-warning',
    CALCULATED: 'badge-info',
    PARTIAL_PAID: 'badge-partial',
    FULLY_PAID: 'badge-success',
    FLAGGED: 'badge-error',
    CANCELLED: 'badge-cancelled'
  };
  return styles[status] || 'badge-default';
};

/**
 * Get payout status badge styling
 * @param {string} status - Payout status
 * @returns {object} CSS classes for badge styling
 */
export const getPayoutStatusStyle = (status) => {
  const styles = {
    WAITING: 'badge-default',
    PENDING: 'badge-warning',
    APPROVED: 'badge-info',
    PAID: 'badge-success',
    REJECTED: 'badge-error'
  };
  return styles[status] || 'badge-default';
};

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @param {boolean} includeTime - Whether to include time (default false)
 * @returns {string} Formatted date string
 */
export const formatDate = (date, includeTime = false) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  
  const options = {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return d.toLocaleDateString('en-US', options);
};

/**
 * Calculate projected earnings (commissions not yet triggered)
 * @param {Array} orders - Array of orders with calculated commissions
 * @returns {number} Total projected earnings
 */
export const calculateProjectedEarnings = (orders) => {
  return orders.reduce((total, order) => {
    if (order.commission && order.commission.status === 'CALCULATED') {
      return total + order.commission.totalCommissionAmount;
    }
    return total;
  }, 0);
};

/**
 * Calculate YTD totals for a given year
 * @param {Array} commissions - Array of commission objects
 * @param {number} year - Year to calculate for
 * @returns {object} YTD totals breakdown
 */
export const calculateYTDTotals = (commissions, year) => {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);
  
  const ytdCommissions = commissions.filter(c => {
    const date = new Date(c.calculatedAt);
    return date >= startDate && date <= endDate;
  });
  
  return {
    totalCalculated: ytdCommissions.reduce((sum, c) => sum + c.totalCommissionAmount, 0),
    totalPaid: ytdCommissions
      .filter(c => c.status === 'FULLY_PAID')
      .reduce((sum, c) => sum + c.totalCommissionAmount, 0),
    totalPending: ytdCommissions
      .filter(c => c.status === 'PARTIAL_PAID' || (c.payouts && c.payouts.some(p => p.status === 'PENDING')))
      .reduce((sum, c) => sum + c.totalCommissionAmount, 0),
    totalProjected: ytdCommissions
      .filter(c => c.status === 'CALCULATED')
      .reduce((sum, c) => sum + c.totalCommissionAmount, 0)
  };
};

/**
 * Group commissions by agent for summary display
 * @param {Array} payouts - Array of payout objects
 * @returns {object} Grouped payouts by agent
 */
export const groupPayoutsByAgent = (payouts) => {
  return payouts.reduce((acc, payout) => {
    const name = payout.commission.salesPersonName;
    if (!acc[name]) {
      acc[name] = {
        salesPerson: name,
        payouts: [],
        total: 0,
        count: 0
      };
    }
    acc[name].payouts.push(payout);
    acc[name].total += payout.amount;
    acc[name].count++;
    return acc;
  }, {});
};

/**
 * Get flag reason display text
 * @param {string} flagReason - The flag reason code
 * @returns {string} Human-readable flag reason
 */
export const getFlagReasonText = (flagReason) => {
  const reasons = {
    AWAITING_PRICES: 'Awaiting item prices',
    NO_SALES_REP: 'No sales rep assigned',
    PRICE_CHANGED: 'Item prices changed after calculation',
    ORDER_DELETED: 'Order was deleted',
    MANUAL_FLAG: 'Manually flagged for review'
  };
  return reasons[flagReason] || flagReason;
};

/**
 * Check if user can approve commissions
 * @param {object} user - User object with role
 * @returns {boolean} True if user can approve
 */
export const canApproveCommissions = (user) => {
  return user && ['SUPER_ADMIN', 'ACCOUNTANT'].includes(user.role);
};

/**
 * Check if user can manage commission settings
 * @param {object} user - User object with role
 * @returns {boolean} True if user can manage settings
 */
export const canManageCommissionSettings = (user) => {
  return user && user.role === 'SUPER_ADMIN';
};

/**
 * Check if user can view all commissions
 * @param {object} user - User object with role
 * @returns {boolean} True if user can view all
 */
export const canViewAllCommissions = (user) => {
  return user && ['SUPER_ADMIN', 'ACCOUNTANT'].includes(user.role);
};

/**
 * Calculate commission split for multiple sales reps
 * @param {number} totalAmount - Total commission amount
 * @param {Array} salesReps - Array of sales rep objects with split percentages
 * @returns {Array} Array of calculated splits
 */
export const calculateCommissionSplits = (totalAmount, salesReps) => {
  return salesReps.map(rep => ({
    ...rep,
    amount: roundMoney((totalAmount * rep.split) / 100)
  }));
};

/**
 * Get monthly commission trend data
 * @param {Array} commissions - Array of commission objects
 * @param {number} year - Year to analyze
 * @returns {Array} Monthly trend data
 */
export const getMonthlyTrend = (commissions, year) => {
  const months = Array(12).fill(null).map((_, i) => ({
    month: i,
    calculated: 0,
    paid: 0,
    pending: 0
  }));
  
  commissions.forEach(commission => {
    const date = new Date(commission.calculatedAt);
    if (date.getFullYear() === year) {
      const month = date.getMonth();
      months[month].calculated += commission.totalCommissionAmount;
      
      if (commission.status === 'FULLY_PAID') {
        months[month].paid += commission.totalCommissionAmount;
      } else if (commission.payouts?.some(p => p.status === 'PENDING')) {
        months[month].pending += commission.totalCommissionAmount;
      }
    }
  });
  
  return months;
};

/**
 * Export commissions to CSV format
 * @param {Array} commissions - Array of commission objects
 * @returns {string} CSV formatted string
 */
export const exportToCSV = (commissions) => {
  const headers = [
    'Commission ID',
    'Order Number',
    'Sales Person',
    'Customer',
    'Order Total',
    'Commission Rate',
    'Commission Amount',
    'Status',
    'Calculated Date',
    'Paid Date'
  ];
  
  const rows = commissions.map(c => [
    c.id,
    c.order?.poNumber || 'N/A',
    c.salesPersonName,
    c.order?.account?.name || 'N/A',
    formatCurrency(c.orderTotalAmount, false),
    formatPercentage(c.commissionRate),
    formatCurrency(c.totalCommissionAmount),
    c.status,
    formatDate(c.calculatedAt),
    c.status === 'FULLY_PAID' ? formatDate(c.updatedAt) : ''
  ]);
  
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
};

export default {
  formatCurrency,
  formatPercentage,
  calculateCommissionAmount,
  roundMoney,
  validateStageDistribution,
  getCommissionStatusStyle,
  getPayoutStatusStyle,
  formatDate,
  calculateProjectedEarnings,
  calculateYTDTotals,
  groupPayoutsByAgent,
  getFlagReasonText,
  canApproveCommissions,
  canManageCommissionSettings,
  canViewAllCommissions,
  calculateCommissionSplits,
  getMonthlyTrend,
  exportToCSV
};
