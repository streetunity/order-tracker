// History page constants and helper functions

// Tab configuration
export const TABS = [
  { id: 'recent', label: 'Recent', icon: '🕐', color: '#6b7280' },
  { id: 'orders', label: 'Orders', icon: '📦', color: '#3b82f6' },
  { id: 'customers', label: 'Customers', icon: '👥', color: '#22c55e' },
  { id: 'users', label: 'Users', icon: '👤', color: '#a855f7' },
  { id: 'commissions', label: 'Commissions', icon: '💰', color: '#eab308' },
  { id: 'documents', label: 'Documents', icon: '📄', color: '#ef4444' },
];

// Date preset options
export const DATE_PRESETS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' },
];

// Role display names
export const ROLE_LABELS = {
  'SUPER_ADMIN': 'Super Admin',
  'ACCOUNTANT': 'Accountant',
  'ADMIN': 'Admin',
  'AGENT': 'Agent',
  'BROKER': 'Broker',
  'MANUFACTURER': 'Manufacturer'
};

// Action labels
const ACTION_LABELS = {
  'ORDER_CREATED': 'Order Created',
  'ORDER_UPDATED': 'Order Updated',
  'ORDER_DELETED': 'Order Deleted',
  'ORDERITEM_UPDATED': 'Item Updated',
  'ITEMS_ADDED': 'Items Added',
  'ITEM_DELETED': 'Item Deleted',
  'ITEM_ORDERED': 'Item Ordered',
  'ITEM_UNORDERED': 'Item Unordered',
  'STAGE_CHANGED': 'Stage Changed',
  'ORDER_LOCKED': 'Order Locked',
  'ORDER_UNLOCKED': 'Order Unlocked',
  'ACCOUNT_CREATED': 'Customer Created',
  'ACCOUNT_UPDATED': 'Customer Updated',
  'ACCOUNT_DELETED': 'Customer Deleted',
  'EDIT_ATTEMPTED_WHILE_LOCKED': 'Edit Blocked (Locked)',
  'DELETE_ATTEMPTED_WHILE_LOCKED': 'Delete Blocked (Locked)',
  'MEASUREMENTS_UPDATED': 'Measurements Updated',
  'CONTAINERS_UPDATED': 'Containers Updated',
  'INTERNAL_NOTES_UPDATED': 'Internal Notes Updated',
  'USER_CREATED': 'User Created',
  'USER_UPDATED': 'User Updated',
  'USER_ROLE_CHANGED': 'Role Changed',
  'USER_DEACTIVATED': 'User Deactivated',
  'USER_ACTIVATED': 'User Activated',
  'APPROVED': 'Payout Approved',
  'UNAPPROVED': 'Payout Unapproved',
  'REJECTED': 'Payout Denied',
  'PAID': 'Payout Paid',
  'UNPAID': 'Payout Unpaid',
  'BULK_APPROVED': 'Bulk Approved',
  'BULK_PAID': 'Bulk Paid',
  'COMMISSION_APPROVED': 'Commission Approved',
  'COMMISSION_DENIED': 'Commission Denied',
  'COMMISSION_RECALCULATED': 'Commission Recalculated',
  'COMMISSION_RATE_CHANGED': 'Rate Changed',
  'PAYOUT_APPROVED': 'Payout Approved',
  'PAYOUT_DENIED': 'Payout Denied',
  'PAYOUT_PAID': 'Payout Paid',
  'DOCUMENT_UPLOADED': 'Document Uploaded',
  'DOCUMENT_DELETED': 'Document Deleted',
};

// Field labels for changes display
const FIELD_LABELS = {
  'poNumber': 'PO Number',
  'sku': 'Sales Person',
  'customerDocsLink': 'Customer Documents Link',
  'orderDate': 'Order Date',
  'discount': 'Discount',
  'etaDate': 'ETA Date',
  'shippingCarrier': 'Shipping Carrier',
  'trackingNumber': 'Tracking Number',
  'currentStage': 'Current Stage',
  'isLocked': 'Lock Status',
  'internalNotes': 'Internal Notes',
  'productCode': 'Item Name',
  'qty': 'Quantity',
  'serialNumber': 'Serial Number',
  'modelNumber': 'Model Number',
  'voltage': 'Voltage',
  'laserWattage': 'Power',
  'notes': 'Notes',
  'itemPrice': 'Price',
  'privateItemNote': 'Private Item Note',
  'hasExtendedShipping': 'Extended Shipping',
  'isOrdered': 'Ordered Status',
  'archivedAt': 'Archive Status',
  'height': 'Height',
  'width': 'Width',
  'length': 'Length',
  'weight': 'Weight',
  'units': 'Units',
  'name': 'Name',
  'email': 'Email',
  'phone': 'Phone',
  'address': 'Address',
  'role': 'Role',
  'isActive': 'Active Status',
  'rate': 'Commission Rate',
  'status': 'Status',
  'amount': 'Amount',
  'showInSalesRepDropdown': 'Show in Sales Rep Dropdown',
  'password': 'Password',
};

