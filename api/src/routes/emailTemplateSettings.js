// api/src/routes/emailTemplateSettings.js
import { Router } from 'express';
import { adminGuard } from '../middleware/auth.js';

async function getCompanyInfo(prisma) {
  try {
    const settings = await prisma.invoicingSettings.findFirst();
    if (settings) {
      return {
        companyName:    settings.companyName || 'Stealth Machine Tools',
        companyPhone:   settings.phone || '',
        companyEmail:   settings.email || 'info@stealthlaser.com',
        companyWebsite: settings.website || 'https://smt-orders.com',
        companyAddress: [settings.address, settings.city, settings.state, settings.zipCode].filter(Boolean).join(', ') || '',
      };
    }
  } catch (e) {
    console.error('Error fetching company info for email templates:', e);
  }
  return { companyName: 'Stealth Machine Tools', companyPhone: '', companyEmail: 'info@stealthlaser.com', companyWebsite: 'https://smt-orders.com', companyAddress: '' };
}

// Sample payout details table used in preview / test-send for agent notifications
const SAMPLE_PAYOUT_DETAILS =
  '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dddddd;border-radius:4px;overflow:hidden;margin-top:12px;">'+
  '<thead><tr style="background-color:#f5f5f5;">'+
  '<th style="padding:8px 10px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Item</th>'+
  '<th style="padding:8px 10px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Customer</th>'+
  '<th style="padding:8px 10px;text-align:center;font-size:12px;color:#666666;font-weight:600;">Stage</th>'+
  '<th style="padding:8px 10px;text-align:right;font-size:12px;color:#666666;font-weight:600;">Amount</th>'+
  '</tr></thead><tbody>'+
  '<tr><td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">SL-3015</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Acme Corp</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:center;">SHIPPING</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:right;font-weight:600;">$312.50</td></tr>'+
  '<tr><td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">FP-2000</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Globex Inc</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:center;">DELIVERED</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:right;font-weight:600;">$312.50</td></tr>'+
  '</tbody><tfoot><tr style="background-color:#f9f9f9;">'+
  '<td colspan="3" style="padding:10px;font-size:13px;font-weight:600;color:#333333;">Total</td>'+
  '<td style="padding:10px;font-size:15px;font-weight:700;color:#22c55e;text-align:right;">$625.00</td>'+
  '</tr></tfoot></table>';

const SAMPLE_APPROVAL_DETAILS =
  '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dddddd;border-radius:4px;overflow:hidden;margin-top:12px;">'+
  '<thead><tr style="background-color:#f5f5f5;">'+
  '<th style="padding:8px 10px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Item</th>'+
  '<th style="padding:8px 10px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Customer</th>'+
  '<th style="padding:8px 10px;text-align:center;font-size:12px;color:#666666;font-weight:600;">Stage</th>'+
  '<th style="padding:8px 10px;text-align:right;font-size:12px;color:#666666;font-weight:600;">Amount</th>'+
  '</tr></thead><tbody>'+
  '<tr><td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">SL-3015</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Acme Corp</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:center;">SHIPPING</td>'+
  '<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;text-align:right;font-weight:600;">$312.50</td></tr>'+
  '</tbody><tfoot><tr style="background-color:#f9f9f9;">'+
  '<td colspan="3" style="padding:10px;font-size:13px;font-weight:600;color:#333333;">Total</td>'+
  '<td style="padding:10px;font-size:15px;font-weight:700;color:#f59e0b;text-align:right;">$312.50</td>'+
  '</tr></tfoot></table>';

const SAMPLE_BROKER_DOCUMENT_LIST =
  '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dddddd;border-radius:4px;overflow:hidden;margin-top:12px;">'+
  '<thead><tr style="background-color:#f5f5f5;">'+
  '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Type</th>'+
  '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">File Name</th>'+
  '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Order / PO</th>'+
  '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Item</th>'+
  '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Customer</th>'+
  '<th style="padding:8px 12px;text-align:left;font-size:12px;color:#666666;font-weight:600;">Uploaded By</th>'+
  '<th style="padding:8px 12px;text-align:center;font-size:12px;color:#666666;font-weight:600;">Link</th>'+
  '</tr></thead><tbody>'+
  '<tr>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Bill of Lading</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">BOL_SL3015_2026.pdf</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">PO-2026-0041</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">SL-3015</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Acme Corp</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Brian M.</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;text-align:center;"><a href="#" style="color:#dc2626;text-decoration:none;font-weight:600;">View &rarr;</a></td>'+
  '</tr>'+
  '<tr>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Arrival Notice</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">arrival_FP2000.pdf</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">PO-2026-0039</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">FP-2000</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Globex Inc</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#333333;">Brian M.</td>'+
  '<td style="padding:9px 12px;border-bottom:1px solid #eeeeee;font-size:13px;text-align:center;"><a href="#" style="color:#dc2626;text-decoration:none;font-weight:600;">View &rarr;</a></td>'+
  '</tr>'+
  '</tbody></table>';

