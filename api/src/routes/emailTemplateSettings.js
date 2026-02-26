// api/src/routes/emailTemplateSettings.js
import { Router } from 'express';
import { adminGuard } from '../middleware/auth.js';

// Dollar sign helper for use in template literals
// Using ${'$'} inside backticks safely produces a literal "$" character
const DOLLAR = '$';

/**
 * Default templates - used as fallback when no DB entry exists
 * These match the hardcoded templates in emailTemplates.js
 */
const DEFAULT_TEMPLATES = {
  // ---- Invoice Email ----
  invoice: {
    key: 'invoice',
    name: 'Invoice Email',
    description: 'Sent when an invoice is emailed to a customer. Includes PDF attachment.',
    category: 'invoicing',
    subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
    bodyContent: '<p>Dear {{customerFirstName}},</p>\n\n' +
      '<p>Please find attached your invoice <strong>{{invoiceNumber}}</strong>.</p>\n\n' +
      '<div class="info-box">\n' +
      '  <table width="100%" style="border-collapse: collapse;">\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Invoice Number:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">{{invoiceNumber}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Invoice Date:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">{{invoiceDate}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Due Date:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">{{dueDate}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Subtotal:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">${{subtotal}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Tax:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">${{tax}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td colspan="2"><hr style="border: none; border-top: 1px solid #ddd;"></td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Amount Due:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;" class="total">${{balanceDue}}</td>\n' +
      '    </tr>\n' +
      '  </table>\n' +
      '</div>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n' +
      '  <a href="{{payNowUrl}}" class="btn">Pay Now</a>\n' +
      '  <a href="{{viewInvoiceUrl}}" class="btn btn-secondary">View Invoice</a>\n' +
      '</p>\n\n' +
      '<p>If you have any questions about this invoice, please reply to this email and I\'ll be happy to help.</p>',
    closingContent: '<p style="margin: 5px 0;">Best regards,</p>\n' +
      '<p style="margin: 5px 0;"><strong>{{salesRepName}}</strong></p>\n' +
      '{{signature}}',
    footerContent: '<p>{{companyName}}</p>\n<p>If you have questions, simply reply to this email.</p>',
    variables: [
      { name: 'customerFirstName', description: 'Customer first name' },
      { name: 'invoiceNumber', description: 'Invoice number (e.g. INV-2026-00001)' },
      { name: 'invoiceDate', description: 'Invoice date' },
      { name: 'dueDate', description: 'Payment due date' },
      { name: 'subtotal', description: 'Invoice subtotal' },
      { name: 'tax', description: 'Tax amount' },
      { name: 'balanceDue', description: 'Total balance due' },
      { name: 'payNowUrl', description: 'Link to pay invoice online' },
      { name: 'viewInvoiceUrl', description: 'Link to view invoice online' },
      { name: 'salesRepName', description: 'Sales representative name' },
      { name: 'signature', description: 'Sales rep email signature' },
      { name: 'companyName', description: 'Company name' },
    ],
  },

  // ---- Estimate Email ----
  estimate: {
    key: 'estimate',
    name: 'Estimate Email',
    description: 'Sent when an estimate is emailed to a customer. Includes PDF attachment.',
    category: 'invoicing',
    subject: 'Estimate {{estimateNumber}} from {{companyName}}',
    bodyContent: '<p>Dear {{customerFirstName}},</p>\n\n' +
      '<p>Thank you for your interest! Please find attached your estimate <strong>{{estimateNumber}}</strong>.</p>\n\n' +
      '<div class="info-box">\n' +
      '  <table width="100%" style="border-collapse: collapse;">\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Estimate Number:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">{{estimateNumber}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Date:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">{{estimateDate}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Valid Until:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;">{{expiryDate}}</td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td colspan="2"><hr style="border: none; border-top: 1px solid #ddd;"></td>\n' +
      '    </tr>\n' +
      '    <tr>\n' +
      '      <td style="padding: 8px 0;"><strong>Estimated Total:</strong></td>\n' +
      '      <td style="padding: 8px 0; text-align: right;" class="total">${{total}}</td>\n' +
      '    </tr>\n' +
      '  </table>\n' +
      '</div>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n' +
      '  <a href="{{viewEstimateUrl}}" class="btn">View Estimate</a>\n' +
      '</p>\n\n' +
      '<p>This estimate is valid until <strong>{{expiryDate}}</strong>. If you have any questions or would like to proceed, please reply to this email.</p>',
    closingContent: '<p style="margin: 5px 0;">Best regards,</p>\n' +
      '<p style="margin: 5px 0;"><strong>{{salesRepName}}</strong></p>\n' +
      '{{signature}}',
    footerContent: '<p>{{companyName}}</p>\n<p>If you have questions, simply reply to this email.</p>',
    variables: [
      { name: 'customerFirstName', description: 'Customer first name' },
      { name: 'estimateNumber', description: 'Estimate number (e.g. EST-2026-00001)' },
      { name: 'estimateDate', description: 'Estimate date' },
      { name: 'expiryDate', description: 'Estimate expiry date' },
      { name: 'total', description: 'Estimate total amount' },
      { name: 'viewEstimateUrl', description: 'Link to view estimate online' },
      { name: 'salesRepName', description: 'Sales representative name' },
      { name: 'signature', description: 'Sales rep email signature' },
      { name: 'companyName', description: 'Company name' },
    ],
  },

  // ---- Order Stage Update ----
  order_stage: {
    key: 'order_stage',
    name: 'Order Stage Update',
    description: 'Sent to customers when their order item moves to a new stage.',
    category: 'orders',
    subject: 'Order Update - {{stageDisplayName}}',
    bodyContent: '<p>Hello {{customerName}},</p>\n\n' +
      '<p>{{message}}</p>\n\n' +
      '<div class="info-box">\n' +
      '  <p style="margin: 0;"><strong>Order:</strong> #{{orderNumber}}</p>\n' +
      '  <p style="margin: 8px 0 0 0;"><strong>Item:</strong> {{productCode}}</p>\n' +
      '  <p style="margin: 8px 0 0 0;"><strong>Status:</strong>\n' +
      '    <span class="status-badge status-{{newStage}}">{{stageDisplayName}}</span>\n' +
      '  </p>\n' +
      '</div>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n' +
      '  <a href="{{trackingUrl}}" class="btn">Track Your Order</a>\n' +
      '</p>\n\n' +
      '<p>If you have any questions, please contact your sales representative by replying to this email.</p>',
    closingContent: '',
    footerContent: '<p>{{companyName}}</p>\n' +
      '<p>{{companyPhone}} | {{companyEmail}}</p>\n' +
      '<p><a href="{{unsubscribeUrl}}">Unsubscribe from order updates</a></p>',
    variables: [
      { name: 'customerName', description: 'Customer name' },
      { name: 'message', description: 'Stage-specific message (configured per stage below)' },
      { name: 'orderNumber', description: 'Order reference number' },
      { name: 'productCode', description: 'Item product code' },
      { name: 'newStage', description: 'New stage code (e.g. MANUFACTURING)' },
      { name: 'stageDisplayName', description: 'Human-readable stage name' },
      { name: 'trackingUrl', description: 'Customer order tracking URL' },
      { name: 'unsubscribeUrl', description: 'Unsubscribe link' },
      { name: 'companyName', description: 'Company name' },
      { name: 'companyPhone', description: 'Company phone number' },
      { name: 'companyEmail', description: 'Company email address' },
    ],
  },

  // ---- Commission Notification (Internal) ----
  commission_notification: {
    key: 'commission_notification',
    name: 'Commission Notification',
    description: 'Internal email sent to sales agents when commission events occur.',
    category: 'internal',
    subject: 'Commission {{type}}: ${{amount}}',
    bodyContent: '<p>Hello {{agentName}},</p>\n\n' +
      '<div class="info-box" style="text-align: center;">\n' +
      '  <p style="margin: 0; font-size: 32px; font-weight: bold; color: #22c55e;">${{amount}}</p>\n' +
      '  <p style="margin: 8px 0 0 0; color: #666;">Commission Amount</p>\n' +
      '</div>\n\n' +
      '<p><strong>Order:</strong> #{{orderNumber}}</p>\n' +
      '<p><strong>Customer:</strong> {{customerName}}</p>\n' +
      '<p><strong>Stage:</strong> {{payoutStage}}</p>\n\n' +
      '<p style="text-align: center; margin: 30px 0;">\n' +
      '  <a href="{{commissionsUrl}}" class="btn">View My Commissions</a>\n' +
      '</p>',
    closingContent: '',
    footerContent: '<p>{{companyName}} - Internal Notification</p>',
    variables: [
      { name: 'agentName', description: 'Sales agent name' },
      { name: 'type', description: 'Commission event type (Earned, Approved, Paid)' },
      { name: 'amount', description: 'Commission amount' },
      { name: 'orderNumber', description: 'Order reference number' },
      { name: 'customerName', description: 'Customer name' },
      { name: 'payoutStage', description: 'Payout trigger stage' },
      { name: 'commissionsUrl', description: 'Link to commissions page' },
      { name: 'companyName', description: 'Company name' },
    ],
  },
};

