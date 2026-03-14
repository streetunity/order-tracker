/**
 * Email Templates
 * All templates are pure JavaScript functions that accept data objects
 * and return fully-rendered HTML strings.
 *
 * NO runtime template substitution (no {{}} syntax) — all values are
 * interpolated directly via JS template literals so there is no risk
 * of regex mismatches, missing conditionals, or variable substitution bugs.
 *
 * All CSS is fully inlined. Gmail / Outlook strip <style> blocks.
 */

const RED    = '#cc0000';   // vivid brand red (brighter than #dc2626 for email)
const LIGHT  = '#f5f5f5';
const BORDER = '#dddddd';
const MUTED  = '#666666';

function wrapInBaseTemplate(content, preheaderText = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stealth Machine Tools</title>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT};font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheaderText}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT};">
    <tr><td align="center" style="padding:20px 10px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;">
        ${content}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Estimate Email Template
 * @param {Object} data
 */
export function getEstimateEmailTemplate(data) {
  const {
    customerFirstName = 'Customer',
    estimateNumber    = '',
    estimateDate      = '',
    expiryDate        = 'N/A',
    total             = '0.00',
    salesRepName      = 'Sales Team',
    salesRepPhone     = '',
    signature         = '',
    companyName       = 'Stealth Machine Tools',
    customMessage     = '',
    viewEstimateUrl   = '',
  } = data;

  return wrapInBaseTemplate(`
    <!-- Header -->
    <tr><td style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${companyName}</h1>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Dear ${customerFirstName},</p>
      <p style="margin:0 0 16px 0;">Thank you for your interest! Please find attached your estimate <strong>${estimateNumber}</strong>.</p>

      ${customMessage ? `
      <div style="margin:0 0 20px 0;padding:16px 20px;background-color:#f9f9f9;border-left:4px solid ${RED};border-radius:0 4px 4px 0;font-size:14px;color:#333333;">
        ${customMessage}
      </div>` : ''}

      <!-- Info box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td style="padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333333;"><strong>Estimate Number:</strong></td>
              <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${estimateNumber}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333333;"><strong>Date:</strong></td>
              <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${estimateDate}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333333;"><strong>Valid Until:</strong></td>
              <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${expiryDate}</td>
            </tr>
            <tr><td colspan="2" style="padding:4px 0;"><hr style="border:none;border-top:1px solid ${BORDER};margin:0;"></td></tr>
            <tr>
              <td style="padding:10px 0 0 0;font-size:15px;color:#333333;"><strong>Estimated Total:</strong></td>
              <td style="padding:10px 0 0 0;font-size:22px;font-weight:700;color:${RED};text-align:right;">$${total}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <!-- CTA button -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          <a href="${viewEstimateUrl}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:5px;font-weight:700;font-size:14px;">View Estimate</a>
        </td></tr>
      </table>

      <p style="margin:0 0 16px 0;font-size:14px;color:#555555;">This estimate is valid until <strong>${expiryDate}</strong>. If you have any questions or would like to proceed, please reply to this email.</p>

      <!-- Signature -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${BORDER};">
        <p style="margin:0 0 4px 0;font-size:14px;">Best regards,</p>
        <p style="margin:0;font-size:14px;"><strong>${salesRepName}</strong></p>
        ${salesRepPhone ? `<p style="margin:4px 0 0 0;font-size:13px;color:${MUTED};">${salesRepPhone}</p>` : ''}
        ${signature    ? `<div style="margin-top:8px;font-size:13px;color:#555555;">${signature}</div>` : ''}
      </div>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">${companyName}</p>
      <p style="margin:0;font-size:12px;color:${MUTED};">If you have questions, simply reply to this email.</p>
    </td></tr>
  `, `Estimate ${estimateNumber} \u2014 Total: $${total}`);
}

/**
 * Invoice Email Template
 * @param {Object} data
 */