const DEFAULT_TEMPLATES = {
  // ---- Invoice Email ----
  invoice: {
    key: 'invoice', name: 'Invoice Email',
    description: 'Sent when an invoice is emailed to a customer. Includes PDF attachment.',
    category: 'invoicing',
    subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
    bodyContent:
      '<p>Dear {{customerFirstName}},</p>\n\n' +
      '<p>Please find attached your invoice <strong>{{invoiceNumber}}</strong>.</p>\n\n' +
      '<div class="info-box">\n' +
      '  <table width="100%" style="border-collapse: collapse;">\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Invoice Number:</strong></td><td style="padding: 8px 0; text-align: right;">{{invoiceNumber}}</td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Invoice Date:</strong></td><td style="padding: 8px 0; text-align: right;">{{invoiceDate}}</td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Due Date:</strong></td><td style="padding: 8px 0; text-align: right;">{{dueDate}}</td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Subtotal:</strong></td><td style="padding: 8px 0; text-align: right;">${{subtotal}}</td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Tax:</strong></td><td style="padding: 8px 0; text-align: right;">${{tax}}</td></tr>\n' +
      '    <tr><td colspan="2"><hr style="border: none; border-top: 1px solid #ddd;"></td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Amount Due:</strong></td><td style="padding: 8px 0; text-align: right;" class="total">${{balanceDue}}</td></tr>\n' +
      '  </table>\n</div>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n  <a href="{{payNowUrl}}" class="btn">Pay Now</a>\n  <a href="{{viewInvoiceUrl}}" class="btn btn-secondary">View Invoice</a>\n</p>\n\n' +
      '<p>If you have any questions about this invoice, please reply to this email.</p>',
    closingContent: '<p style="margin: 5px 0;">Best regards,</p>\n<p style="margin: 5px 0;"><strong>{{salesRepName}}</strong></p>\n{{signature}}',
    footerContent: '<p>{{companyName}}</p>\n<p>If you have questions, simply reply to this email.</p>',
    variables: [
      { name: 'customerFirstName', description: 'Customer first name' },
      { name: 'invoiceNumber',     description: 'Invoice number' },
      { name: 'invoiceDate',       description: 'Invoice date' },
      { name: 'dueDate',           description: 'Payment due date' },
      { name: 'subtotal',          description: 'Invoice subtotal' },
      { name: 'tax',               description: 'Tax amount' },
      { name: 'balanceDue',        description: 'Total balance due' },
      { name: 'payNowUrl',         description: 'Link to pay invoice online' },
      { name: 'viewInvoiceUrl',    description: 'Link to view invoice online' },
      { name: 'salesRepName',      description: 'Sales representative name' },
      { name: 'signature',         description: 'Sales rep email signature' },
      { name: 'companyName',       description: 'Company name' },
    ],
  },

  // ---- Estimate Email ----
  estimate: {
    key: 'estimate', name: 'Estimate Email',
    description: 'Sent when an estimate is emailed to a customer. Includes PDF attachment.',
    category: 'invoicing',
    subject: 'Estimate {{estimateNumber}} from {{companyName}}',
    bodyContent:
      '<p>Dear {{customerFirstName}},</p>\n\n' +
      '<p>Thank you for your interest! Please find attached your estimate <strong>{{estimateNumber}}</strong>.</p>\n\n' +
      '<div class="info-box">\n' +
      '  <table width="100%" style="border-collapse: collapse;">\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Estimate Number:</strong></td><td style="padding: 8px 0; text-align: right;">{{estimateNumber}}</td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Date:</strong></td><td style="padding: 8px 0; text-align: right;">{{estimateDate}}</td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Valid Until:</strong></td><td style="padding: 8px 0; text-align: right;">{{expiryDate}}</td></tr>\n' +
      '    <tr><td colspan="2"><hr style="border: none; border-top: 1px solid #ddd;"></td></tr>\n' +
      '    <tr><td style="padding: 8px 0;"><strong>Estimated Total:</strong></td><td style="padding: 8px 0; text-align: right;" class="total">${{total}}</td></tr>\n' +
      '  </table>\n</div>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n  <a href="{{viewEstimateUrl}}" class="btn">View Estimate</a>\n</p>\n\n' +
      '<p>This estimate is valid until <strong>{{expiryDate}}</strong>. If you have any questions, please reply to this email.</p>',
    closingContent: '<p style="margin: 5px 0;">Best regards,</p>\n<p style="margin: 5px 0;"><strong>{{salesRepName}}</strong></p>\n{{signature}}',
    footerContent: '<p>{{companyName}}</p>\n<p>If you have questions, simply reply to this email.</p>',
    variables: [
      { name: 'customerFirstName', description: 'Customer first name' },
      { name: 'estimateNumber',    description: 'Estimate number' },
      { name: 'estimateDate',      description: 'Estimate date' },
      { name: 'expiryDate',        description: 'Estimate expiry date' },
      { name: 'total',             description: 'Estimate total amount' },
      { name: 'viewEstimateUrl',   description: 'Link to view estimate online' },
      { name: 'salesRepName',      description: 'Sales representative name' },
      { name: 'signature',         description: 'Sales rep email signature' },
      { name: 'companyName',       description: 'Company name' },
    ],
  },

  // ---- Order Stage Update ----
  order_stage: {
    key: 'order_stage', name: 'Order Stage Update',
    description: 'Sent to customers when their order item moves to a new stage.',
    category: 'orders',
    subject: 'Order Update - {{stageDisplayName}}',
    bodyContent:
      '<p>Hello {{customerName}},</p>\n\n' +
      '<p>{{message}}</p>\n\n' +
      '<div class="info-box">\n' +
      '  <p style="margin: 0;"><strong>Order:</strong> #{{orderNumber}}</p>\n' +
      '  <p style="margin: 8px 0 0 0;"><strong>Item:</strong> {{productCode}}</p>\n' +
      '  <p style="margin: 8px 0 0 0;"><strong>Status:</strong> {{stageDisplayName}}</p>\n' +
      '</div>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n  <a href="{{trackingUrl}}" class="btn">Track Your Order</a>\n</p>\n\n' +
      '<p>If you have any questions, please contact your sales representative by replying to this email.</p>',
    closingContent: '',
    footerContent: '<p>{{companyName}}</p>\n<p>{{companyPhone}} | {{companyEmail}}</p>\n<p><a href="{{unsubscribeUrl}}">Unsubscribe from order updates</a></p>',
    variables: [
      { name: 'customerName',    description: 'Customer name' },
      { name: 'message',         description: 'Stage-specific message' },
      { name: 'orderNumber',     description: 'Order reference number' },
      { name: 'productCode',     description: 'Item product code' },
      { name: 'stageDisplayName',description: 'Human-readable stage name' },
      { name: 'trackingUrl',     description: 'Customer order tracking URL' },
      { name: 'unsubscribeUrl',  description: 'Unsubscribe link' },
      { name: 'companyName',     description: 'Company name' },
      { name: 'companyPhone',    description: 'Company phone' },
      { name: 'companyEmail',    description: 'Company email' },
    ],
  },

  // ---- Commission Notification (to agents) ----
  commission_notification: {
    key: 'commission_notification', name: 'Commission Notification',
    description: 'Internal email sent to sales agents when their commission payments are approved, paid, or denied.',
    category: 'internal',
    subject: 'Commission {{type}}: ${{amount}}',
    bodyContent:
      '<p>Hello {{agentName}},</p>\n\n' +
      '<p>The following commission payment(s) have been <strong>{{type}}</strong>:</p>\n\n' +
      '{{payoutDetails}}\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n  <a href="{{commissionsUrl}}" class="btn">View My Commissions</a>\n</p>',
    closingContent: '',
    footerContent: '<p>{{companyName}} \u2014 Internal Notification</p>',
    variables: [
      { name: 'agentName',      description: 'Sales agent name' },
      { name: 'type',           description: 'Event type: Approved, Paid, or Denied' },
      { name: 'amount',         description: 'Total commission amount for this agent' },
      { name: 'payoutCount',    description: 'Number of payouts in this notification' },
      { name: 'payoutDetails',  description: 'HTML table: Item | Customer | Stage | Amount (this agent\'s payouts only)' },
      { name: 'itemName',       description: 'Item product code (single-payout shortcut)' },
      { name: 'customerName',   description: 'Customer name (single-payout shortcut)' },
      { name: 'orderNumber',    description: 'Order PO number (single-payout shortcut)' },
      { name: 'payoutStage',    description: 'Payout trigger stage (single-payout shortcut)' },
      { name: 'commissionsUrl', description: 'Link to agent\'s commissions page' },
      { name: 'companyName',    description: 'Company name' },
      { name: 'companyPhone',   description: 'Company phone' },
      { name: 'companyEmail',   description: 'Company email' },
    ],
  },

  // ---- Pending Approval Notification (to admins/accountants) ----
  pending_approval_notification: {
    key: 'pending_approval_notification', name: 'Pending Commission Approval',
    description: 'Internal email sent to admins and accountants when a commission payout is triggered and requires approval.',
    category: 'internal',
    subject: 'Commission Approval Required \u2014 {{agentName}}',
    bodyContent:
      '<p>Hello {{adminName}},</p>\n\n' +
      '<p>A commission payout for <strong>{{agentName}}</strong> is awaiting your approval:</p>\n\n' +
      '{{payoutDetails}}\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n  <a href="{{approvalsUrl}}" class="btn">Review &amp; Approve</a>\n</p>',
    closingContent: '',
    footerContent: '<p>{{companyName}} \u2014 Internal Notification</p>',
    variables: [
      { name: 'adminName',      description: 'Name of the admin or accountant receiving the email' },
      { name: 'agentName',      description: 'Sales agent whose payout requires approval' },
      { name: 'amount',         description: 'Total amount awaiting approval' },
      { name: 'payoutCount',    description: 'Number of payouts in this notification' },
      { name: 'payoutDetails',  description: 'HTML table: Item | Customer | Stage | Amount' },
      { name: 'itemName',       description: 'Item product code (single-payout shortcut)' },
      { name: 'customerName',   description: 'Customer name' },
      { name: 'stage',          description: 'Trigger stage (single-payout shortcut)' },
      { name: 'approvalsUrl',   description: 'Link to commission approvals page' },
      { name: 'companyName',    description: 'Company name' },
      { name: 'companyPhone',   description: 'Company phone' },
      { name: 'companyEmail',   description: 'Company email' },
    ],
  },

  // ---- Customer Files Notification ----
  customer_files: {
    key: 'customer_files', name: 'Customer Files Notification',
    description: 'Sent to customers when new files (photos, videos, documents) are uploaded to their order.',
    category: 'documents',
    subject: 'New files are available for your order',
    bodyContent:
      '<p>Hello {{customerName}},</p>\n\n' +
      '<p>New files have been added to your order. You can now view and download them from your tracking page.</p>\n\n' +
      '<div class="info-box">\n' +
      '  <p style="margin: 0;"><strong>Order #{{orderNumber}}</strong></p>\n' +
      '  <p style="margin: 8px 0 0 0;">{{totalCount}} file(s) added</p>\n' +
      '</div>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n  <a href="{{trackingUrl}}" class="btn">View Your Files</a>\n</p>\n\n' +
      '<p>If you have any questions, please reply to this email.</p>',
    closingContent: '',
    footerContent: '<p>{{companyName}}</p>\n<p>{{companyPhone}} | {{companyEmail}}</p>',
    variables: [
      { name: 'customerName',  description: 'Customer contact name' },
      { name: 'orderNumber',   description: 'Order reference number' },
      { name: 'totalCount',    description: 'Total number of files uploaded' },
      { name: 'photoCount',    description: 'Number of photos' },
      { name: 'videoCount',    description: 'Number of videos' },
      { name: 'manualCount',   description: 'Number of manuals' },
      { name: 'documentCount', description: 'Number of documents' },
      { name: 'trackingUrl',   description: 'Link to customer tracking page' },
      { name: 'companyName',   description: 'Company name' },
      { name: 'companyPhone',  description: 'Company phone' },
      { name: 'companyEmail',  description: 'Company email' },
    ],
  },

  // ---- Broker Document Notification ----
  broker_document: {
    key: 'broker_document', name: 'Broker Document Notification',
    description: 'Internal email sent to broker users when documents are uploaded to the broker portal by internal staff. Multiple uploads within a 5-minute window are consolidated into a single digest email.',
    category: 'internal',
    subject: '{{documentCount}} New Document{{documentPlural}} Available \u2014 Broker Portal',
    bodyContent:
      '<p>Hello {{brokerName}},</p>\n\n' +
      '<p>{{documentCount}} new document{{documentPlural}} {{documentCountVerb}} been uploaded to the broker portal and {{documentCountVerb}} ready for your review.</p>\n\n' +
      '{{documentList}}\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n  <a href="{{portalUrl}}" class="btn">Open Broker Portal</a>\n</p>\n\n' +
      '<p>Use the View links in the table above to go directly to each item, or open the portal to see all pending shipments.</p>',
    closingContent: '',
    footerContent: '<p>{{companyName}} \u2014 Internal Notification</p>',
    variables: [
      { name: 'brokerName',        description: 'Name of the broker receiving this email' },
      { name: 'documentCount',     description: 'Number of documents in this notification (1 or more)' },
      { name: 'documentPlural',    description: 'Empty string when count is 1, "s" when multiple' },
      { name: 'documentCountVerb', description: '"has" when count is 1, "have" when multiple' },
      { name: 'documentList',      description: 'HTML table: Type | File Name | Order | Item | Customer | Uploaded By | View link' },
      { name: 'portalUrl',         description: 'Link to the broker portal' },
      { name: 'companyName',       description: 'Company name' },
      { name: 'companyPhone',      description: 'Company phone' },
      { name: 'companyEmail',      description: 'Company email' },
    ],
  },
};