/**
 * Default per-stage configuration for order stage emails
 */
const DEFAULT_STAGE_CONFIGS = {
  MANUFACTURING: {
    notify: true,
    subject: 'Your order is now in manufacturing',
    message: 'Your item ({{productCode}}) has entered the manufacturing phase. We\'ll keep you updated as it progresses.',
  },
  TESTING: {
    notify: true,
    subject: 'Your order is in debugging and testing',
    message: 'Your item ({{productCode}}) has completed manufacturing and is now undergoing debugging and testing.',
  },
  SHIPPING: {
    notify: true,
    subject: 'Your order is being prepared for shipment',
    message: 'Your item ({{productCode}}) has passed testing and is now being loaded into the shipping container.',
  },
  AT_SEA: {
    notify: true,
    subject: 'Your order has shipped!',
    message: 'Great news! Your item ({{productCode}}) is on its way. The shipping container is now in transit.',
  },
  SMT: {
    notify: true,
    subject: 'Your order has arrived at our facility',
    message: 'Your item ({{productCode}}) has arrived at our facility and will now go through quality control before delivery.',
  },
  QC: {
    notify: true,
    subject: 'Your order is in quality control',
    message: 'Your item ({{productCode}}) is currently going through our final quality control inspection before delivery.',
  },
  DELIVERED: {
    notify: true,
    subject: 'Your order has been delivered!',
    message: 'Your item ({{productCode}}) has been delivered. We hope you enjoy it!',
  },
};

