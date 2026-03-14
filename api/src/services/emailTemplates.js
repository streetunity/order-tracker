/**
 * Email Templates
 * All templates are pure JS functions that accept data objects and return HTML.
 * All CSS is fully inlined (Gmail/Outlook strip <style> blocks).
 *
 * Key email client fixes applied:
 * - color-scheme: light forces Outlook/webmail out of dark-mode colour shifting
 * - Logo uses explicit height="60" HTML attribute (CSS max-height ignored by most clients)
 * - Logo header is white with red bottom border (logo PNG has white background)
 */

const RED    = '#dc2626';
const LIGHT  = '#f5f5f5';
const BORDER = '#dddddd';
const MUTED  = '#666666';

function buildHeader(companyName, logoUrl) {
  if (logoUrl) {
    // White cell + red bottom border — works with white-background logos.
    // height="60" is the HTML attribute email clients actually respect.
    return `
    <tr><td style="background-color:#ffffff;padding:16px 30px;text-align:center;border-bottom:4px solid ${RED};">
      <img src="${logoUrl}" alt="${companyName}" height="60" style="height:60px;width:auto;display:inline-block;border:0;outline:none;" />
    </td></tr>`;
  }
  // Fallback: red bar with white company name text
  return `
    <tr><td style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${companyName}</h1>
    </td></tr>`;
}

function wrapInBaseTemplate(content, preheaderText = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Force light-mode rendering in Outlook and webmail dark-mode -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Stealth Machine Tools</title>
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT};font-family:Arial,Helvetica,sans-serif;color-scheme:light;">
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
    logoUrl           = null,
    customMessage     = '',
    viewEstimateUrl   = '',
  } = data;

  return wrapInBaseTemplate(`
    ${buildHeader(companyName, logoUrl)}

    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Dear ${customerFirstName},</p>
      <p style="margin:0 0 16px 0;">Thank you for your interest! Please find attached your estimate <strong>${estimateNumber}</strong>.</p>

      ${customMessage ? `
      <div style="margin:0 0 20px 0;padding:16px 20px;background-color:#f9f9f9;border-left:4px solid ${RED};border-radius:0 4px 4px 0;font-size:14px;color:#333333;">
        ${customMessage}
      </div>` : ''}

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

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          <a href="${viewEstimateUrl}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:5px;font-weight:700;font-size:14px;">View Estimate</a>
        </td></tr>
      </table>

      <p style="margin:0 0 16px 0;font-size:14px;color:#555555;">This estimate is valid until <strong>${expiryDate}</strong>. If you have any questions or would like to proceed, please reply to this email.</p>

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${BORDER};">
        <p style="margin:0 0 4px 0;font-size:14px;color:#333333;">Best regards,</p>
        <p style="margin:0;font-size:14px;color:#111111;"><strong>${salesRepName}</strong></p>
        ${salesRepPhone ? `<p style="margin:4px 0 0 0;font-size:13px;color:${MUTED};">${salesRepPhone}</p>` : ''}
        ${signature    ? `<div style="margin-top:8px;font-size:13px;color:#555555;">${signature}</div>` : ''}
      </div>
    </td></tr>

    <tr><td style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">${companyName}</p>
      <p style="margin:0;font-size:12px;color:${MUTED};">If you have questions, simply reply to this email.</p>
    </td></tr>
  `, `Estimate ${estimateNumber} \u2014 Total: \$${total}`);
}