const DEFAULT_STAGE_CONFIGS = {
  MANUFACTURING: { notify: true, subject: 'Your order is now in manufacturing',        message: 'Your item ({{productCode}}) has entered the manufacturing phase. We\'ll keep you updated as it progresses.' },
  TESTING:       { notify: true, subject: 'Your order is in debugging and testing',     message: 'Your item ({{productCode}}) has completed manufacturing and is now undergoing debugging and testing.' },
  SHIPPING:      { notify: true, subject: 'Your order is being prepared for shipment',  message: 'Your item ({{productCode}}) has passed testing and is now being loaded into the shipping container.' },
  AT_SEA:        { notify: true, subject: 'Your order has shipped!',                    message: 'Great news! Your item ({{productCode}}) is on its way. The shipping container is now in transit.' },
  SMT:           { notify: true, subject: 'Your order has arrived at our facility',     message: 'Your item ({{productCode}}) has arrived at our facility and will now go through quality control before delivery.' },
  QC:            { notify: true, subject: 'Your order is in quality control',           message: 'Your item ({{productCode}}) is currently going through our final quality control inspection before delivery.' },
  DELIVERED:     { notify: true, subject: 'Your order has been delivered!',             message: 'Your item ({{productCode}}) has been delivered. We hope you enjoy it!' },
};

