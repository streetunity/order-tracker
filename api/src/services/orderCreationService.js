/**
 * Order Creation Service
 * Creates orders in the Order Tracker from paid invoices
 */

import crypto from 'crypto';

/**
 * Generate a unique tracking token for orders
 */
function generateTrackingToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create an order from a paid invoice
 * Called automatically when deposit payment is received
 *
 * @param {PrismaClient} prisma - Prisma client instance
 * @param {Object} options - Creation options
 * @param {string} options.invoiceId - Invoice ID
 * @param {string} options.paymentId - Payment ID that triggered creation
 * @returns {Promise<Object>} - Created order with items
 */
export async function createOrderFromInvoice(prisma, { invoiceId, paymentId }) {
  // Get invoice with all related data
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: {
        include: {
          account: true
        }
      },
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          product: {
            select: { category: true }
          }
        }
      },
      createdBy: true,
      estimate: true
    }
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (invoice.convertedToOrder) {
    console.log(`[ORDER_CREATION] Invoice ${invoice.invoiceNumber} already converted to order`);
    return { alreadyConverted: true, orderId: invoice.orderId };
  }

  // Check if customer has a linked Account, or create one
  let accountId = invoice.customer?.accountId;

  if (!accountId) {
    // Create an Account for this customer
    const customerName = invoice.customer.companyName ||
                        invoice.customer.company ||
                        `${invoice.customer.firstName} ${invoice.customer.lastName}`;

    const account = await prisma.account.create({
      data: {
        name: customerName,
        contactName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
        email: invoice.customer.email,
        phone: invoice.customer.phone,
        address: invoice.customer.shippingAddress || invoice.customer.billingAddress,
        notes: `Created from Invoice ${invoice.invoiceNumber}`
      }
    });

    // Link customer to account
    await prisma.customer.update({
      where: { id: invoice.customerId },
      data: { accountId: account.id }
    });

    accountId = account.id;
    console.log(`[ORDER_CREATION] Created Account ${account.id} for Customer ${invoice.customer.customerNumber}`);
  }

  // Get sales rep name from invoice creator
  const salesRepName = invoice.createdBy?.name || null;

  // Categories that should NOT be added to tracking board
  const excludedCategories = ['service', 'other'];

  // Filter out services and other non-trackable items, then map to order items
  const trackableItems = invoice.items.filter(item => {
    const category = item.product?.category?.toLowerCase() || '';
    const isExcluded = excludedCategories.includes(category);
    if (isExcluded) {
      console.log(`[ORDER_CREATION] Skipping ${category} item: ${item.name} (${item.sku || 'no sku'})`);
    }
    return !isExcluded;
  });

  // If no trackable items, skip order creation
  if (trackableItems.length === 0) {
    console.log(`[ORDER_CREATION] Invoice ${invoice.invoiceNumber} has no trackable items (all services/other) - skipping order creation`);

    // Still mark invoice as handled so we don't retry
    const updatedNotes = invoice.internalNotes
      ? `${invoice.internalNotes}\n\nNo order created - all items are services/other`
      : 'No order created - all items are services/other';

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        convertedToOrder: true,
        convertedAt: new Date(),
        internalNotes: updatedNotes
      }
    });

    return {
      skipped: true,
      reason: 'No trackable items (all services/other)',
      invoiceNumber: invoice.invoiceNumber
    };
  }

  // Map trackable invoice items to order items
  const orderItems = trackableItems.map(item => ({
    productCode: item.sku || item.name,
    qty: Math.round(item.quantity) || 1,
    notes: item.description || null,
    itemPrice: item.amount, // Total price for this line
    currentStage: 'PENDING_FUNDING' // Start in pending funding since deposit just paid
  }));

  console.log(`[ORDER_CREATION] Creating order with ${orderItems.length} trackable items (${invoice.items.length - trackableItems.length} services/other excluded)`);

  // Create the order in a transaction
  const order = await prisma.$transaction(async (tx) => {
    const trackingToken = generateTrackingToken();

    // Create the order
    const newOrder = await tx.order.create({
      data: {
        accountId,
        poNumber: invoice.invoiceNumber, // Use invoice number as PO reference
        sku: salesRepName, // Sales rep stored in sku field
        orderDate: new Date(),
        trackingToken,
        discount: invoice.discountAmount || 0,
        internalNotes: `Created from Invoice ${invoice.invoiceNumber}`,
        items: {
          create: orderItems
        }
      },
      include: {
        account: true,
        items: true
      }
    });

    // Create initial status event
    await tx.orderStatusEvent.create({
      data: {
        orderId: newOrder.id,
        stage: 'PENDING_FUNDING',
        note: `Order created from Invoice ${invoice.invoiceNumber} - Deposit received`
      }
    });

    // Create audit log
    await tx.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: newOrder.id,
        parentEntityId: newOrder.id,
        action: 'ORDER_CREATED',
        metadata: JSON.stringify({
          entity: 'Order',
          source: 'invoice',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          paymentId,
          customerId: invoice.customerId,
          itemCount: orderItems.length,
          total: invoice.total
        }),
        performedByName: 'System (Invoice Payment)'
      }
    });

    // Update invoice with order link
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        convertedToOrder: true,
        orderId: newOrder.id,
        convertedAt: new Date()
      }
    });

    // Link trackable invoice items to order items (for traceability)
    // Only link the items that were actually added to the order (not services/other)
    for (let i = 0; i < trackableItems.length; i++) {
      if (newOrder.items[i]) {
        await tx.invoiceItem.update({
          where: { id: trackableItems[i].id },
          data: { orderItemId: newOrder.items[i].id }
        });
      }
    }

    // Log activity
    await tx.customerActivityLog.create({
      data: {
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        type: 'order_created',
        description: `Order created from invoice ${invoice.invoiceNumber}`,
        metadata: JSON.stringify({
          orderId: newOrder.id,
          trackingToken: newOrder.trackingToken,
          paymentId
        })
      }
    });

    return newOrder;
  });

  console.log(`[ORDER_CREATION] Created Order ${order.id} from Invoice ${invoice.invoiceNumber}`);

  // Trigger commission calculation (outside transaction for resilience)
  try {
    const { calculateCommissionForOrder } = await import('../helpers/commission.js');
    if (salesRepName) {
      await calculateCommissionForOrder(order);
      console.log(`[ORDER_CREATION] Commission created for order ${order.id}`);
    }
  } catch (commissionError) {
    console.error('[ORDER_CREATION] Commission calculation error:', commissionError);
    // Don't fail order creation if commission fails
  }

  return {
    order,
    invoiceNumber: invoice.invoiceNumber,
    customerNumber: invoice.customer.customerNumber
  };
}