/**
 * Invoice Email Template
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
    logoUrl           = null,
    customMessage     = '',
    viewInvoiceUrl    = '',
    payNowUrl         = '',
  } = data;

  return wrapInBaseTemplate(`
    ${buildHeader(companyName, logoUrl)}

    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Dear ${customerFirstName},</p>
      <p style="margin:0 0 16px 0;">Please find attached your invoice <strong>${invoiceNumber}</strong>.</p>

      ${customMessage ? `
      <div style="margin:0 0 20px 0;padding:16px 20px;background-color:#f9f9f9;border-left:4px solid ${RED};border-radius:0 4px 4px 0;font-size:14px;color:#333333;">
        ${customMessage}
      </div>` : ''}

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

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          ${payNowUrl     ? `<a href="${payNowUrl}"     style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;margin:0 6px;">Pay Now</a>` : ''}
          ${viewInvoiceUrl? `<a href="${viewInvoiceUrl}" style="display:inline-block;background-color:#444444;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;margin:0 6px;">View Invoice</a>` : ''}
        </td></tr>
      </table>

      <p style="margin:0 0 16px 0;font-size:14px;color:#555555;">If you have any questions about this invoice, please reply to this email.</p>

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${BORDER};">
        <p style="margin:0 0 4px 0;font-size:14px;color:#333333;">Best regards,</p>
        <p style="margin:0;font-size:14px;color:#111111;"><strong>${salesRepName}</strong></p>
        ${salesRepPhone ? `<p style="margin:4px 0 0 0;font-size:13px;color:${MUTED};">${salesRepPhone}</p>` : ''}
        ${signature    ? `<div style="margin-top:8px;font-size:13px;color:#555555;">${signature}</div>` : ''}
      </div>
    </td></tr>

    <tr><td style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">${companyName}</p>
      <p style="margin:0;font-size:12px;color:${MUTED};">If you have questions, simply reply to this email.</p>
    </td></tr>
  `, `Invoice ${invoiceNumber} \u2014 Amount Due: \$${balanceDue}`);
}

/**
 * Order Stage Update Email Template
 */
export function getOrderStageEmailTemplate() {
  return wrapInBaseTemplate(`
    <tr><td style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Order Update</h1>
    </td></tr>
    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Hello {{customerName}},</p>
      <p style="margin:0 0 16px 0;">{{message}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td style="padding:20px;font-size:14px;">
          <p style="margin:0 0 8px 0;"><strong>Order:</strong> #{{orderNumber}}</p>
          <p style="margin:0 0 8px 0;"><strong>Item:</strong> {{productCode}}</p>
          <p style="margin:0;"><strong>Status:</strong> {{stageDisplayName}}</p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          <a href="{{trackingUrl}}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;">Track Your Order</a>
        </td></tr>
      </table>
      <p style="font-size:14px;color:#555555;">If you have any questions, please contact your sales representative by replying to this email.</p>
    </td></tr>
    <tr><td style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">{{companyName}}</p>
      <p style="margin:0;font-size:12px;color:${MUTED};">{{companyPhone}} | {{companyEmail}}</p>
    </td></tr>
  `, 'Order #{{orderNumber}} Status: {{stageDisplayName}}');
}

/**
 * Commission Notification Template (Internal)
 */
export function getCommissionNotificationTemplate() {
  return wrapInBaseTemplate(`
    <tr><td style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Commission {{type}}</h1>
    </td></tr>
    <tr><td style="padding:30px;color:#333333;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px 0;">Hello {{agentName}},</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td style="padding:24px;text-align:center;">
          <p style="margin:0;font-size:32px;font-weight:700;color:#22c55e;">${{amount}}</p>
          <p style="margin:8px 0 0 0;font-size:13px;color:${MUTED};">Commission Amount</p>
        </td></tr>
      </table>
      <p style="margin:0 0 8px 0;font-size:14px;"><strong>Order:</strong> #{{orderNumber}}</p>
      <p style="margin:0 0 8px 0;font-size:14px;"><strong>Customer:</strong> {{customerName}}</p>
      <p style="margin:0 0 20px 0;font-size:14px;"><strong>Stage:</strong> {{payoutStage}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
        <tr><td align="center">
          <a href="{{commissionsUrl}}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;">View My Commissions</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0;font-size:12px;color:${MUTED};">{{companyName}} \u2014 Internal Notification</p>
    </td></tr>
  `, 'Commission {{type}}: \${{amount}}');
}

export { wrapInBaseTemplate };
