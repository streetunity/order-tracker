// Configuration for notification action buttons
// Maps notification types to their specific action buttons

export const NOTIFICATION_ACTIONS = {
  // Commission notifications
  COMMISSION_PENDING: [
    {
      label: "Review Commission",
      path: "/admin/commissions",
      variant: "primary"
    },
    {
      label: "View Order",
      path: (notification) => `/admin/orders/${notification.relatedId}`,
      variant: "secondary"
    }
  ],

  COMMISSION_APPROVED: [
    {
      label: "View Details",
      path: "/admin/commissions",
      variant: "success"
    },
    {
      label: "View Order",
      path: (notification) => `/admin/orders/${notification.relatedId}`,
      variant: "secondary"
    }
  ],

  COMMISSION_EARNED: [
    {
      label: "View Commission",
      path: "/my-commissions",
      variant: "primary"
    },
    {
      label: "View Order",
      path: (notification) => `/admin/orders/${notification.relatedId}`,
      variant: "secondary"
    }
  ],

  COMMISSION_PAYMENT: [
    {
      label: "View Details",
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

  return actions.map(action => ({
    ...action,
    href: typeof action.path === 'function'
      ? action.path(notification)
      : action.path
  }));
}
