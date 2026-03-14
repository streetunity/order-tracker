/**
 * Email Templates
 * All templates are pure JS functions that accept data objects and return HTML.
 *
 * Rendering engine notes:
 * - Mobile Outlook: WebView, respects color-scheme:light meta tag
 * - Desktop Outlook (Win32): Word engine, ignores color-scheme entirely,
 *   applies its own dark mode algorithm. Fix: bgcolor HTML attributes +
 *   [data-ogsc] overrides + mso-color-alt for VML.
 * - Gmail: strips <style> blocks, needs 100% inline styles
 *
 * Brand red: #dc2626
 */

const RED    = '#dc2626';
const LIGHT  = '#f5f5f5';
const BORDER = '#dddddd';
const MUTED  = '#666666';

function buildHeader(companyName, logoUrl) {
  if (logoUrl) {
    return `
    <tr>
      <td bgcolor="#000000" style="background-color:#000000;padding:20px 30px;text-align:center;border-bottom:4px solid ${RED};">
        <img src="${logoUrl}" alt="${companyName}" height="60" width="auto" style="height:60px;width:auto;display:inline-block;border:0;outline:none;" />
      </td>
    </tr>`;
  }
  return `
    <tr>
      <td bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;mso-color-alt:#ffffff;"><!--[if mso]><span style="color:#ffffff;">${companyName}</span><![endif]--><!--[if !mso]><!-->${companyName}<!--<![endif]--></h1>
      </td>
    </tr>`;
}

