// api/src/helpers/itemPermissions.js
// Permission and access control helpers for items

import { isManufacturer, isAdminOrHigher } from '../utils/roleHelpers.js';

// Helper to check if user can access a specific item
export async function canAccessItem(user, itemId, prisma) {
  // Admins and higher can access all items
  if (isAdminOrHigher(user.role)) return true;
  
  // Manufacturers: Check if item is assigned to them
  if (isManufacturer(user.role)) {
    if (!user.manufacturer || !user.manufacturer.id) return false;
    
    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: { manufacturerId: true }
    });
    
    if (!item) return false;
    const hasAccess = item.manufacturerId === user.manufacturer.id;
    
    if (!hasAccess) {
      console.log(`[ACCESS DENIED] Manufacturer ${user.name} tried to access item ${itemId} not assigned to them`);
    }
    
    return hasAccess;
  }
  
  // Agents: Check if item's order belongs to them
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: { order: { select: { sku: true } } }
  });
  
  if (!item) return false;
  return item.order.sku === user.name;
}

// Check what fields a user can edit
export function getAllowedEditFields(userRole) {
  if (isManufacturer(userRole)) {
    // Manufacturers can ONLY edit serial number
    return ['serialNumber'];
  }
  
  // Admin and agents can edit all fields
  return [
    'productCode', 'qty', 'serialNumber', 'modelNumber',
    'manufacturerId', 'voltage', 'laserWattage', 'notes',
    'hasExtendedShipping', 'itemPrice', 'privateItemNote',
    'archivedAt', 'containers', 'height', 'width', 'length',
    'weight', 'measurementUnit', 'weightUnit', 'currentStage',
    'isOrdered', 'orderedAt', 'orderedBy'
  ];
}

// Check if user can perform specific actions
export function canCreateItems(userRole) {
  return !isManufacturer(userRole);
}

export function canDeleteItems(userRole) {
  return !isManufacturer(userRole);
}

export function canMarkAsOrdered(userRole) {
  return !isManufacturer(userRole);
}

// Validate field access for manufacturers
export function validateManufacturerFieldAccess(requestBody, userRole, userName) {
  if (!isManufacturer(userRole)) return { allowed: true };
  
  const requestedFields = Object.keys(requestBody);
  const nonSerialFields = requestedFields.filter(f => f !== 'serialNumber');
  
  if (nonSerialFields.length > 0) {
    console.log(`[ACCESS DENIED] Manufacturer ${userName} tried to edit fields other than serialNumber: ${nonSerialFields.join(', ')}`);
    return {
      allowed: false,
      error: 'Access denied. Manufacturers can only edit the serial number field.',
      deniedFields: nonSerialFields
    };
  }
  
  console.log(`[ALLOWED] Manufacturer ${userName} editing serial number`);
  return { allowed: true };
}

// Fields that can be edited even when order is locked
export const LOCKED_ORDER_EDITABLE_FIELDS = [
  'archivedAt', 'containers', 'serialNumber',
  'height', 'width', 'length', 'weight',
  'measurementUnit', 'weightUnit', 'itemPrice',
  'privateItemNote', 'hasExtendedShipping',
  'isOrdered', 'orderedAt', 'orderedBy'
];

// Fields that require special handling
export const MEASUREMENT_FIELDS = ['height', 'width', 'length', 'weight', 'measurementUnit', 'weightUnit'];
export const STRING_FIELDS = ['modelNumber', 'voltage', 'laserWattage', 'notes'];
export const PRICE_FIELDS = ['itemPrice'];
