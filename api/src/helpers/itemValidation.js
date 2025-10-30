// api/src/helpers/itemValidation.js
// Validation and normalization helpers for items

// Normalize incoming items data from various formats
export function normalizeIncomingItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({
      productCode: String(i?.productCode ?? i?.code ?? i?.name ?? '').trim(),
      qty: Number(i?.qty ?? i?.quantity ?? i?.count ?? 1) || 1,
      serialNumber: i?.serialNumber ? String(i.serialNumber).trim() : null,
      modelNumber: i?.modelNumber ? String(i.modelNumber).trim() : null,
      manufacturerId: (i?.manufacturerId === '' || i?.manufacturerId === null) ? null : (i?.manufacturerId ? String(i.manufacturerId).trim() : null),
      voltage: i?.voltage ? String(i.voltage).trim() : null,
      laserWattage: i?.laserWattage ? String(i.laserWattage).trim() : null,
      notes: i?.notes ? String(i.notes).trim() : null,
      hasExtendedShipping: i?.hasExtendedShipping === true,
      itemPrice: i?.itemPrice ? parseFloat(i.itemPrice) : null,
      privateItemNote: i?.privateItemNote ? String(i.privateItemNote).trim() : null
    }))
    .filter((i) => i.productCode.length > 0);
}

// Extract items from request body
export function extractItemsFromBody(body) {
  let items = [];
  
  if (Array.isArray(body)) {
    items = normalizeIncomingItems(body);
  } else if (Array.isArray(body.items)) {
    items = normalizeIncomingItems(body.items);
  } else {
    items = normalizeIncomingItems([body]);
  }
  
  return items;
}

// Validate quantity field
export function validateQuantity(qty) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) {
    return { valid: false, error: 'qty must be a positive number' };
  }
  return { valid: true, value: q };
}

// Process string field value
export function processStringField(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  return String(value).trim();
}

// Process numeric field value
export function processNumericField(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// Build changes array for audit logging
export function buildFieldChange(field, oldValue, newValue) {
  // Convert values to strings for comparison and logging
  const oldStr = oldValue === null || oldValue === undefined ? 'null' : String(oldValue);
  const newStr = newValue === null || newValue === undefined ? 'null' : String(newValue);
  
  if (oldStr === newStr) {
    return null;
  }
  
  return {
    field,
    oldValue: oldStr,
    newValue: newStr
  };
}

// Check if items have prices
export function hasItemsWithPrices(items) {
  return items.some(item => item.itemPrice && item.itemPrice > 0);
}

// Validate item exists and belongs to order
export async function validateItemBelongsToOrder(prisma, itemId, orderId) {
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true }
  });
  
  if (!item) {
    return { valid: false, error: 'Item not found' };
  }
  
  if (item.orderId !== orderId) {
    return { valid: false, error: 'Item not found for this order' };
  }
  
  return { valid: true, item };
}

// Get audit action based on changes
export function getAuditAction(changes) {
  if (!changes || changes.length === 0) return null;
  
  const changedFields = changes.map(c => c.field);
  
  // Specific action detection
  if (changes.some(c => c.field === 'containers')) {
    return 'CONTAINERS_UPDATED';
  }
  
  if (changes.every(c => ['height', 'width', 'length', 'weight', 'measurementUnit', 'weightUnit'].includes(c.field))) {
    return 'MEASUREMENTS_UPDATED';
  }
  
  if (changes.length === 1 && changes[0].field === 'serialNumber') {
    return 'SERIAL_NUMBER_UPDATED';
  }
  
  if (changes.some(c => ['isOrdered', 'orderedAt', 'orderedBy'].includes(c.field))) {
    return 'ITEM_ORDERED';
  }
  
  if (changes.some(c => c.field === 'itemPrice')) {
    return 'ITEM_PRICE_UPDATED';
  }
  
  return 'ORDERITEM_UPDATED';
}