// Friendly stage labels used in preview/test-send for the order_stage template
// AND in the production sender (orderStageEmailService.js) so customers see
// matching, human-friendly labels in both the preview and real emails.
const STAGE_DISPLAY_NAMES = {
  MANUFACTURING: 'Manufacturing',
  TESTING:       'Debugging & Testing',
  SHIPPING:      'Preparing Shipment',
  AT_SEA:        'Container At Sea',
  SMT:           'Arrived at SMT',
  QC:            'Quality Control',
  DELIVERED:     'Delivered',
};

// Resolve the stage-specific sample data used for previewing/testing the
// order_stage template. Pulls the user's customized config from
// prisma.emailStageConfig if present, otherwise falls back to the built-in
// DEFAULT_STAGE_CONFIGS. Substitutes {{productCode}} in the message and
// subject with the sample product code.
async function resolveStageSampleData(prisma, stage) {
  if (!stage || !DEFAULT_STAGE_CONFIGS[stage]) return null;
  let dbConfig = null;
  try {
    dbConfig = await prisma.emailStageConfig.findUnique({ where: { stage } });
  } catch (e) {
    // If the table is missing or the query fails, fall back to defaults silently.
    dbConfig = null;
  }
  const config = dbConfig || DEFAULT_STAGE_CONFIGS[stage];
  const sampleProductCode = 'SL-3015';
  const productCodeRegex = /\{\{productCode\}\}/g;
  return {
    stageDisplayName: STAGE_DISPLAY_NAMES[stage] || stage,
    message: (config.message || '').replace(productCodeRegex, sampleProductCode),
    stageSubject: (config.subject || '').replace(productCodeRegex, sampleProductCode),
  };
}

