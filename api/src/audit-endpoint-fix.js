// audit-endpoint-fix.js
// This adds the missing /audit/:id endpoint that the history page expects

export function addAuditEndpoint(app, prisma, authGuard) {
  // Add the missing /audit/:id endpoint that the history page expects
  app.get('/audit/:entityId', authGuard, async (req, res) => {
    try {
      const logs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { entityId: req.params.entityId },
            { parentEntityId: req.params.entityId }
          ]
        },
        include: {
          performedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      // Parse and format the logs
      const formattedLogs = logs.map(log => {
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
      
      res.json(formattedLogs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Also add a general /audit endpoint for listing all audit logs
  app.get('/audit', authGuard, async (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;
      
      const logs = await prisma.auditLog.findMany({
        include: {
          performedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      });
      
      // Parse and format the logs
      const formattedLogs = logs.map(log => {
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
          parentEntityId: log.parentEntityId,
          changes: changes,
          data: metadata.data || null,
          message: metadata.message || null,
          performedBy: log.performedBy,
          performedByName: log.performedByName,
          createdAt: log.createdAt
        };
      });
      
      res.json(formattedLogs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
