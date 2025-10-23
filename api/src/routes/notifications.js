// api/src/routes/notifications.js
import { Router } from 'express';
import { adminGuard } from '../middleware/auth.js';

export function createNotificationsRouter(prisma) {
  const router = Router();

  /**
   * Debug endpoint to check notification userIds vs current user
   */
  router.get('/debug', async (req, res) => {
    try {
      const currentUserId = req.user.id;
      const currentUserIdType = typeof currentUserId;
      
      // Get ALL notifications (not filtered by user)
      const allNotifications = await prisma.notification.findMany({
        select: {
          id: true,
          userId: true,
          isRead: true,
          title: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 100
      });

      // Get all users for reference
      const allUsers = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      });

      // Get unread count with current userId (as string)
      const unreadCount = await prisma.notification.count({
        where: {
          userId: String(currentUserId),
          isRead: false
        }
      });

      // Get unique userIds from notifications
      const uniqueUserIds = [...new Set(allNotifications.map(n => n.userId))];

      // Find notifications that might be for the current user but with wrong ID
      const possibleMatches = allNotifications.filter(n => {
        return n.userId !== String(currentUserId) && n.isRead === false;
      });

      res.json({
        currentUser: {
          id: currentUserId,
          idAsString: String(currentUserId),
          type: currentUserIdType,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role
        },
        counts: {
          totalNotifications: allNotifications.length,
          unreadForCurrentUser: unreadCount,
          totalUsers: allUsers.length
        },
        uniqueUserIds,
        allUsers: allUsers.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          notificationCount: allNotifications.filter(n => n.userId === u.id).length,
          unreadCount: allNotifications.filter(n => n.userId === u.id && !n.isRead).length
        })),
        recentNotifications: allNotifications.slice(0, 20).map(n => {
          const user = allUsers.find(u => u.id === n.userId);
          return {
            id: n.id,
            userId: n.userId,
            userIdType: typeof n.userId,
            userName: user?.name || 'Unknown',
            isRead: n.isRead,
            matchesCurrentUser: n.userId === String(currentUserId),
            title: n.title,
            createdAt: n.createdAt
          };
        })
      });
    } catch (error) {
      console.error('Debug error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Fix orphaned notifications - reassign to current user (admin only)
   */
  router.post('/fix-user-ids', adminGuard, async (req, res) => {
    try {
      const { fromUserId, toUserId } = req.body;
      
      if (!fromUserId || !toUserId) {
        return res.status(400).json({ 
          error: 'Missing required fields: fromUserId, toUserId' 
        });
      }

      const result = await prisma.notification.updateMany({
        where: {
          userId: String(fromUserId)
        },
        data: {
          userId: String(toUserId)
        }
      });

      res.json({
        message: `Reassigned ${result.count} notifications from ${fromUserId} to ${toUserId}`,
        count: result.count
      });
    } catch (error) {
      console.error('Fix user IDs error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get user's notifications (role-filtered)
   * Agents only see their own notifications
   * Admins can see all notifications or filter by userId
   */
  router.get('/', async (req, res) => {
    try {
      const { 
        unreadOnly = 'false', 
        category, 
        priority,
        limit = '50',
        userId // Admin can filter by userId
      } = req.query;

      // Build where clause based on role
      const where = {};

      // Role-based filtering
      if (req.user.role === 'AGENT') {
        // Agents only see their own notifications
        where.userId = String(req.user.id);
      } else if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
        // Admins can filter by userId or see all
        if (userId) {
          where.userId = String(userId);
        }
        // If no userId specified, they see all
      }

      // Additional filters
      if (unreadOnly === 'true') {
        where.isRead = false;
        where.isDismissed = false;
      }

      if (category) {
        where.category = category;
      }

      if (priority) {
        where.priority = priority;
      }

      // Don't show expired notifications
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ];

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: [
          { priority: 'desc' }, // CRITICAL first
          { createdAt: 'desc' }
        ],
        take: parseInt(limit),
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      });

      // Parse metadata JSON for each notification
      const notificationsWithMetadata = notifications.map(n => ({
        ...n,
        metadata: n.metadata ? JSON.parse(n.metadata) : null
      }));

      res.json({
        notifications: notificationsWithMetadata,
        total: notifications.length,
        unreadCount: notifications.filter(n => !n.isRead && !n.isDismissed).length
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get unread notifications for current user
   * Simpler endpoint used by the notification bar
   */
  router.get('/unread', async (req, res) => {
    try {
      const where = {
        userId: String(req.user.id),
        isRead: false,
        isDismissed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      };

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ],
        take: 50 // Limit to prevent performance issues
      });

      // Parse metadata and format for frontend
      const formatted = notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedId: n.relatedOrderId || n.relatedItemId || n.relatedAccountId,
        createdAt: n.createdAt,
        priority: n.priority
      }));

      res.json(formatted);
    } catch (error) {
      console.error('Get unread notifications error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get notification statistics for user
   */
  router.get('/stats', async (req, res) => {
    try {
      // Build where clauses based on role
      const baseWhere = {
        isDismissed: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      };

      // For agents, filter to their own notifications
      // For admins, show all notifications unless they specify a userId
      const isAgent = req.user.role === 'AGENT';
      const filterUserId = isAgent ? String(req.user.id) : (req.query.userId ? String(req.query.userId) : null);

      if (filterUserId) {
        baseWhere.userId = filterUserId;
      }

      const [total, unread, byCategory, byPriority] = await Promise.all([
        // Total active notifications (for agents: only theirs, for admins: all)
        prisma.notification.count({
          where: baseWhere
        }),
        
        // Unread count
        prisma.notification.count({
          where: {
            ...baseWhere,
            isRead: false
          }
        }),
        
        // By category
        prisma.notification.groupBy({
          by: ['category'],
          where: baseWhere,
          _count: true
        }),
        
        // By priority (only unread)
        prisma.notification.groupBy({
          by: ['priority'],
          where: {
            ...baseWhere,
            isRead: false
          },
          _count: true
        })
      ]);

      res.json({
        total,
        unread,
        byCategory: byCategory.reduce((acc, item) => {
          acc[item.category] = item._count;
          return acc;
        }, {}),
        byPriority: byPriority.reduce((acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        }, {})
      });
    } catch (error) {
      console.error('Get notification stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Mark notification as read
   */
  router.patch('/:id/read', async (req, res) => {
    try {
      const { id } = req.params;

      // Verify ownership or admin
      const notification = await prisma.notification.findUnique({
        where: { id }
      });

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      if (req.user.role === 'AGENT' && notification.userId !== String(req.user.id)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('Mark notification read error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Mark all notifications as read for user (POST /read-all)
   */
  router.post('/read-all', async (req, res) => {
    try {
      console.log('[NOTIFICATIONS] Mark all as read called by user:', req.user.id, req.user.name);
      console.log('[NOTIFICATIONS] User ID type:', typeof req.user.id);
      
      const userId = String(req.user.id); // Ensure string type

      // First check how many unread notifications exist
      const unreadBefore = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      console.log('[NOTIFICATIONS] Found', unreadBefore, 'unread notifications for userId:', userId);

      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      console.log('[NOTIFICATIONS] Marked', result.count, 'notifications as read for user:', userId);

      res.json({ 
        message: 'All notifications marked as read',
        count: result.count 
      });
    } catch (error) {
      console.error('Mark all read error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Mark all notifications as read for user (POST /mark-all-read)
   * Alias endpoint for frontend compatibility
   */
  router.post('/mark-all-read', async (req, res) => {
    try {
      console.log('[NOTIFICATIONS] Mark all as read (alias) called by user:', req.user.id, req.user.name);
      console.log('[NOTIFICATIONS] User ID type:', typeof req.user.id);
      
      const userId = String(req.user.id); // Ensure string type

      // First check how many unread notifications exist
      const unreadBefore = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      console.log('[NOTIFICATIONS] Found', unreadBefore, 'unread notifications for userId:', userId);

      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      console.log('[NOTIFICATIONS] Marked', result.count, 'notifications as read for user:', userId);

      res.json({ 
        message: 'All notifications marked as read',
        count: result.count 
      });
    } catch (error) {
      console.error('Mark all read error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Dismiss notification
   */
  router.patch('/:id/dismiss', async (req, res) => {
    try {
      const { id } = req.params;

      // Verify ownership or admin
      const notification = await prisma.notification.findUnique({
        where: { id }
      });

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      if (req.user.role === 'AGENT' && notification.userId !== String(req.user.id)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: {
          isDismissed: true,
          dismissedAt: new Date()
        }
      });

      res.json(updated);
    } catch (error) {
      console.error('Dismiss notification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Create notification (admin only)
   * Used for manual notifications or commission alerts
   */
  router.post('/', adminGuard, async (req, res) => {
    try {
      const {
        userId,
        type,
        category,
        title,
        message,
        relatedOrderId,
        relatedItemId,
        relatedAccountId,
        metadata,
        priority = 'NORMAL',
        expiresAt
      } = req.body;

      if (!userId || !type || !category || !title || !message) {
        return res.status(400).json({ 
          error: 'Missing required fields: userId, type, category, title, message' 
        });
      }

      const notification = await prisma.notification.create({
        data: {
          userId: String(userId),
          type,
          category,
          title,
          message,
          relatedOrderId,
          relatedItemId,
          relatedAccountId,
          metadata: metadata ? JSON.stringify(metadata) : null,
          priority,
          expiresAt: expiresAt ? new Date(expiresAt) : null
        }
      });

      res.status(201).json(notification);
    } catch (error) {
      console.error('Create notification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Generate operational notifications (admin only)
   * Scans for late orders, stage warnings, etc. and creates notifications
   */
  router.post('/generate-operational', adminGuard, async (req, res) => {
    try {
      const { userId } = req.body; // Optional: generate for specific user

      // Get stage thresholds
      const thresholds = await prisma.stageThreshold.findMany();
      const thresholdMap = thresholds.reduce((acc, t) => {
        acc[t.stage] = t;
        return acc;
      }, {});

      // Build order filter
      const orderWhere = {};
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: String(userId) } });
        if (user && user.role === 'AGENT') {
          orderWhere.sku = user.name; // Filter by sales person
        }
      }

      // Get orders with items
      const orders = await prisma.order.findMany({
        where: orderWhere,
        include: {
          items: {
            where: { archivedAt: null },
            include: {
              statusEvents: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          account: {
            select: { name: true }
          }
        }
      });

      const notifications = [];
      const now = new Date();

      // Final stages that shouldn't trigger notifications (items stay here indefinitely)
      const FINAL_STAGES = ['COMPLETED', 'FOLLOW_UP'];

      // Process each order's items
      for (const order of orders) {
        // Determine which user to notify
        let notifyUserId = userId ? String(userId) : null;
        if (!notifyUserId && order.sku) {
          // Find user by sales rep name
          const salesRep = await prisma.user.findFirst({
            where: { name: order.sku, isActive: true }
          });
          if (salesRep) {
            notifyUserId = String(salesRep.id);
          }
        }

        if (!notifyUserId) continue; // Skip if no user to notify

        for (const item of order.items) {
          // Skip final stages - items can stay here indefinitely
          if (FINAL_STAGES.includes(item.currentStage)) {
            continue;
          }

          const lastEvent = item.statusEvents[0];
          const stageEnteredAt = lastEvent ? new Date(lastEvent.createdAt) : new Date(item.createdAt);
          const daysInStage = Math.floor((now - stageEnteredAt) / (1000 * 60 * 60 * 24));

          const threshold = thresholdMap[item.currentStage];
          if (!threshold) continue;

          let priority = 'NORMAL';
          let type = 'STAGE_WARNING';

          // Check if critical or warning
          if (daysInStage >= threshold.criticalDays) {
            priority = 'CRITICAL';
            type = 'STAGE_CRITICAL';
          } else if (daysInStage >= threshold.warningDays) {
            priority = 'HIGH';
            type = 'STAGE_WARNING';
          } else {
            continue; // Not late enough to notify
          }

          // Check if notification already exists for this item
          const existing = await prisma.notification.findFirst({
            where: {
              userId: notifyUserId,
              type,
              relatedItemId: item.id,
              createdAt: {
                gte: new Date(now - 24 * 60 * 60 * 1000) // Within last 24 hours
              }
            }
          });

          if (existing) continue; // Don't duplicate recent notifications

          // Create notification
          const notification = await prisma.notification.create({
            data: {
              userId: notifyUserId,
              type,
              category: 'OPERATIONAL',
              title: `Item ${priority === 'CRITICAL' ? 'Critical' : 'Warning'}: ${item.productCode}`,
              message: `Item ${item.productCode} in order ${order.poNumber || order.id} has been in ${item.currentStage} stage for ${daysInStage} days`,
              relatedOrderId: order.id,
              relatedItemId: item.id,
              metadata: JSON.stringify({
                daysInStage,
                stage: item.currentStage,
                warningDays: threshold.warningDays,
                criticalDays: threshold.criticalDays,
                customerName: order.account?.name
              }),
              priority
            }
          });

          notifications.push(notification);
        }
      }

      res.json({
        message: `Generated ${notifications.length} operational notifications`,
        count: notifications.length,
        notifications
      });
    } catch (error) {
      console.error('Generate operational notifications error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete notification (admin only)
   */
  router.delete('/:id', adminGuard, async (req, res) => {
    try {
      const { id } = req.params;

      await prisma.notification.delete({
        where: { id }
      });

      res.json({ message: 'Notification deleted' });
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Clean up expired/old notifications (admin only)
   */
  router.post('/cleanup', adminGuard, async (req, res) => {
    try {
      const { olderThanDays = 30 } = req.body;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.notification.deleteMany({
        where: {
          OR: [
            {
              // Expired notifications
              expiresAt: {
                lt: new Date()
              }
            },
            {
              // Old dismissed notifications
              isDismissed: true,
              dismissedAt: {
                lt: cutoffDate
              }
            },
            {
              // Old read notifications
              isRead: true,
              readAt: {
                lt: cutoffDate
              }
            }
          ]
        }
      });

      res.json({
        message: `Cleaned up ${result.count} old notifications`,
        count: result.count
      });
    } catch (error) {
      console.error('Cleanup notifications error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createNotificationsRouter;