export function createEmailTemplateSettingsRouter(prisma) {
  const router = Router();

  // ============================================
  // GET /email-templates
  // List all templates (DB + defaults merged)
  // ============================================
  router.get('/', adminGuard, async (req, res) => {
    try {
      const dbTemplates = await prisma.emailTemplate.findMany({
        orderBy: { updatedAt: 'desc' },
      });

      const dbMap = {};
      for (const t of dbTemplates) {
        dbMap[t.templateKey] = t;
      }

      const templates = Object.entries(DEFAULT_TEMPLATES).map(([key, defaultTpl]) => {
        const dbTpl = dbMap[key];
        if (dbTpl) {
          return {
            ...defaultTpl,
            key: dbTpl.templateKey,
            subject: dbTpl.subject,
            bodyContent: dbTpl.bodyContent,
            closingContent: dbTpl.closingContent || '',
            footerContent: dbTpl.footerContent || '',
            isCustomized: true,
            lastUpdatedAt: dbTpl.updatedAt,
            lastUpdatedBy: dbTpl.updatedByName,
          };
        }
        return { ...defaultTpl, isCustomized: false };
      });

      res.json(templates);
    } catch (error) {
      console.error('Error fetching email templates:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // GET /email-templates/stages/config
  // Get per-stage email configuration
  // ============================================
  router.get('/stages/config', adminGuard, async (req, res) => {
    try {
      const dbConfigs = await prisma.emailStageConfig.findMany({
        orderBy: { stage: 'asc' },
      });

      const dbMap = {};
      for (const c of dbConfigs) {
        dbMap[c.stage] = c;
      }

      const stages = Object.entries(DEFAULT_STAGE_CONFIGS).map(([stage, defaults]) => {
        const dbConf = dbMap[stage];
        if (dbConf) {
          return {
            stage,
            notify: dbConf.notify,
            subject: dbConf.subject,
            message: dbConf.message,
            isCustomized: true,
          };
        }
        return { stage, ...defaults, isCustomized: false };
      });

      res.json(stages);
    } catch (error) {
      console.error('Error fetching stage configs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PUT /email-templates/stages/config
  // Save per-stage email configuration (bulk)
  // ============================================
  router.put('/stages/config', adminGuard, async (req, res) => {
    try {
      const { stages } = req.body;

      if (!Array.isArray(stages)) {
        return res.status(400).json({ error: 'stages must be an array' });
      }

      const results = [];
      for (const stageConf of stages) {
        const { stage, notify, subject, message } = stageConf;

        if (!DEFAULT_STAGE_CONFIGS[stage]) {
          continue;
        }

        const saved = await prisma.emailStageConfig.upsert({
          where: { stage },
          update: {
            notify: notify !== undefined ? notify : true,
            subject: subject || DEFAULT_STAGE_CONFIGS[stage].subject,
            message: message || DEFAULT_STAGE_CONFIGS[stage].message,
            updatedByName: req.user.name,
          },
          create: {
            stage,
            notify: notify !== undefined ? notify : true,
            subject: subject || DEFAULT_STAGE_CONFIGS[stage].subject,
            message: message || DEFAULT_STAGE_CONFIGS[stage].message,
            updatedByName: req.user.name,
          },
        });
        results.push(saved);
      }

      res.json({ success: true, updated: results.length });
    } catch (error) {
      console.error('Error saving stage configs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // GET /email-templates/:key
  // Get a single template (DB or default)
  // ============================================
  router.get('/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      const defaultTpl = DEFAULT_TEMPLATES[key];

      if (!defaultTpl) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const dbTpl = await prisma.emailTemplate.findUnique({
        where: { templateKey: key },
      });

      if (dbTpl) {
        return res.json({
          ...defaultTpl,
          key: dbTpl.templateKey,
          subject: dbTpl.subject,
          bodyContent: dbTpl.bodyContent,
          closingContent: dbTpl.closingContent || '',
          footerContent: dbTpl.footerContent || '',
          isCustomized: true,
          lastUpdatedAt: dbTpl.updatedAt,
          lastUpdatedBy: dbTpl.updatedByName,
        });
      }

      res.json({ ...defaultTpl, isCustomized: false });
    } catch (error) {
      console.error('Error fetching email template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PUT /email-templates/:key
  // Save/update a template
  // ============================================
  router.put('/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      const { subject, bodyContent, closingContent, footerContent } = req.body;

      if (!DEFAULT_TEMPLATES[key]) {
        return res.status(404).json({ error: 'Invalid template key' });
      }

      if (!subject || !bodyContent) {
        return res.status(400).json({ error: 'Subject and body content are required' });
      }

      const template = await prisma.emailTemplate.upsert({
        where: { templateKey: key },
        update: {
          subject,
          bodyContent,
          closingContent: closingContent || '',
          footerContent: footerContent || '',
          updatedByUserId: req.user.userId,
          updatedByName: req.user.name,
        },
        create: {
          templateKey: key,
          name: DEFAULT_TEMPLATES[key].name,
          category: DEFAULT_TEMPLATES[key].category,
          subject,
          bodyContent,
          closingContent: closingContent || '',
          footerContent: footerContent || '',
          updatedByUserId: req.user.userId,
          updatedByName: req.user.name,
        },
      });

      res.json({
        success: true,
        template: {
          ...DEFAULT_TEMPLATES[key],
          key: template.templateKey,
          subject: template.subject,
          bodyContent: template.bodyContent,
          closingContent: template.closingContent,
          footerContent: template.footerContent,
          isCustomized: true,
          lastUpdatedAt: template.updatedAt,
          lastUpdatedBy: template.updatedByName,
        },
      });
    } catch (error) {
      console.error('Error saving email template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // DELETE /email-templates/:key
  // Reset a template to defaults
  // ============================================
  router.delete('/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;

      if (!DEFAULT_TEMPLATES[key]) {
        return res.status(404).json({ error: 'Invalid template key' });
      }

      await prisma.emailTemplate.deleteMany({
        where: { templateKey: key },
      });

      res.json({
        success: true,
        message: 'Template "' + DEFAULT_TEMPLATES[key].name + '" reset to defaults',
        template: { ...DEFAULT_TEMPLATES[key], isCustomized: false },
      });
    } catch (error) {
      console.error('Error resetting email template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // POST /email-templates/preview/:key
  // Generate a preview with sample data
  // ============================================
  router.post('/preview/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      const { subject, bodyContent, closingContent, footerContent } = req.body;

      if (!DEFAULT_TEMPLATES[key]) {
        return res.status(404).json({ error: 'Invalid template key' });
      }

      const sampleData = {
        customerFirstName: 'John',
        customerName: 'John Smith',
        invoiceNumber: 'INV-2026-00042',
        invoiceDate: 'Feb 26, 2026',
        dueDate: 'Mar 28, 2026',
        subtotal: '12,500.00',
        tax: '1,031.25',
        balanceDue: '13,531.25',
        payNowUrl: '#',
        viewInvoiceUrl: '#',
        estimateNumber: 'EST-2026-00015',
        estimateDate: 'Feb 26, 2026',
        expiryDate: 'Mar 28, 2026',
        total: '12,500.00',
        viewEstimateUrl: '#',
        salesRepName: 'Jane Doe',
        signature: '<p style="color: #666; font-size: 13px;">Jane Doe | Sales Manager<br>Stealth Machine Tools<br>(555) 123-4567</p>',
        companyName: 'Stealth Machine Tools',
        companyPhone: '(555) 123-4567',
        companyEmail: 'info@stealthlaser.com',
        orderNumber: 'A1B2C3D4',
        productCode: 'SL-3015',
        newStage: 'at_sea',
        stageDisplayName: 'AT SEA',
        message: 'Great news! Your item (SL-3015) is on its way. The shipping container is now in transit.',
        trackingUrl: '#',
        unsubscribeUrl: '#',
        agentName: 'Bob Agent',
        type: 'Earned',
        amount: '625.00',
        payoutStage: 'SHIPPING',
        commissionsUrl: 'https://smt-orders.com/admin/commissions',
      };

      let processedSubject = subject || '';
      let processedBody = bodyContent || '';
      let processedClosing = closingContent || '';
      let processedFooter = footerContent || '';

      for (const [varName, value] of Object.entries(sampleData)) {
        const regex = new RegExp('\\{\\{' + varName + '\\}\\}', 'g');
        processedSubject = processedSubject.replace(regex, value);
        processedBody = processedBody.replace(regex, value);
        processedClosing = processedClosing.replace(regex, value);
        processedFooter = processedFooter.replace(regex, value);
      }

      res.json({
        subject: processedSubject,
        bodyContent: processedBody,
        closingContent: processedClosing,
        footerContent: processedFooter,
      });
    } catch (error) {
      console.error('Error generating preview:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // POST /email-templates/test-send
  // Send a test email
  // ============================================
  router.post('/test-send', adminGuard, async (req, res) => {
    try {
      const { templateKey, toEmail } = req.body;

      if (!templateKey || !toEmail) {
        return res.status(400).json({ error: 'templateKey and toEmail are required' });
      }

      const emailServiceModule = await import('../services/emailService.js');
      const emailService = emailServiceModule.default || emailServiceModule;

      const defaultTpl = DEFAULT_TEMPLATES[templateKey];
      if (!defaultTpl) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const dbTpl = await prisma.emailTemplate.findUnique({
        where: { templateKey },
      });

      const tpl = dbTpl || defaultTpl;

      const sampleData = {
        customerFirstName: 'Test',
        customerName: 'Test Customer',
        invoiceNumber: 'INV-TEST-00001',
        invoiceDate: new Date().toLocaleDateString(),
        dueDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString(),
        subtotal: '10,000.00',
        tax: '825.00',
        balanceDue: '10,825.00',
        payNowUrl: '#',
        viewInvoiceUrl: '#',
        estimateNumber: 'EST-TEST-00001',
        estimateDate: new Date().toLocaleDateString(),
        expiryDate: new Date(Date.now() + 30 * 86400000).toLocaleDateString(),
        total: '10,000.00',
        viewEstimateUrl: '#',
        salesRepName: req.user.name,
        signature: '',
        companyName: 'Stealth Machine Tools',
        companyPhone: '(555) 123-4567',
        companyEmail: 'info@stealthlaser.com',
        orderNumber: 'TEST1234',
        productCode: 'SL-3015',
        newStage: 'shipping',
        stageDisplayName: 'SHIPPING',
        message: 'This is a test email. Your item (SL-3015) is being prepared for shipment.',
        trackingUrl: '#',
        unsubscribeUrl: '#',
        agentName: req.user.name,
        type: 'Test',
        amount: '500.00',
        payoutStage: 'SHIPPING',
        commissionsUrl: 'https://smt-orders.com/admin/commissions',
      };

      let subject = tpl.subject || defaultTpl.subject;
      let body = tpl.bodyContent || defaultTpl.bodyContent;

      for (const [varName, value] of Object.entries(sampleData)) {
        const regex = new RegExp('\\{\\{' + varName + '\\}\\}', 'g');
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
        'body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }' +
        '.container { max-width: 600px; margin: 0 auto; background: white; }' +
        '.header { background: #dc2626; color: white; padding: 20px; text-align: center; }' +
        '.header h1 { margin: 0; font-size: 24px; }' +
        '.content { padding: 30px; }' +
        '.info-box { background: #f9f9f9; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 4px; }' +
        '.total { font-size: 24px; font-weight: bold; color: #dc2626; }' +
        '.btn { display: inline-block; background: #dc2626; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 5px; font-weight: bold; }' +
        '.btn-secondary { background: #333; }' +
        '.footer { text-align: center; padding: 20px; color: #666; font-size: 12px; background: #f5f5f5; }' +
        '</style></head><body>' +
        '<div class="container">' +
        '<div class="header"><h1>[TEST] ' + subject + '</h1></div>' +
        '<div class="content">' + body + '</div>' +
        '<div class="footer"><p>Stealth Machine Tools - Test Email</p></div>' +
        '</div>' +
        '</body></html>';

      const fromEmail = process.env.SES_FROM_EMAIL || 'orders@stealthlaser.com';

      const result = await emailService.sendEmail({
        to: toEmail,
        from: fromEmail,
        fromName: 'Stealth Machine Tools',
        subject: '[TEST] ' + subject,
        html,
      });

      res.json({
        success: result.success,
        message: result.success
          ? 'Test email sent to ' + toEmail
          : 'Failed to send: ' + result.error,
      });
    } catch (error) {
      console.error('Error sending test email:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export { DEFAULT_TEMPLATES, DEFAULT_STAGE_CONFIGS };
export default createEmailTemplateSettingsRouter;