export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function getActionLabel(action) {
  return ACTION_LABELS[action] || action;
}

export function getActionBadgeClass(action) {
  if (action.includes('CREATED') || action.includes('UPLOADED')) return 'badge-created';
  if (action.includes('UPDATED') || action.includes('CHANGED')) return 'badge-updated';
  if (action.includes('DELETED')) return 'badge-deleted';
  if (action.includes('LOCKED') || action.includes('BLOCKED') || action.includes('DENIED') || action.includes('REJECTED')) return 'badge-locked';
  if (action.includes('UNLOCKED') || action.includes('ACTIVATED') || action.includes('UNAPPROVED') || action.includes('UNPAID')) return 'badge-unlocked';
  if (action.includes('ORDERED') || action.includes('APPROVED') || action.includes('PAID')) return 'badge-ordered';
  return 'badge-default';
}

export function isArchiveAction(log) {
  if (log.entityType !== 'OrderItem') return false;
  const archiveChange = log.changes?.find(c => c.field === 'archivedAt');
  return archiveChange && archiveChange.oldValue === 'null' && archiveChange.newValue !== 'null';
}

export function getItemName(log) {
  if (log.orderItem?.productCode) return log.orderItem.productCode;
  if (log.changes) {
    const productCodeChange = log.changes.find(c => c.field === 'productCode');
    if (productCodeChange) return productCodeChange.newValue || productCodeChange.oldValue;
  }
  if (log.metadata?.items && Array.isArray(log.metadata.items) && log.metadata.items.length > 0) {
    return log.metadata.items[0].productCode;
  }
  return null;
}

export function getItemHeaderInfo(log) {
  if (log.entityType !== 'OrderItem') return null;
  let productCode = null;
  let modelNumber = null;

  if (log.orderItem) {
    productCode = log.orderItem.productCode || null;
    modelNumber = log.orderItem.modelNumber || null;
  }

  if (!productCode && log.changes) {
    const productCodeChange = log.changes.find(c => c.field === 'productCode');
    const modelNumberChange = log.changes.find(c => c.field === 'modelNumber');
    if (productCodeChange) productCode = productCodeChange.newValue || productCodeChange.oldValue;
    if (modelNumberChange) modelNumber = modelNumberChange.newValue || modelNumberChange.oldValue;
  }

  if (!productCode && log.metadata?.items && Array.isArray(log.metadata.items) && log.metadata.items.length > 0) {
    const item = log.metadata.items[0];
    productCode = item.productCode;
    modelNumber = item.modelNumber;
  }

  if (productCode && modelNumber && modelNumber !== 'null' && modelNumber !== '') {
    return `${productCode} • Model: ${modelNumber}`;
  } else if (productCode) {
    return productCode;
  }
  return null;
}

