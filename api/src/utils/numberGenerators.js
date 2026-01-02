// api/src/utils/numberGenerators.js
import { PrismaClient } from '@prisma/client';

/**
 * Generate unique invoice number with format: INV-YYYY-XXXXX
 * Uses transaction to prevent duplicates
 */
export async function generateInvoiceNumber(prisma) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  return await prisma.$transaction(async (tx) => {
    const lastInvoice = await tx.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true }
    });

    if (!lastInvoice) return `${prefix}00001`;

    const lastNum = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    const newNum = lastNum + 1;
    return `${prefix}${String(newNum).padStart(5, '0')}`;
  });
}

/**
 * Generate unique customer number with format: CUST-YYYY-XXXXX
 * Uses transaction to prevent duplicates
 */
export async function generateCustomerNumber(prisma) {
  const year = new Date().getFullYear();
  const prefix = `CUST-${year}-`;

  return await prisma.$transaction(async (tx) => {
    const lastCustomer = await tx.customer.findFirst({
      where: { customerNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { customerNumber: true }
    });

    if (!lastCustomer) return `${prefix}00001`;

    const lastNum = parseInt(lastCustomer.customerNumber.split('-')[2]);
    const newNum = lastNum + 1;
    return `${prefix}${String(newNum).padStart(5, '0')}`;
  });
}

/**
 * Generate unique estimate number with format: EST-YYYY-XXXXX
 * Uses transaction to prevent duplicates
 */
export async function generateEstimateNumber(prisma) {
  const year = new Date().getFullYear();
  const prefix = `EST-${year}-`;

  return await prisma.$transaction(async (tx) => {
    const lastEstimate = await tx.estimate.findFirst({
      where: { estimateNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { estimateNumber: true }
    });

    if (!lastEstimate) return `${prefix}00001`;

    const lastNum = parseInt(lastEstimate.estimateNumber.split('-')[2]);
    const newNum = lastNum + 1;
    return `${prefix}${String(newNum).padStart(5, '0')}`;
  });
}

/**
 * Generate unique payment number with format: PAY-YYYY-XXXXX
 * Uses transaction to prevent duplicates
 */
export async function generatePaymentNumber(prisma) {
  const year = new Date().getFullYear();
  const prefix = `PAY-${year}-`;

  return await prisma.$transaction(async (tx) => {
    const lastPayment = await tx.payment.findFirst({
      where: { paymentNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { paymentNumber: true }
    });

    if (!lastPayment) return `${prefix}00001`;

    const lastNum = parseInt(lastPayment.paymentNumber.split('-')[2]);
    const newNum = lastNum + 1;
    return `${prefix}${String(newNum).padStart(5, '0')}`;
  });
}

/**
 * Generate unique order number with format: ORD-YYYY-XXXXX
 * Uses transaction to prevent duplicates
 * Note: This is for invoicing system auto-created orders
 */
export async function generateOrderNumber(prisma) {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;

  return await prisma.$transaction(async (tx) => {
    const orderCount = await tx.order.count();
    const newNum = orderCount + 1;
    return `${prefix}${String(newNum).padStart(5, '0')}`;
  });
}

/**
 * Generate unique credit memo number with format: CM-YYYY-XXXXX
 * Uses transaction to prevent duplicates
 */
export async function generateCreditMemoNumber(prisma) {
  const year = new Date().getFullYear();
  const prefix = `CM-${year}-`;

  return await prisma.$transaction(async (tx) => {
    const lastCreditMemo = await tx.creditMemo.findFirst({
      where: { creditMemoNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { creditMemoNumber: true }
    });

    if (!lastCreditMemo) return `${prefix}00001`;

    const lastNum = parseInt(lastCreditMemo.creditMemoNumber.split('-')[2]);
    const newNum = lastNum + 1;
    return `${prefix}${String(newNum).padStart(5, '0')}`;
  });
}

/**
 * Validate number format matches expected pattern
 * @param {string} number - The number to validate
 * @param {string} prefix - Expected prefix (e.g., 'INV', 'EST', 'PAY')
 * @returns {boolean} - True if valid format
 */
export function validateNumberFormat(number, prefix) {
  const regex = new RegExp(`^${prefix}-\\d{4}-\\d{5}$`);
  return regex.test(number);
}
