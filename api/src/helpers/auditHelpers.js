// api/src/helpers/auditHelpers.js
/**
 * Audit Helper Functions
 * Centralized audit logging utilities
 */

/**
 * Create flexible audit log entry
 */
export async function createAuditLog(prisma, {
  entityType,
  entityId,
  parentEntityId = null,
  action,
  changes = null,
  metadata = null,
  userId = null,
  userName = null
}) {
  return await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      parentEntityId,
      action,
      changes: changes ? JSON.stringify(changes) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      performedByUserId: userId,
      performedByName: userName
    }
  });
}

/**
 * Helper for order-specific audit events (backwards compatibility)
 */
export async function logAuditEvent(prisma, orderId, action, reason = null, userId = null, userName = null) {
  return createAuditLog(prisma, {
    entityType: 'Order',
    entityId: orderId,
    parentEntityId: orderId,
    action,
    metadata: reason ? { message: reason } : null,
    userId,
    userName
  });
}

/**
 * Helper to log field changes
 */
export async function logFieldChanges(prisma, entityType, entityId, changes, userId, userName, parentEntityId = null) {
  if (changes.length === 0) return;
  
  return createAuditLog(prisma, {
    entityType,
    entityId,
    parentEntityId,
    action: `${entityType.toUpperCase()}_UPDATED`,
    changes,
    userId,
    userName
  });
}

/**
 * Format audit logs for response
 */
export function formatAuditLogs(logs) {
  return logs.map(log => {
    let changes = [];
    let metadata = {};
    
    try {
      if (log.changes) {
        changes = JSON.parse(log.changes);
      }
      if (log.metadata) {
        metadata = JSON.parse(log.metadata);
      }
    } catch (e) {
      console.error('Error parsing log data:', e);
    }
    
    return {
      id: log.id,
      action: log.action,
      entity: log.entityType,
      entityId: log.entityId,
      changes: changes,
      data: metadata.data || null,
      message: metadata.message || null,
      performedBy: log.performedBy,
      performedByName: log.performedByName,
      createdAt: log.createdAt
    };
  });
}