function wrapInBaseTemplate(content, preheaderText = '') {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--<![endif]-->
  <title>Stealth Machine Tools</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style type="text/css">
    :root { color-scheme: light; supported-color-schemes: light; }
    /* Outlook dark mode overrides - [data-ogsc] targets Outlook's dark-mode injected class */
    [data-ogsc] body, [data-ogsb] body { background-color: ${LIGHT} !important; }
    [data-ogsc] table, [data-ogsb] table { background-color: #ffffff !important; }
    [data-ogsc] td, [data-ogsb] td { color: #333333 !important; background-color: #ffffff !important; }
    [data-ogsc] .email-body-td { background-color: #ffffff !important; color: #333333 !important; }
    [data-ogsc] .total-amount { color: ${RED} !important; }
    [data-ogsc] .info-box-td { background-color: #f9f9f9 !important; }
    [data-ogsc] .footer-td { background-color: ${LIGHT} !important; color: ${MUTED} !important; }
    [data-ogsc] .btn-primary { background-color: ${RED} !important; color: #ffffff !important; }
    [data-ogsc] .custom-msg-div { background-color: #f9f9f9 !important; color: #333333 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT};font-family:Arial,Helvetica,sans-serif;" bgcolor="${LIGHT}">
  <div style="display:none;max-height:0;overflow:hidden;">${preheaderText}&nbsp;</div>
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIGHT}" style="background-color:${LIGHT};">
    <tr><td align="center" style="padding:20px 10px;">
      <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;">
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
                <td class="total-amount" style="padding:10px 0 0 0;font-size:22px;font-weight:700;color:${RED};text-align:right;">
                  <!--[if mso]><span style="color:${RED};font-size:22px;font-weight:700;">$${total}</span><![endif]-->
                  <!--[if !mso]><!--><span style="color:${RED};">$${total}</span><!--<![endif]-->
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- Button: VML for Outlook desktop, HTML for everything else -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr><td align="center">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
              href="${viewEstimateUrl}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="12%" stroke="f" fillcolor="${RED}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">View Estimate</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${viewEstimateUrl}" class="btn-primary" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:5px;font-weight:700;font-size:14px;mso-hide:all;">View Estimate</a>
            <!--<![endif]-->
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
                <td class="total-amount" style="padding:10px 0 0 0;font-size:22px;font-weight:700;color:${RED};text-align:right;">
                  <!--[if mso]><span style="color:${RED};font-size:22px;font-weight:700;">$${balanceDue}</span><![endif]-->
                  <!--[if !mso]><!--><span style="color:${RED};">$${balanceDue}</span><!--<![endif]-->
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr><td align="center">
            ${payNowUrl ? `
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
              href="${payNowUrl}" style="height:44px;v-text-anchor:middle;width:120px;" arcsize="12%" stroke="f" fillcolor="${RED}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">Pay Now</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${payNowUrl}" class="btn-primary" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;margin:0 6px;mso-hide:all;">Pay Now</a>
            <!--<![endif]-->` : ''}
            ${viewInvoiceUrl ? `
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
              href="${viewInvoiceUrl}" style="height:44px;v-text-anchor:middle;width:140px;" arcsize="12%" stroke="f" fillcolor="#444444">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">View Invoice</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${viewInvoiceUrl}" style="display:inline-block;background-color:#444444;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;margin:0 6px;mso-hide:all;">View Invoice</a>
            <!--<![endif]-->` : ''}
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
    <tr><td bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">Order Update</h1>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;color:#333333;">Hello {{customerName}},</p>
      <p style="margin:0 0 16px 0;color:#333333;">{{message}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td style="padding:20px;font-size:14px;color:#333333;">
          <p style="margin:0 0 8px 0;color:#333333;"><strong>Order:</strong> #{{orderNumber}}</p>
          <p style="margin:0 0 8px 0;color:#333333;"><strong>Item:</strong> {{productCode}}</p>
          <p style="margin:0;color:#333333;"><strong>Status:</strong> {{stageDisplayName}}</p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
            href="{{trackingUrl}}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="12%" stroke="f" fillcolor="${RED}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">Track Your Order</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="{{trackingUrl}}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;mso-hide:all;">Track Your Order</a>
          <!--<![endif]-->
        </td></tr>
      </table>
      <p style="font-size:14px;color:#555555;">If you have any questions, please contact your sales representative.</p>
    </td></tr>
    <tr><td bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">{{companyName}}</p>
      <p style="margin:0;font-size:12px;color:${MUTED};">{{companyPhone}} | {{companyEmail}}</p>
    </td></tr>
  `, 'Order #{{orderNumber}} Status: {{stageDisplayName}}');
}

export function getCommissionNotificationTemplate() {
  return wrapInBaseTemplate(`
    <tr><td bgcolor="${RED}" style="background-color:${RED};padding:24px 30px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Commission {{type}}</h1>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="padding:30px;color:#333333;font-size:15px;line-height:1.6;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;color:#333333;">Hello {{agentName}},</p>
      <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9" style="margin:20px 0;background-color:#f9f9f9;border:1px solid ${BORDER};border-radius:4px;">
        <tr><td style="padding:24px;text-align:center;">
          <p style="margin:0;font-size:32px;font-weight:700;color:#22c55e;">${{amount}}</p>
          <p style="margin:8px 0 0 0;font-size:13px;color:${MUTED};">Commission Amount</p>
        </td></tr>
      </table>
      <p style="margin:0 0 8px 0;font-size:14px;color:#333333;"><strong>Order:</strong> #{{orderNumber}}</p>
      <p style="margin:0 0 8px 0;font-size:14px;color:#333333;"><strong>Customer:</strong> {{customerName}}</p>
      <p style="margin:0 0 20px 0;font-size:14px;color:#333333;"><strong>Stage:</strong> {{payoutStage}}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
        <tr><td align="center">
          <a href="{{commissionsUrl}}" style="display:inline-block;background-color:${RED};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:5px;font-weight:700;font-size:14px;">View My Commissions</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td bgcolor="${LIGHT}" style="background-color:${LIGHT};padding:20px 30px;text-align:center;">
      <p style="margin:0;font-size:12px;color:${MUTED};">{{companyName}} \u2014 Internal Notification</p>
    </td></tr>
  `, 'Commission {{type}}: ${{amount}}');
}

export { wrapInBaseTemplate };
