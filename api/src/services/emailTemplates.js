/**
 * Email Templates
 * All templates are pure JS functions that accept data objects and return HTML.
 *
 * Rendering engine notes:
 * - Desktop Outlook : Word engine — use bgcolor HTML attrs on <tr> AND <td>,
 *                     mso-padding-alt (with real values, never 0) to pass
 *                     padding through to inner <a> elements, mso-color-alt
 *                     for text colours. [data-ogsc] overrides for dark mode.
 * - Gmail           : strips <style> blocks — 100% inline styles required.
 *                     NO conditional comments needed; table-cell buttons work.
 * - Mobile Outlook  : WebView, respects color-scheme:light meta tag.
 *
 * Button pattern (works in all clients):
 *   <tr bgcolor="COLOR"><td mso-padding-alt:Xpx Ypx>
 *     <a padding:Xpx Ypx>Label</a>
 *   </td></tr>
 *   - bgcolor on <tr> AND <td> = Outlook Word engine
 *   - mso-padding-alt with real values (NOT 0!) lets Outlook respect <a> padding
 *   - <a> padding = Gmail/Apple Mail/mobile
 *
 * Logo header pattern:
 *   bgcolor="#000000" on both <tr> and <td> = forces black in all Outlook versions
 *
 * Brand red: #dc2626
 */

const RED    = '#dc2626';
const LIGHT  = '#f5f5f5';
const BORDER = '#dddddd';
const MUTED  = '#666666';

function buildHeader(companyName, logoUrl) {
  if (logoUrl) {
    // bgcolor on BOTH <tr> and <td> — Outlook Word engine sometimes inherits
    // the parent table bgcolor onto child cells; setting both prevents that.
    return `
    <tr bgcolor="#000000">
      <td class="logo-td" bgcolor="#000000" style="background-color:#000000;padding:20px 30px;text-align:center;border-bottom:4px solid ${RED};">
        <img src="${logoUrl}" alt="${companyName}" height="60" width="auto" style="height:60px;width:auto;display:inline-block;border:0;outline:none;" />
      </td>
    </tr>`;
  }
  return `
    <tr bgcolor="${RED}">
      <td class="header-td" bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;mso-color-alt:#ffffff;font-family:Arial,Helvetica,sans-serif;">${companyName}</h1>
      </td>
    </tr>`;
}

