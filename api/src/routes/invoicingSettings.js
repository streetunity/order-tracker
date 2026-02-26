// api/src/routes/invoicingSettings.js
import { Router } from 'express';
import { adminGuard } from '../middleware/auth.js';

const DEFAULTS = {
  companyName: 'Stealth Machine Tools',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  email: 'info@stealthlaser.com',
  website: 'https://smt-orders.com',
  defaultTaxRate: 0,
  defaultPaymentTerms: 'NET30',
  defaultValidityDays: 30,
  invoicePrefix: 'INV',
  estimatePrefix: 'EST',
  paymentPrefix: 'PAY',
  customerPrefix: 'CUST',
};

export function createInvoicingSettingsRouter(prisma) {
  const router = Router();

  // GET /invoicing-settings
  // Returns the single settings row (creates defaults if none exists)
  router.get('/', adminGuard, async (req, res) => {
    try {
      let settings = await prisma.invoicingSettings.findFirst();

      if (!settings) {
        settings = await prisma.invoicingSettings.create({
          data: {
            companyName: DEFAULTS.companyName,
            address: DEFAULTS.address,
            city: DEFAULTS.city,
            state: DEFAULTS.state,
            zipCode: DEFAULTS.zipCode,
            phone: DEFAULTS.phone,
            email: DEFAULTS.email,
            website: DEFAULTS.website,
            defaultTaxRate: DEFAULTS.defaultTaxRate,
            defaultPaymentTerms: DEFAULTS.defaultPaymentTerms,
            defaultValidityDays: DEFAULTS.defaultValidityDays,
            invoicePrefix: DEFAULTS.invoicePrefix,
            estimatePrefix: DEFAULTS.estimatePrefix,
            paymentPrefix: DEFAULTS.paymentPrefix,
            customerPrefix: DEFAULTS.customerPrefix,
          },
        });
      }

      res.json(settings);
    } catch (error) {
      console.error('Error fetching invoicing settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /invoicing-settings
  // Update settings
  router.put('/', adminGuard, async (req, res) => {
    try {
      const {
        companyName, address, city, state, zipCode,
        phone, email, website,
        defaultTaxRate, defaultPaymentTerms, defaultValidityDays,
        invoicePrefix, estimatePrefix, paymentPrefix, customerPrefix,
        defaultFromEmail, emailDomain,
        discountApprovalThreshold, amountApprovalThreshold,
        defaultEstimateTerms, defaultInvoiceTerms,
      } = req.body;

      // Find existing or create
      let settings = await prisma.invoicingSettings.findFirst();

      const data = {};
      if (companyName !== undefined) data.companyName = companyName;
      if (address !== undefined) data.address = address;
      if (city !== undefined) data.city = city;
      if (state !== undefined) data.state = state;
      if (zipCode !== undefined) data.zipCode = zipCode;
      if (phone !== undefined) data.phone = phone;
      if (email !== undefined) data.email = email;
      if (website !== undefined) data.website = website;
      if (defaultTaxRate !== undefined) data.defaultTaxRate = parseFloat(defaultTaxRate) || 0;
      if (defaultPaymentTerms !== undefined) data.defaultPaymentTerms = defaultPaymentTerms;
      if (defaultValidityDays !== undefined) data.defaultValidityDays = parseInt(defaultValidityDays) || 30;
      if (invoicePrefix !== undefined) data.invoicePrefix = invoicePrefix;
      if (estimatePrefix !== undefined) data.estimatePrefix = estimatePrefix;
      if (paymentPrefix !== undefined) data.paymentPrefix = paymentPrefix;
      if (customerPrefix !== undefined) data.customerPrefix = customerPrefix;
      if (defaultFromEmail !== undefined) data.defaultFromEmail = defaultFromEmail;
      if (emailDomain !== undefined) data.emailDomain = emailDomain;
      if (discountApprovalThreshold !== undefined) data.discountApprovalThreshold = discountApprovalThreshold ? parseFloat(discountApprovalThreshold) : null;
      if (amountApprovalThreshold !== undefined) data.amountApprovalThreshold = amountApprovalThreshold ? parseFloat(amountApprovalThreshold) : null;
      if (defaultEstimateTerms !== undefined) data.defaultEstimateTerms = defaultEstimateTerms;
      if (defaultInvoiceTerms !== undefined) data.defaultInvoiceTerms = defaultInvoiceTerms;

      if (settings) {
        settings = await prisma.invoicingSettings.update({
          where: { id: settings.id },
          data,
        });
      } else {
        settings = await prisma.invoicingSettings.create({
          data: {
            companyName: DEFAULTS.companyName,
            ...data,
          },
        });
      }

      res.json(settings);
    } catch (error) {
      console.error('Error updating invoicing settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createInvoicingSettingsRouter;