export function getEntityInfo(log, orders, accounts) {
  const info = { title: '', subtitle: '', details: [] };

  // Order entity
  if (log.entityType === 'Order' && !log.parentEntityId) {
    const order = orders.find(o => o.id === log.entityId);
    if (order) {
      info.title = order.account?.name || 'Unknown Customer';
      info.subtitle = order.sku || '';
    }
  }

  // Container entity
  if (log.entityType === 'Container') {
    if (log.metadata?.orderName) {
      info.title = log.metadata.orderName;
    }
    if (log.metadata?.salesPerson) {
      info.subtitle = log.metadata.salesPerson;
    }
    if (log.parentEntityId) {
      const order = orders.find(o => o.id === log.parentEntityId);
      if (order) {
        info.title = order.account?.name || info.title || 'Unknown Customer';
        info.subtitle = order.sku || info.subtitle || '';
      }
    }
  }

  // Account entity
  if (log.entityType === 'Account') {
    const account = accounts.find(a => a.id === log.entityId);
    if (account) {
      info.title = account.name;
      const accountOrders = orders.filter(o => o.accountId === account.id);
      if (accountOrders.length > 0 && accountOrders[0].sku) {
        info.subtitle = accountOrders[0].sku;
      }
    }
  }

  // OrderItem entity
  if (log.entityType === 'OrderItem') {
    if (log.parentEntityId) {
      const order = orders.find(o => o.id === log.parentEntityId);
      if (order) {
        info.title = order.account?.name || 'Unknown Customer';
        info.subtitle = order.sku || '';
      }
    }
  }

  // User entity
  if (log.entityType === 'User') {
    if (log.metadata?.userName) {
      info.title = log.metadata.userName;
      const role = log.metadata.userRole;
      info.subtitle = role ? (ROLE_LABELS[role] || role) : '';
    } else if (log.metadata?.data) {
      info.title = log.metadata.data.name || log.metadata.data.email || 'Unknown User';
      const role = log.metadata.data.role;
      info.subtitle = role ? (ROLE_LABELS[role] || role) : '';
    }
    if (log.changes && log.changes.length > 0) {
      const nameChange = log.changes.find(c => c.field === 'name');
      const roleChange = log.changes.find(c => c.field === 'role');
      if (nameChange && !info.title) {
        info.title = nameChange.newValue || nameChange.oldValue;
      }
      if (roleChange) {
        const oldRole = ROLE_LABELS[roleChange.oldValue] || roleChange.oldValue;
        const newRole = ROLE_LABELS[roleChange.newValue] || roleChange.newValue;
        info.details.push(`Role: ${oldRole} → ${newRole}`);
      }
    }
  }

  // Commission/CommissionPayout entity
  if (log.entityType === 'Commission' || log.entityType === 'CommissionPayout' || log.entityType === 'ItemCommission') {
    const meta = log.metadata || {};

    if (meta.salesPersonName || meta.salesPerson) {
      info.title = meta.salesPersonName || meta.salesPerson;
    }

    const orderInfo = [];
    if (meta.customerName) orderInfo.push(meta.customerName);
    if (meta.itemName) orderInfo.push(meta.itemName);
    if (orderInfo.length > 0) {
      info.subtitle = orderInfo.join(' • ');
    }

    if (meta.stage) {
      const stageLabel = meta.stage === 'SHIPPING' ? 'P1 (Shipping)' :
                        meta.stage === 'DELIVERED' ? 'P2 (Delivered)' : meta.stage;
      info.details.push(`Phase: ${stageLabel}`);
    }
    if (meta.amount !== undefined && meta.amount !== null) {
      info.details.push(`Amount: $${parseFloat(meta.amount).toFixed(2)}`);
    }
    if (meta.rejectionReason) {
      info.details.push(`Reason: ${meta.rejectionReason}`);
    }
    if (meta.paymentMethod) {
      info.details.push(`Method: ${meta.paymentMethod}`);
    }
  }

  // Document entities
  if (log.entityType?.includes('Document') && log.metadata) {
    info.title = log.metadata.fileName || '';

    const subtitleParts = [];
    if (log.metadata.documentTypeLabel || log.metadata.documentType) {
      subtitleParts.push(log.metadata.documentTypeLabel || log.metadata.documentType);
    }
    if (log.metadata.customerName) {
      subtitleParts.push(log.metadata.customerName);
    }
    info.subtitle = subtitleParts.join(' • ');

    if (log.metadata.productCode) {
      info.details.push(`Item: ${log.metadata.productCode}`);
    }
    if (log.metadata.containerNumber) {
      info.details.push(`Container: ${log.metadata.containerNumber}`);
    }
  }

  return info;
}

export function getFieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

export function formatValue(value) {
  if (value === null || value === 'null') return '(empty)';
  if (value === true || value === 'true') return 'Yes';
  if (value === false || value === 'false') return 'No';
  if (value === '') return '(blank)';
  if (value === '[hidden]' || value === '[changed]') return value;
  if (ROLE_LABELS[value]) return ROLE_LABELS[value];
  return value;
}

// Calculate date range based on preset
export function getDateRange(datePreset, customStartDate, customEndDate) {
  const now = new Date();
  let startDate = null;
  let endDate = null;

  switch (datePreset) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = now;
      break;
    case '7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = now;
      break;
    case '30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      endDate = now;
      break;
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
      break;
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'custom':
      if (customStartDate) startDate = new Date(customStartDate);
      if (customEndDate) endDate = new Date(customEndDate);
      break;
    default:
      break;
  }

  return {
    startDate: startDate ? startDate.toISOString().split('T')[0] : null,
    endDate: endDate ? endDate.toISOString().split('T')[0] : null
  };
}