/**
 * Check if an invoice should trigger order creation
 * Based on orderCreationTrigger setting and payment status
 *
 * @param {Object} invoice - Invoice object
 * @returns {boolean}
 */
export function shouldCreateOrder(invoice) {
  // Already converted
  if (invoice.convertedToOrder) {
    return false;
  }

  // Check trigger type
  const trigger = invoice.orderCreationTrigger || 'DEPOSIT';

  switch (trigger) {
    case 'DEPOSIT':
      // Create when deposit is paid
      return invoice.depositPaid === true;

    case 'FULL_PAYMENT':
      // Create only when fully paid
      return invoice.status === 'PAID';

    case 'MANUAL':
      // Never auto-create, requires manual action
      return false;

    default:
      return invoice.depositPaid === true;
  }
}

/**
 * Get order creation status for an invoice
 */
export async function getOrderCreationStatus(prisma, invoiceId) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      convertedToOrder: true,
      orderId: true,
      convertedAt: true,
      orderCreationTrigger: true,
      depositPaid: true,
      status: true,
      order: {
        select: {
          id: true,
          trackingToken: true,
          currentStage: true
        }
      }
    }
  });

  if (!invoice) {
    return null;
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    converted: invoice.convertedToOrder,
    orderId: invoice.orderId,
    convertedAt: invoice.convertedAt,
    trigger: invoice.orderCreationTrigger,
    canCreate: shouldCreateOrder(invoice),
    order: invoice.order
  };
}

export default {
  createOrderFromInvoice,
  shouldCreateOrder,
  getOrderCreationStatus
};
