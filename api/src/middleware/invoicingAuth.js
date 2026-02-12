// api/src/middleware/invoicingAuth.js

/**
 * Invoicing Auth Middleware
 * Checks if user has access to invoicing system
 */
export function invoicingAuth(req, res, next) {
  // User should already be authenticated via authGuard
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Block manufacturer and broker roles from invoicing
  const blockedRoles = ['MANUFACTURER', 'BROKER'];
  if (blockedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied to invoicing system' });
  }

  next();
}

/**
 * Invoicing System Permissions
 * Maps permission names to allowed roles
 */
const INVOICING_PERMISSIONS = {
  // Lead Management
  VIEW_ALL_LEADS: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  VIEW_OWN_LEADS: ['AGENT'],
  CREATE_LEAD: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  EDIT_LEAD: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  DELETE_LEAD: ['SUPER_ADMIN', 'ADMIN'],
  CONVERT_LEAD: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  ASSIGN_LEAD: ['SUPER_ADMIN', 'ADMIN'],

  // Customer Management
  VIEW_ALL_CUSTOMERS: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  VIEW_OWN_CUSTOMERS: ['AGENT'],
  CREATE_CUSTOMER: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  EDIT_CUSTOMER: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  DELETE_CUSTOMER: ['SUPER_ADMIN'],
  VIEW_CUSTOMER_FINANCIAL: ['SUPER_ADMIN', 'ACCOUNTANT'],

  // Estimate Management
  VIEW_ALL_ESTIMATES: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  VIEW_OWN_ESTIMATES: ['AGENT'],
  CREATE_ESTIMATE: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  EDIT_ESTIMATE: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  DELETE_ESTIMATE: ['SUPER_ADMIN', 'ADMIN'],
  SEND_ESTIMATE: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  CONVERT_ESTIMATE_TO_INVOICE: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],

  // Invoice Management
  VIEW_ALL_INVOICES: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  VIEW_OWN_INVOICES: ['AGENT'],
  CREATE_INVOICE: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  EDIT_INVOICE: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  DELETE_INVOICE: ['SUPER_ADMIN', 'ACCOUNTANT'],
  SEND_INVOICE: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  VIEW_INVOICE_PAYMENTS: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  VOID_INVOICE: ['SUPER_ADMIN', 'ACCOUNTANT'],

  // Payment Management
  VIEW_ALL_PAYMENTS: ['SUPER_ADMIN', 'ACCOUNTANT'],
  RECORD_PAYMENT: ['SUPER_ADMIN', 'ACCOUNTANT'],
  REFUND_PAYMENT: ['SUPER_ADMIN', 'ACCOUNTANT'],
  VIEW_PAYMENT_METHODS: ['SUPER_ADMIN', 'ACCOUNTANT'],

  // Reporting
  VIEW_SALES_REPORTS: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN'],
  VIEW_AR_AGING: ['SUPER_ADMIN', 'ACCOUNTANT'],
  VIEW_TAX_REPORTS: ['SUPER_ADMIN', 'ACCOUNTANT'],
  EXPORT_FINANCIAL_DATA: ['SUPER_ADMIN', 'ACCOUNTANT'],

  // Settings
  EDIT_COMPANY_SETTINGS: ['SUPER_ADMIN'],
  EDIT_EMAIL_SETTINGS: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  MANAGE_ZAPIER_WEBHOOKS: ['SUPER_ADMIN', 'ADMIN'],
  EDIT_INVOICE_TEMPLATES: ['SUPER_ADMIN', 'ADMIN'],
  CONFIGURE_PAYMENT_GATEWAY: ['SUPER_ADMIN'],

  // Product Catalog Management
  VIEW_PRODUCTS: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  CREATE_PRODUCT: ['SUPER_ADMIN', 'ADMIN'],
  EDIT_PRODUCT: ['SUPER_ADMIN', 'ADMIN'],
  DELETE_PRODUCT: ['SUPER_ADMIN', 'ADMIN'],
  MANAGE_PRODUCT_ATTACHMENTS: ['SUPER_ADMIN', 'ADMIN'],

  // Bundle Management
  VIEW_BUNDLES: ['SUPER_ADMIN', 'ACCOUNTANT', 'ADMIN', 'AGENT'],
  CREATE_BUNDLE: ['SUPER_ADMIN', 'ADMIN'],
  EDIT_BUNDLE: ['SUPER_ADMIN', 'ADMIN'],
  DELETE_BUNDLE: ['SUPER_ADMIN', 'ADMIN']
};

/**
 * Check if user has a specific invoicing permission
 * @param {string} userRole - User's role
 * @param {string} permission - Permission to check
 * @returns {boolean} - True if user has permission
 */
export function hasInvoicingPermission(userRole, permission) {
  if (!INVOICING_PERMISSIONS[permission]) {
    console.warn(`Unknown permission: ${permission}`);
    return false;
  }
  return INVOICING_PERMISSIONS[permission].includes(userRole);
}

/**
 * Middleware to require a specific invoicing permission
 * Returns 403 if user doesn't have the permission
 * @param {string} permission - Required permission
 * @returns {Function} - Express middleware
 */
export function requireInvoicingPermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!hasInvoicingPermission(req.user.role, permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role ${req.user.role} does not have permission: ${permission}`
      });
    }
    next();
  };
}

/**
 * Apply data filtering for invoicing entities based on role
 * AGENTs can only see their own data (assignedToId or createdById matches)
 * Other roles see all data
 * @param {string} role - User's role
 * @param {string} userId - User's ID
 * @param {object} where - Base where clause
 * @returns {object} - Modified where clause with filters
 */
export function applyInvoicingDataFilter(role, userId, where = {}) {
  if (role === 'AGENT') {
    return {
      ...where,
      OR: [
        { assignedToId: userId },
        { createdById: userId }
      ]
    };
  }
  return where;
}