export function createEmailTemplateSettingsRouter(prisma) {
  const router = Router();

  router.get('/', adminGuard, async (req, res) => {
    try {
      const dbTemplates = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
      const dbMap = {};
      for (const t of dbTemplates) dbMap[t.templateKey] = t;
      const templates = Object.entries(DEFAULT_TEMPLATES).map(([key, defaultTpl]) => {
        const dbTpl = dbMap[key];
        if (dbTpl) return { ...defaultTpl, key: dbTpl.templateKey, subject: dbTpl.subject, bodyContent: dbTpl.bodyContent, closingContent: dbTpl.closingContent || '', footerContent: dbTpl.footerContent || '', isCustomized: true, lastUpdatedAt: dbTpl.updatedAt, lastUpdatedBy: dbTpl.updatedByName };
        return { ...defaultTpl, isCustomized: false };
      });
      res.json(templates);
    } catch (error) { console.error('Error fetching email templates:', error); res.status(500).json({ error: error.message }); }
  });

  router.get('/stages/config', adminGuard, async (req, res) => {
    try {
      const dbConfigs = await prisma.emailStageConfig.findMany({ orderBy: { stage: 'asc' } });
      const dbMap = {};
      for (const c of dbConfigs) dbMap[c.stage] = c;
      const stages = Object.entries(DEFAULT_STAGE_CONFIGS).map(([stage, defaults]) => {
        const dbConf = dbMap[stage];
        if (dbConf) return { stage, notify: dbConf.notify, subject: dbConf.subject, message: dbConf.message, isCustomized: true };
        return { stage, ...defaults, isCustomized: false };
      });
      res.json(stages);
    } catch (error) { console.error('Error fetching stage configs:', error); res.status(500).json({ error: error.message }); }
  });

  router.put('/stages/config', adminGuard, async (req, res) => {
    try {
      const { stages } = req.body;
      if (!Array.isArray(stages)) return res.status(400).json({ error: 'stages must be an array' });
      const results = [];
      for (const stageConf of stages) {
        const { stage, notify, subject, message } = stageConf;
        if (!DEFAULT_STAGE_CONFIGS[stage]) continue;
        const saved = await prisma.emailStageConfig.upsert({
          where: { stage },
          update: { notify: notify !== undefined ? notify : true, subject: subject || DEFAULT_STAGE_CONFIGS[stage].subject, message: message || DEFAULT_STAGE_CONFIGS[stage].message, updatedByName: req.user.name },
          create: { stage, notify: notify !== undefined ? notify : true, subject: subject || DEFAULT_STAGE_CONFIGS[stage].subject, message: message || DEFAULT_STAGE_CONFIGS[stage].message, updatedByName: req.user.name },
        });
        results.push(saved);
      }
      res.json({ success: true, updated: results.length });
    } catch (error) { console.error('Error saving stage configs:', error); res.status(500).json({ error: error.message }); }
  });

  router.get('/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      const defaultTpl = DEFAULT_TEMPLATES[key];
      if (!defaultTpl) return res.status(404).json({ error: 'Template not found' });
      const dbTpl = await prisma.emailTemplate.findUnique({ where: { templateKey: key } });
      if (dbTpl) return res.json({ ...defaultTpl, key: dbTpl.templateKey, subject: dbTpl.subject, bodyContent: dbTpl.bodyContent, closingContent: dbTpl.closingContent || '', footerContent: dbTpl.footerContent || '', isCustomized: true, lastUpdatedAt: dbTpl.updatedAt, lastUpdatedBy: dbTpl.updatedByName });
      res.json({ ...defaultTpl, isCustomized: false });
    } catch (error) { console.error('Error fetching email template:', error); res.status(500).json({ error: error.message }); }
  });

  router.put('/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      const { subject, bodyContent, closingContent, footerContent } = req.body;
      if (!DEFAULT_TEMPLATES[key]) return res.status(404).json({ error: 'Invalid template key' });
      if (!subject || !bodyContent) return res.status(400).json({ error: 'Subject and body content are required' });
      const template = await prisma.emailTemplate.upsert({
        where: { templateKey: key },
        update: { subject, bodyContent, closingContent: closingContent || '', footerContent: footerContent || '', updatedByUserId: req.user.userId, updatedByName: req.user.name },
        create: { templateKey: key, name: DEFAULT_TEMPLATES[key].name, category: DEFAULT_TEMPLATES[key].category, subject, bodyContent, closingContent: closingContent || '', footerContent: footerContent || '', updatedByUserId: req.user.userId, updatedByName: req.user.name },
      });
      res.json({ success: true, template: { ...DEFAULT_TEMPLATES[key], key: template.templateKey, subject: template.subject, bodyContent: template.bodyContent, closingContent: template.closingContent, footerContent: template.footerContent, isCustomized: true, lastUpdatedAt: template.updatedAt, lastUpdatedBy: template.updatedByName } });
    } catch (error) { console.error('Error saving email template:', error); res.status(500).json({ error: error.message }); }
  });

  router.delete('/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      if (!DEFAULT_TEMPLATES[key]) return res.status(404).json({ error: 'Invalid template key' });
      await prisma.emailTemplate.deleteMany({ where: { templateKey: key } });
      res.json({ success: true, message: 'Template "' + DEFAULT_TEMPLATES[key].name + '" reset to defaults', template: { ...DEFAULT_TEMPLATES[key], isCustomized: false } });
    } catch (error) { console.error('Error resetting email template:', error); res.status(500).json({ error: error.message }); }
  });

  router.post('/preview/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      const { subject, bodyContent, closingContent, footerContent } = req.body;
      if (!DEFAULT_TEMPLATES[key]) return res.status(404).json({ error: 'Invalid template key' });

      const company = await getCompanyInfo(prisma);
      const sampleData = {
        customerFirstName: 'John', customerName: 'John Smith',
        invoiceNumber: 'INV-2026-00042', invoiceDate: 'Feb 26, 2026', dueDate: 'Mar 28, 2026',
        subtotal: '12,500.00', tax: '1,031.25', balanceDue: '13,531.25',
        payNowUrl: '#', viewInvoiceUrl: '#',
        estimateNumber: 'EST-2026-00015', estimateDate: 'Feb 26, 2026', expiryDate: 'Mar 28, 2026',
        total: '12,500.00', viewEstimateUrl: '#',
        salesRepName: 'Jane Doe',
        signature: '<p style="color:#666;font-size:13px;">Jane Doe | Sales Manager<br>' + company.companyName + '</p>',
        companyName: company.companyName, companyPhone: company.companyPhone, companyEmail: company.companyEmail,
        orderNumber: 'A1B2C3D4', productCode: 'SL-3015',
        newStage: 'at_sea', stageDisplayName: 'Container At Sea',
        message: 'Great news! Your item (SL-3015) is on its way.',
        trackingUrl: '#', unsubscribeUrl: '#',
        // Agent commission vars
        agentName: 'Bob Agent', type: 'Approved',
        amount: '625.00', payoutCount: '2',
        itemName: 'SL-3015', payoutStage: 'SHIPPING',
        payoutDetails: SAMPLE_PAYOUT_DETAILS,
        commissionsUrl: 'https://smt-orders.com/my-commissions',
        // Admin approval vars
        adminName: 'Admin User',
        approvalsUrl: 'https://smt-orders.com/admin/commissions',
        stage: 'SHIPPING',
        // customer_files vars
        totalCount: '3', photoCount: '2', videoCount: '1', manualCount: '0', documentCount: '0',
        // broker_document vars (defaults; overridden below for broker_document key)
        brokerName: 'Alex Broker', documentPlural: 's', documentCountVerb: 'have',
        documentList: SAMPLE_BROKER_DOCUMENT_LIST,
        portalUrl: 'https://smt-orders.com/broker',
      };
      if (key === 'pending_approval_notification') sampleData.payoutDetails = SAMPLE_APPROVAL_DETAILS;
      if (key === 'broker_document') sampleData.documentCount = '2';
      else sampleData.documentCount = sampleData.documentCount || '0'; // preserve customer_files value

      // Stage-specific override for the order_stage template. If a `stage`
      // is provided in the request body, swap in that stage's display name
      // and message before substitution. This lets users preview each of
      // the 7 stages instead of always seeing AT_SEA.
      if (key === 'order_stage' && req.body.stage) {
        const stageInfo = await resolveStageSampleData(prisma, req.body.stage);
        if (stageInfo) {
          sampleData.stageDisplayName = stageInfo.stageDisplayName;
          sampleData.message = stageInfo.message;
          sampleData.newStage = String(req.body.stage).toLowerCase();
        }
      }

      let processedSubject = subject || '';
      let processedBody    = bodyContent || '';
      let processedClosing = closingContent || '';
      let processedFooter  = footerContent || '';
      for (const [varName, value] of Object.entries(sampleData)) {
        const regex = new RegExp('\\{\\{' + varName + '\\}\\}', 'g');
        processedSubject = processedSubject.replace(regex, value);
        processedBody    = processedBody.replace(regex, value);
        processedClosing = processedClosing.replace(regex, value);
        processedFooter  = processedFooter.replace(regex, value);
      }
      res.json({ subject: processedSubject, bodyContent: processedBody, closingContent: processedClosing, footerContent: processedFooter });
    } catch (error) { console.error('Error generating preview:', error); res.status(500).json({ error: error.message }); }
  });

  router.post('/test-send', adminGuard, async (req, res) => {
    try {
      const { templateKey, toEmail } = req.body;
      if (!templateKey || !toEmail) return res.status(400).json({ error: 'templateKey and toEmail are required' });
      const emailServiceModule = await import('../services/emailService.js');
      const emailService = emailServiceModule.default || emailServiceModule;
      const defaultTpl = DEFAULT_TEMPLATES[templateKey];
      if (!defaultTpl) return res.status(404).json({ error: 'Template not found' });
      const dbTpl = await prisma.emailTemplate.findUnique({ where: { templateKey } });
      const tpl = dbTpl || defaultTpl;
      const company = await getCompanyInfo(prisma);

      const sampleData = {
        customerFirstName: 'Test', customerName: 'Test Customer',
        invoiceNumber: 'INV-TEST-00001', invoiceDate: new Date().toLocaleDateString(),
        dueDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString(),
        subtotal: '10,000.00', tax: '825.00', balanceDue: '10,825.00',
        payNowUrl: '#', viewInvoiceUrl: '#',
        estimateNumber: 'EST-TEST-00001', estimateDate: new Date().toLocaleDateString(),
        expiryDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString(),
        total: '10,000.00', viewEstimateUrl: '#',
        salesRepName: req.user.name, signature: '',
        companyName: company.companyName, companyPhone: company.companyPhone, companyEmail: company.companyEmail,
        orderNumber: 'TEST1234', productCode: 'SL-3015',
        newStage: 'shipping', stageDisplayName: 'Preparing Shipment',
        message: 'This is a test email. Your item (SL-3015) is being prepared for shipment.',
        trackingUrl: '#', unsubscribeUrl: '#',
        // Agent commission vars
        agentName: 'Bob Agent', type: 'Approved',
        amount: '625.00', payoutCount: '2',
        itemName: 'SL-3015', payoutStage: 'SHIPPING',
        payoutDetails: SAMPLE_PAYOUT_DETAILS,
        commissionsUrl: 'https://smt-orders.com/my-commissions',
        // Admin approval vars
        adminName: req.user.name,
        approvalsUrl: 'https://smt-orders.com/admin/commissions',
        stage: 'SHIPPING',
        // customer_files vars
        totalCount: '3', photoCount: '2', videoCount: '1', manualCount: '0', documentCount: '0',
        // broker_document vars
        brokerName: 'Test Broker', documentPlural: 's', documentCountVerb: 'have',
        documentList: SAMPLE_BROKER_DOCUMENT_LIST,
        portalUrl: 'https://smt-orders.com/broker',
      };
      if (templateKey === 'pending_approval_notification') sampleData.payoutDetails = SAMPLE_APPROVAL_DETAILS;
      if (templateKey === 'broker_document') sampleData.documentCount = '2';
      else sampleData.documentCount = sampleData.documentCount || '0';

      // Stage-specific override for order_stage test sends. Same logic as preview.
      if (templateKey === 'order_stage' && req.body.stage) {
        const stageInfo = await resolveStageSampleData(prisma, req.body.stage);
        if (stageInfo) {
          sampleData.stageDisplayName = stageInfo.stageDisplayName;
          sampleData.message = stageInfo.message;
          sampleData.newStage = String(req.body.stage).toLowerCase();
        }
      }

      let subject = tpl.subject || defaultTpl.subject;
      let body    = tpl.bodyContent || defaultTpl.bodyContent;
      for (const [varName, value] of Object.entries(sampleData)) {
        const regex = new RegExp('\\{\\{' + varName + '\\}\\}', 'g');
        subject = subject.replace(regex, value);
        body    = body.replace(regex, value);
      }

      const html =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
        'body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f5f5f5;}' +
        '.container{max-width:600px;margin:0 auto;background:white;}' +
        '.header{background:#dc2626;color:white;padding:20px;text-align:center;}' +
        '.header h1{margin:0;font-size:24px;}' +
        '.content{padding:30px;}' +
        '.info-box{background:#f9f9f9;border:1px solid #ddd;padding:20px;margin:20px 0;border-radius:4px;}' +
        '.total{font-size:24px;font-weight:bold;color:#dc2626;}' +
        '.btn{display:inline-block;background:#dc2626;color:white!important;padding:12px 30px;text-decoration:none;border-radius:5px;margin:10px 5px;font-weight:bold;}' +
        '.btn-secondary{background:#333;}' +
        '.footer{text-align:center;padding:20px;color:#666;font-size:12px;background:#f5f5f5;}' +
        '</style></head><body>' +
        '<div class="container">' +
        '<div class="header"><h1>[TEST] ' + subject + '</h1></div>' +
        '<div class="content">' + body + '</div>' +
        '<div class="footer"><p>' + company.companyName + ' - Test Email</p></div>' +
        '</div></body></html>';

      const fromEmail = process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';
      const result = await emailService.sendEmail({ to: toEmail, from: fromEmail, fromName: company.companyName, subject: '[TEST] ' + subject, html });
      res.json({ success: result.success, message: result.success ? 'Test email sent to ' + toEmail : 'Failed to send: ' + result.error });
    } catch (error) { console.error('Error sending test email:', error); res.status(500).json({ error: error.message }); }
  });

  return router;
}

export { DEFAULT_TEMPLATES, DEFAULT_STAGE_CONFIGS, STAGE_DISPLAY_NAMES };
export default createEmailTemplateSettingsRouter;
