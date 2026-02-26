/**
 * Email Templates
 * HTML templates for all email types
 * Uses {{variableName}} syntax for variable replacement
 */

// Base wrapper with consistent styling
function wrapInBaseTemplate(content, preheaderText = "") {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      color: #333; 
      margin: 0; 
      padding: 0;
      background-color: #f5f5f5;
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background: white;
    }
    .header { 
      background: #dc2626; 
      color: white; 
      padding: 20px; 
      text-align: center; 
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content { 
      padding: 30px; 
    }
    .info-box { 
      background: #f9f9f9; 
      border: 1px solid #ddd; 
      padding: 20px; 
      margin: 20px 0; 
      border-radius: 4px;
    }
    .total { 
      font-size: 24px; 
      font-weight: bold; 
      color: #dc2626; 
    }
    .btn { 
      display: inline-block; 
      background: #dc2626; 
      color: white !important; 
      padding: 12px 30px; 
      text-decoration: none; 
      border-radius: 5px; 
      margin: 10px 5px;
      font-weight: bold;
    }
    .btn-secondary { 
      background: #333; 
    }
    .btn-outline {
      background: transparent;
      border: 2px solid #dc2626;
      color: #dc2626 !important;
    }
    .footer { 
      text-align: center; 
      padding: 20px; 
      color: #666; 
      font-size: 12px; 
      background: #f5f5f5;
    }
    .footer a {
      color: #666;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 12px;
    }
    .status-manufacturing { background: #fef3c7; color: #92400e; }
    .status-testing { background: #e0e7ff; color: #3730a3; }
    .status-qc { background: #d1fae5; color: #065f46; }
    .status-shipping { background: #dbeafe; color: #1e40af; }
    .status-at_sea { background: #e0e7ff; color: #3730a3; }
    .status-customs { background: #fce7f3; color: #9d174d; }
    .status-smt { background: #fef3c7; color: #92400e; }
    .status-delivered { background: #dcfce7; color: #166534; }
  </style>
</head>
<body>
  <!-- Preheader text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${preheaderText}
  </div>
  <div class="container">
    ${content}
  </div>
</body>
</html>
`;
}

/**
 * Invoice Email Template
 */
export function getInvoiceEmailTemplate() {
  return wrapInBaseTemplate(`
    <div class="header">
      <h1>{{companyName}}</h1>
    </div>
    <div class="content">
      <p>Dear {{customerFirstName}},</p>
      
      <p>Please find attached your invoice <strong>{{invoiceNumber}}</strong>.</p>
      
      <div class="info-box">
        <table width="100%" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;"><strong>Invoice Number:</strong></td>
            <td style="padding: 8px 0; text-align: right;">{{invoiceNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Invoice Date:</strong></td>
            <td style="padding: 8px 0; text-align: right;">{{invoiceDate}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
            <td style="padding: 8px 0; text-align: right;">{{dueDate}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Subtotal:</strong></td>
            <td style="padding: 8px 0; text-align: right;">\${{subtotal}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Tax:</strong></td>
            <td style="padding: 8px 0; text-align: right;">\${{tax}}</td>
          </tr>
          <tr>
            <td colspan="2"><hr style="border: none; border-top: 1px solid #ddd;"></td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Amount Due:</strong></td>
            <td style="padding: 8px 0; text-align: right;" class="total">\${{balanceDue}}</td>
          </tr>
        </table>
      </div>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{payNowUrl}}" class="btn">Pay Now</a>
        <a href="{{viewInvoiceUrl}}" class="btn btn-secondary">View Invoice</a>
      </p>
      
      <p>If you have any questions about this invoice, please reply to this email and I'll be happy to help.</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
        <p style="margin: 5px 0;">Best regards,</p>
        <p style="margin: 5px 0;"><strong>{{salesRepName}}</strong></p>
        {{signature}}
      </div>
    </div>
    <div class="footer">
      <p>{{companyName}}</p>
      <p>If you have questions, simply reply to this email.</p>
    </div>
  `, "Invoice {{invoiceNumber}} - Amount Due: ${{balanceDue}}");
}

/**
 * Estimate Email Template
 */
export function getEstimateEmailTemplate() {
  return wrapInBaseTemplate(`
    <div class="header">
      <h1>{{companyName}}</h1>
    </div>
    <div class="content">
      <p>Dear {{customerFirstName}},</p>
      
      <p>Thank you for your interest! Please find attached your estimate <strong>{{estimateNumber}}</strong>.</p>
      
      <div class="info-box">
        <table width="100%" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0;"><strong>Estimate Number:</strong></td>
            <td style="padding: 8px 0; text-align: right;">{{estimateNumber}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Date:</strong></td>
            <td style="padding: 8px 0; text-align: right;">{{estimateDate}}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Valid Until:</strong></td>
            <td style="padding: 8px 0; text-align: right;">{{expiryDate}}</td>
          </tr>
          <tr>
            <td colspan="2"><hr style="border: none; border-top: 1px solid #ddd;"></td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Estimated Total:</strong></td>
            <td style="padding: 8px 0; text-align: right;" class="total">\${{total}}</td>
          </tr>
        </table>
      </div>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{viewEstimateUrl}}" class="btn">View Estimate</a>
      </p>
      
      <p>This estimate is valid until <strong>{{expiryDate}}</strong>. If you have any questions or would like to proceed, please reply to this email.</p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
        <p style="margin: 5px 0;">Best regards,</p>
        <p style="margin: 5px 0;"><strong>{{salesRepName}}</strong></p>
        {{signature}}
      </div>
    </div>
    <div class="footer">
      <p>{{companyName}}</p>
      <p>If you have questions, simply reply to this email.</p>
    </div>
  `, "Estimate {{estimateNumber}} - Total: ${{total}}");
}

/**
 * Order Stage Update Email Template
 */
export function getOrderStageEmailTemplate() {
  return wrapInBaseTemplate(`
    <div class="header">
      <h1>Order Update</h1>
    </div>
    <div class="content">
      <p>Hello {{customerName}},</p>
      
      <p>{{message}}</p>
      
      <div class="info-box">
        <p style="margin: 0;"><strong>Order:</strong> #{{orderNumber}}</p>
        <p style="margin: 8px 0 0 0;"><strong>Item:</strong> {{productCode}}</p>
        <p style="margin: 8px 0 0 0;"><strong>Status:</strong> 
          <span class="status-badge status-{{newStage}}">{{stageDisplayName}}</span>
        </p>
      </div>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{trackingUrl}}" class="btn">Track Your Order</a>
      </p>
      
      <p>If you have any questions, please contact your sales representative by replying to this email.</p>
    </div>
    <div class="footer">
      <p>{{companyName}}</p>
      <p>{{companyPhone}} | {{companyEmail}}</p>
      <p><a href="{{unsubscribeUrl}}">Unsubscribe from order updates</a></p>
    </div>
  `, "Order #{{orderNumber}} Status: {{stageDisplayName}}");
}

/**
 * Commission Notification Template (Internal)
 */
export function getCommissionNotificationTemplate() {
  return wrapInBaseTemplate(`
    <div class="header">
      <h1>Commission {{type}}</h1>
    </div>
    <div class="content">
      <p>Hello {{agentName}},</p>
      
      <div class="info-box" style="text-align: center;">
        <p style="margin: 0; font-size: 32px; font-weight: bold; color: #22c55e;">\${{amount}}</p>
        <p style="margin: 8px 0 0 0; color: #666;">Commission Amount</p>
      </div>

      <p><strong>Order:</strong> #{{orderNumber}}</p>
      <p><strong>Customer:</strong> {{customerName}}</p>
      <p><strong>Stage:</strong> {{payoutStage}}</p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="{{commissionsUrl}}" class="btn">View My Commissions</a>
      </p>
    </div>
    <div class="footer">
      <p>{{companyName}} - Internal Notification</p>
    </div>
  `, "Commission {{type}}: ${{amount}}");
}

export { wrapInBaseTemplate };