// Table-cell button — works in Outlook, Gmail, Apple Mail, mobile.
// Key: mso-padding-alt on <td> must match the <a> padding exactly.
// NEVER use mso-padding-alt:0 — that zeroes out padding in Outlook.
function button(href, label, bgColor = RED) {
  return `<table cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
    <tr bgcolor="${bgColor}">
      <td align="center" bgcolor="${bgColor}" style="background-color:${bgColor};border-radius:5px;mso-padding-alt:12px 28px;">
        <a href="${href}" style="display:inline-block;background-color:${bgColor};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;font-family:Arial,Helvetica,sans-serif;mso-color-alt:#ffffff;white-space:nowrap;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function totalAmountCell(amount) {
  return `<td class="total-amount" style="padding:10px 0 0 0;font-size:22px;font-weight:700;color:${RED};mso-color-alt:${RED};text-align:right;">$${amount}</td>`;
}

function wrapInBaseTemplate(content, preheaderText = '') {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Stealth Machine Tools</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style type="text/css">
    :root { color-scheme: light; supported-color-schemes: light; }
    /* Outlook dark mode overrides — named classes only, never wildcard td */
    [data-ogsc] body,  [data-ogsb] body  { background-color: ${LIGHT}  !important; }
    [data-ogsc] .email-outer-table       { background-color: ${LIGHT}  !important; }
    [data-ogsc] .email-inner-table       { background-color: #ffffff   !important; }
    [data-ogsc] .email-body-td           { background-color: #ffffff   !important; color: #333333 !important; }
    [data-ogsc] .info-box-td             { background-color: #f9f9f9   !important; }
    [data-ogsc] .footer-td               { background-color: ${LIGHT}  !important; color: ${MUTED} !important; }
    [data-ogsc] .custom-msg-div          { background-color: #f9f9f9   !important; color: #333333 !important; }
    [data-ogsc] .logo-td                 { background-color: #000000   !important; }
    [data-ogsc] .header-td               { background-color: ${RED}    !important; }
    [data-ogsc] .total-amount            { color: ${RED} !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT};font-family:Arial,Helvetica,sans-serif;" bgcolor="${LIGHT}">
  <div style="display:none;max-height:0;overflow:hidden;">${preheaderText}&nbsp;</div>
  <table class="email-outer-table" width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIGHT}" style="background-color:${LIGHT};">
    <tr><td align="center" style="padding:20px 10px;">
      <table class="email-inner-table" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;">
        ${content}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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
    <tr>
      <td class="email-body-td" bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
        <p style="margin:0 0 16px 0;color:#333333;">Dear ${customerFirstName},</p>
        <p style="margin:0 0 16px 0;color:#333333;">Thank you for your interest! Please find attached your estimate <strong style="color:#111111;">${estimateNumber}</strong>.</p>

        ${customMessage ? `
        <div class="custom-msg-div" style="margin:0 0 20px 0;padding:16px 20px;background-color:#f9f9f9;border-left:4px solid ${RED};border-radius:0 4px 4px 0;font-size:14px;color:#333333;">
          ${customMessage}
        </div>` : ''}

        <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
          <tr><td class="info-box-td" bgcolor="#f9f9f9" style="padding:20px;background-color:#f9f9f9;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;font-size:14px;color:#333333;"><strong style="color:#111111;">Estimate Number:</strong></td>
                <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${estimateNumber}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:14px;color:#333333;"><strong style="color:#111111;">Date:</strong></td>
                <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${estimateDate}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:14px;color:#333333;"><strong style="color:#111111;">Valid Until:</strong></td>
                <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${expiryDate}</td>
              </tr>
              <tr><td colspan="2" style="padding:4px 0;"><hr style="border:none;border-top:1px solid ${BORDER};margin:0;"></td></tr>
              <tr>
                <td style="padding:10px 0 0 0;font-size:15px;color:#333333;"><strong style="color:#111111;">Estimated Total:</strong></td>
                ${totalAmountCell(total)}
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr><td align="center">
            ${button(viewEstimateUrl, 'View Estimate')}
          </td></tr>
        </table>

        <p style="margin:0 0 16px 0;font-size:14px;color:#555555;">This estimate is valid until <strong style="color:#333333;">${expiryDate}</strong>. If you have any questions or would like to proceed, please reply to this email.</p>

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${BORDER};">
          <p style="margin:0 0 4px 0;font-size:14px;color:#333333;">Best regards,</p>
          <p style="margin:0;font-size:14px;color:#111111;"><strong>${salesRepName}</strong></p>
          ${salesRepPhone ? `<p style="margin:4px 0 0 0;font-size:13px;color:${MUTED};">${salesRepPhone}</p>` : ''}
          ${signature    ? `<div style="margin-top:8px;font-size:13px;color:#555555;">${signature}</div>` : ''}
        </div>
      </td>
    </tr>
    <tr>
      <td class="footer-td" bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
        <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">${companyName}</p>
        <p style="margin:0;font-size:12px;color:${MUTED};">If you have questions, simply reply to this email.</p>
      </td>
    </tr>
  `, `Estimate ${estimateNumber} \u2014 Total: $${total}`);
}

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

  // Side-by-side buttons using a 2-cell table row (no flexbox — not supported in email)
  const buttonRow = (payNowUrl || viewInvoiceUrl) ? `
    <table cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
      <tr>
        ${payNowUrl ? `<td style="padding:0 6px 0 0;">
          ${button(payNowUrl, 'Pay Now', RED)}
        </td>` : ''}
        ${viewInvoiceUrl ? `<td style="padding:0 0 0 ${payNowUrl ? '6' : '0'}px;">
          ${button(viewInvoiceUrl, 'View Invoice', '#444444')}
        </td>` : ''}
      </tr>
    </table>` : '';

  return wrapInBaseTemplate(`
    ${buildHeader(companyName, logoUrl)}
    <tr>
      <td class="email-body-td" bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
        <p style="margin:0 0 16px 0;color:#333333;">Dear ${customerFirstName},</p>
        <p style="margin:0 0 16px 0;color:#333333;">Please find attached your invoice <strong style="color:#111111;">${invoiceNumber}</strong>.</p>

        ${customMessage ? `
        <div class="custom-msg-div" style="margin:0 0 20px 0;padding:16px 20px;background-color:#f9f9f9;border-left:4px solid ${RED};border-radius:0 4px 4px 0;font-size:14px;color:#333333;">
          ${customMessage}
        </div>` : ''}

        <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
          <tr><td class="info-box-td" bgcolor="#f9f9f9" style="padding:20px;background-color:#f9f9f9;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;font-size:14px;color:#333333;"><strong style="color:#111111;">Invoice Number:</strong></td>
                <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:14px;color:#333333;"><strong style="color:#111111;">Invoice Date:</strong></td>
                <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${invoiceDate}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:14px;color:#333333;"><strong style="color:#111111;">Due Date:</strong></td>
                <td style="padding:7px 0;font-size:14px;color:#333333;text-align:right;">${dueDate}</td>
              </tr>
              <tr><td colspan="2" style="padding:4px 0;"><hr style="border:none;border-top:1px solid ${BORDER};margin:0;"></td></tr>
              <tr>
                <td style="padding:10px 0 0 0;font-size:15px;color:#333333;"><strong style="color:#111111;">Amount Due:</strong></td>
                ${totalAmountCell(balanceDue)}
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr><td align="center">
            ${buttonRow}
          </td></tr>
        </table>

        <p style="margin:0 0 16px 0;font-size:14px;color:#555555;">If you have any questions about this invoice, please reply to this email.</p>

        <div style="margin-top:28px;padding-top:20px;border-top:1px solid ${BORDER};">
          <p style="margin:0 0 4px 0;font-size:14px;color:#333333;">Best regards,</p>
          <p style="margin:0;font-size:14px;color:#111111;"><strong>${salesRepName}</strong></p>
          ${salesRepPhone ? `<p style="margin:4px 0 0 0;font-size:13px;color:${MUTED};">${salesRepPhone}</p>` : ''}
          ${signature    ? `<div style="margin-top:8px;font-size:13px;color:#555555;">${signature}</div>` : ''}
        </div>
      </td>
    </tr>
    <tr>
      <td class="footer-td" bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
        <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">${companyName}</p>
        <p style="margin:0;font-size:12px;color:${MUTED};">If you have questions, simply reply to this email.</p>
      </td>
    </tr>
  `, `Invoice ${invoiceNumber} \u2014 Amount Due: $${balanceDue}`);
}