export function getInvoiceEmailTemplate(data) {
  const {
    customerFirstName = 'Customer',
    invoiceNumber     = '',
    invoiceDate       = '',
    dueDate           = 'N/A',
    balanceDue        = '0.00',
    salesRepName      = 'Sales Team',
    salesRepPhone     = '',
    signature         = '',
    companyName       = 'Stealth Machine Tools',
    customMessage     = '',
    viewInvoiceUrl    = '',
    payNowUrl         = '',
  } = data;

  return wrapInBaseTemplate(`
    <!-- Header -->
    <tr><td style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${companyName}</h1>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Dear ${customerFirstName},</p>
      <p style="margin:0 0 16px 0;">Please find attached your invoice <strong>${invoiceNumber}</strong>.</p>

      ${customMessage ? `
      <div style="margin:0 0 20px 0;padding:16px 20px;background-color:#f9f9f9;border-left:4px solid ${RED};border-radius:0 4px 4px 0;font-size:14px;color:#333333;">
        ${customMessage}
      </div>` : ''}

      <!-- Info box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td style="padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333333;"><strong>Invoice Number:</strong></td>
              <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333333;"><strong>Invoice Date:</strong></td>
              <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${invoiceDate}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333333;"><strong>Due Date:</strong></td>
              <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${dueDate}</td>
            </tr>
            <tr><td colspan="2" style="padding:4px 0;"><hr style="border:none;border-top:1px solid ${BORDER};margin:0;"></td></tr>
            <tr>
              <td style="padding:10px 0 0 0;font-size:15px;color:#333333;"><strong>Amount Due:</strong></td>
              <td style="padding:10px 0 0 0;font-size:22px;font-weight:700;color:${RED};text-align:right;">$${balanceDue}</td>
            </tr>
          </table>
        </td></tr>
      </table>

      <!-- CTA buttons -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          ${payNowUrl    ? `<a href="${payNowUrl}"    style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;margin:0 6px;">Pay Now</a>` : ''}
          ${viewInvoiceUrl ? `<a href="${viewInvoiceUrl}" style="display:inline-block;background-color:#444444;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;margin:0 6px;">View Invoice</a>` : ''}
        </td></tr>
      </table>

      <p style="margin:0 0 16px 0;font-size:14px;color:#555555;">If you have any questions about this invoice, please reply to this email.</p>

      <!-- Signature -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${BORDER};">
        <p style="margin:0 0 4px 0;font-size:14px;">Best regards,</p>
        <p style="margin:0;font-size:14px;"><strong>${salesRepName}</strong></p>
        ${salesRepPhone ? `<p style="margin:4px 0 0 0;font-size:13px;color:${MUTED};">${salesRepPhone}</p>` : ''}
        ${signature    ? `<div style="margin-top:8px;font-size:13px;color:#555555;">${signature}</div>` : ''}
      </div>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">${companyName}</p>
      <p style="margin:0;font-size:12px;color:${MUTED};">If you have questions, simply reply to this email.</p>
    </td></tr>
  `, `Invoice ${invoiceNumber} \u2014 Amount Due: $${balanceDue}`);
}

/**
 * Order Stage Update Email Template
 * Still uses {{}} substitution (unchanged).
 */
export function getOrderStageEmailTemplate() {
  const RED2 = '#cc0000';
  return wrapInBaseTemplate(`
    <tr><td style="background-color:${RED2};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Order Update</h1>
    </td></tr>
    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Hello {{customerName}},</p>
      <p style="margin:0 0 16px 0;">{{message}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f9f9f9;border:1px solid #dddddd;border-radius:4px;">
        <tr><td style="padding:20px;font-size:14px;">
          <p style="margin:0 0 8px 0;"><strong>Order:</strong> #{{orderNumber}}</p>
          <p style="margin:0 0 8px 0;"><strong>Item:</strong> {{productCode}}</p>
          <p style="margin:0;"><strong>Status:</strong> {{stageDisplayName}}</p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          <a href="{{trackingUrl}}" style="display:inline-block;background-color:${RED2};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;">Track Your Order</a>
        </td></tr>
      </table>
      <p style="font-size:14px;color:#555555;">If you have any questions, please contact your sales representative by replying to this email.</p>
    </td></tr>
    <tr><td style="background-color:#f5f5f5;padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:#666666;">{{companyName}}</p>
      <p style="margin:0;font-size:12px;color:#666666;">{{companyPhone}} | {{companyEmail}}</p>
    </td></tr>
  `, 'Order #{{orderNumber}} Status: {{stageDisplayName}}');
}

/**
 * Commission Notification Template (Internal)
 * Still uses {{}} substitution (unchanged).
 */
export function getCommissionNotificationTemplate() {
  const RED2 = '#cc0000';
  return wrapInBaseTemplate(`
    <tr><td style="background-color:${RED2};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Commission {{type}}</h1>
    </td></tr>
    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Hello {{agentName}},</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f9f9f9;border:1px solid #dddddd;border-radius:4px;">
        <tr><td style="padding:24px;text-align:center;">
          <p style="margin:0;font-size:32px;font-weight:700;color:#22c55e;">${{amount}}</p>
          <p style="margin:8px 0 0 0;font-size:13px;color:#666666;">Commission Amount</p>
        </td></tr>
      </table>
      <p style="margin:0 0 8px 0;font-size:14px;"><strong>Order:</strong> #{{orderNumber}}</p>
      <p style="margin:0 0 8px 0;font-size:14px;"><strong>Customer:</strong> {{customerName}}</p>
      <p style="margin:0 0 20px 0;font-size:14px;"><strong>Stage:</strong> {{payoutStage}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
        <tr><td align="center">
          <a href="{{commissionsUrl}}" style="display:inline-block;background-color:${RED2};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;">View My Commissions</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background-color:#f5f5f5;padding:20px 30px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#666666;">{{companyName}} \u2014 Internal Notification</p>
    </td></tr>
  `, 'Commission {{type}}: ${{amount}}');
}

export { wrapInBaseTemplate };
