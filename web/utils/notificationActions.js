// Configuration for notification action buttons
// Maps notification types to their specific action buttons

export const NOTIFICATION_ACTIONS = {
  // Commission notifications - all go to commission pages
  COMMISSION: [
    {
      label: "Review Commissions",
      path: "/admin/commissions",
      variant: "primary"
    }
  ],

  COMMISSION_PENDING: [
    {
      label: "Review Commissions",
      path: "/admin/commissions",
      variant: "primary"
    }
  ],

  COMMISSION_APPROVED: [
    {
      label: "View Commissions",
      path: "/admin/commissions",
      variant: "success"
    }
  ],

  COMMISSION_EARNED: [
    {
      label: "View My Commissions",
      path: "/my-commissions",
      variant: "success"
    }
  ],

  COMMISSION_PAYMENT: [
    {
      label: "View My Commissions",
      path: "/my-commissions",
      variant: "success"
    }
  ],

  // Operational notifications - Critical/Warning
  STAGE_CRITICAL: [
    {
      label: "View Order",
      path: (notification) => `/admin/orders/${notification.relatedId}`,
      variant: "danger"
    }
  ],

  STAGE_WARNING: [
    {
      label: "View Order",
      path: (notification) => `/admin/orders/${notification.relatedId}`,
      variant: "warning"
    }
  ],

  ORDER_LATE: [
    {
      label: "View Order",
      path: (notification) => `/admin/orders/${notification.relatedId}`,
      variant: "danger"
    }
  ],

  ORDER_DELIVERED: [
    {
      label: "View Order",
      path: (notification) => `/admin/orders/${notification.relatedId}`,
      variant: "success"
    }
  ]
};

/**
 * Get action buttons for a notification
 * @param {Object} notification - The notification object
 * @returns {Array} Array of action button configurations with resolved paths
 */
export function getNotificationActions(notification) {
  const actions = NOTIFICATION_ACTIONS[notification.type] || [];

  return actions
    .map(action => ({
      ...action,
      href: typeof action.path === 'function'
        ? action.path(notification)
        : action.path
    }))
    .filter(action => {
      // Filter out actions with invalid hrefs (e.g., when relatedId is null)
      if (!action.href) return false;
      if (action.href.includes('null') || action.href.includes('undefined')) return false;
      return true;
    });
}