export function getOrderStageEmailTemplate() {
  return wrapInBaseTemplate(`
    <tr bgcolor="${RED}"><td class="header-td" bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">Order Update</h1>
    </td></tr>
    <tr><td class="email-body-td" bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;color:#333333;">Hello {{customerName}},</p>
      <p style="margin:0 0 16px 0;color:#333333;">{{message}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td class="info-box-td" style="padding:20px;font-size:14px;color:#333333;">
          <p style="margin:0 0 8px 0;color:#333333;"><strong>Order:</strong> #{{orderNumber}}</p>
          <p style="margin:0 0 8px 0;color:#333333;"><strong>Item:</strong> {{productCode}}</p>
          <p style="margin:0;color:#333333;"><strong>Status:</strong> {{stageDisplayName}}</p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          <table cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
            <tr bgcolor="${RED}">
              <td align="center" bgcolor="${RED}" style="background-color:${RED};border-radius:5px;mso-padding-alt:12px 28px;">
                <a href="{{trackingUrl}}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;font-family:Arial,Helvetica,sans-serif;">Track Your Order</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
      <p style="font-size:14px;color:#555555;">If you have any questions, please contact your sales representative.</p>
    </td></tr>
    <tr><td class="footer-td" bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">{{companyName}}</p>
      <p style="margin:0;font-size:12px;color:${MUTED};">{{companyPhone}} | {{companyEmail}}</p>
    </td></tr>
  `, 'Order #{{orderNumber}} Status: {{stageDisplayName}}');
}

export function getCommissionNotificationTemplate() {
  return wrapInBaseTemplate(`
    <tr bgcolor="${RED}"><td class="header-td" bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Commission {{type}}</h1>
    </td></tr>
    <tr><td class="email-body-td" bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;color:#333333;">Hello {{agentName}},</p>
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td class="info-box-td" style="padding:24px;text-align:center;">
          <p style="margin:0;font-size:32px;font-weight:700;color:#22c55e;">${{amount}}</p>
          <p style="margin:8px 0 0 0;font-size:13px;color:${MUTED};">Commission Amount</p>
        </td></tr>
      </table>
      <p style="margin:0 0 8px 0;font-size:14px;color:#333333;"><strong>Order:</strong> #{{orderNumber}}</p>
      <p style="margin:0 0 8px 0;font-size:14px;color:#333333;"><strong>Customer:</strong> {{customerName}}</p>
      <p style="margin:0 0 20px 0;font-size:14px;color:#333333;"><strong>Stage:</strong> {{payoutStage}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
        <tr><td align="center">
          <table cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
            <tr bgcolor="${RED}">
              <td align="center" bgcolor="${RED}" style="background-color:${RED};border-radius:5px;mso-padding-alt:12px 28px;">
                <a href="{{commissionsUrl}}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;font-family:Arial,Helvetica,sans-serif;">View My Commissions</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="footer-td" bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0;font-size:12px;color:${MUTED};">{{companyName}} \u2014 Internal Notification</p>
    </td></tr>
  `, 'Commission {{type}}: ${{amount}}');
}

export { wrapInBaseTemplate };
