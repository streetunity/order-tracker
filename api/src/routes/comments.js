/**
 * Comments Routes
 * Internal comments on estimates and invoices with @mention support
 */

import express from 'express';
import { authGuard } from '../middleware/auth.js';
import { invoicingAuth } from '../middleware/invoicingAuth.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createCommentsRouter() {
  const router = express.Router();

  /**
   * Parse @mentions from comment content
   * Returns array of user IDs that were mentioned
   */
  async function parseMentions(content) {
    // Match @username patterns (alphanumeric + dots + underscores)
    const mentionPattern = /@([a-zA-Z0-9._]+)/g;
    const matches = content.match(mentionPattern);

    if (!matches) return [];

    const usernames = matches.map(m => m.slice(1)); // Remove @ symbol

    // Find users by name or email containing the mention
    const users = await prisma.user.findMany({
      where: {
        OR: usernames.map(username => ({
          OR: [
            { name: { contains: username , mode: 'insensitive'} },
            { email: { startsWith: username , mode: 'insensitive' } }
          ]
        })).flat()
      },
      select: { id: true, name: true }
    });

    return users.map(u => u.id);
  }

  /**
   * Create notifications for mentioned users
   */
  async function notifyMentionedUsers(mentionedUserIds, comment, author, entityType, entityInfo) {
    const notifications = mentionedUserIds
      .filter(id => id !== author.id) // Don't notify yourself
      .map(userId => ({
        userId,
        type: 'MENTION',
        category: 'INFO',
        title: `${author.name} mentioned you`,
        message: `${author.name} mentioned you in a comment on ${entityType} ${entityInfo}`,
        metadata: JSON.stringify({
          commentId: comment.id,
          entityType,
          entityId: comment.estimateId || comment.invoiceId,
          authorId: author.id,
          authorName: author.name
        })
      }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
  }

  /**
   * Log activity for comment
   */
  async function logCommentActivity(comment, author, entityType, action = 'comment') {
    const activityData = {
      type: action,
      description: `${author.name} ${action === 'comment' ? 'added a comment' : 'updated a comment'}`,
      performedById: author.id,
      metadata: JSON.stringify({
        commentId: comment.id,
        preview: comment.content.substring(0, 100)
      })
    };

    if (comment.estimateId) {
      activityData.estimateId = comment.estimateId;
      // Get customer from estimate
      const estimate = await prisma.estimate.findUnique({
        where: { id: comment.estimateId },
        select: { customerId: true }
      });
      if (estimate?.customerId) {
        activityData.customerId = estimate.customerId;
      }
    }

    if (comment.invoiceId) {
      activityData.invoiceId = comment.invoiceId;
      // Get customer from invoice
      const invoice = await prisma.invoice.findUnique({
        where: { id: comment.invoiceId },
        select: { customerId: true }
      });
      if (invoice?.customerId) {
        activityData.customerId = invoice.customerId;
      }
    }

    await prisma.customerActivityLog.create({ data: activityData });
  }

  // ============================================
  // CREATE COMMENT
  // ============================================

  router.post('/', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { content, estimateId, invoiceId, customerId } = req.body;
      const authorId = req.user.id;

      if (!content || content.trim() === '') {
        return res.status(400).json({ error: 'Comment content is required' });
      }

      if (!estimateId && !invoiceId) {
        return res.status(400).json({ error: 'Comment must be attached to an estimate or invoice' });
      }

      // Parse @mentions
      const mentionedUserIds = await parseMentions(content);

      // Create comment
      const comment = await prisma.comment.create({
        data: {
          content: content.trim(),
          estimateId: estimateId || null,
          invoiceId: invoiceId || null,
          authorId,
          mentions: mentionedUserIds.length > 0 ? JSON.stringify(mentionedUserIds) : null
        },
        include: {
          author: {
            select: { id: true, name: true, email: true }
          },
          estimate: {
            select: { id: true, estimateNumber: true }
          },
          invoice: {
            select: { id: true, invoiceNumber: true }
          }
        }
      });

      // Notify mentioned users
      if (mentionedUserIds.length > 0) {
        const entityType = comment.estimateId ? 'Estimate' : 'Invoice';
        const entityInfo = comment.estimate?.estimateNumber || comment.invoice?.invoiceNumber || '';
        await notifyMentionedUsers(mentionedUserIds, comment, req.user, entityType, entityInfo);
      }

      // Log activity
      const entityType = comment.estimateId ? 'estimate' : 'invoice';
      await logCommentActivity(comment, req.user, entityType, 'comment');

      res.status(201).json(comment);
    } catch (error) {
      console.error('Create comment error:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  });

  // ============================================
  // LIST COMMENTS FOR ENTITY
  // ============================================

  router.get('/:entityType/:entityId', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;

      const where = {};
      if (entityType === 'estimate') {
        where.estimateId = entityId;
      } else if (entityType === 'invoice') {
        where.invoiceId = entityId;
      } else {
        return res.status(400).json({ error: 'Invalid entity type. Use "estimate" or "invoice"' });
      }

      const comments = await prisma.comment.findMany({
        where,
        include: {
          author: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Parse mentions JSON for each comment
      const commentsWithMentions = comments.map(c => ({
        ...c,
        mentions: c.mentions ? JSON.parse(c.mentions) : []
      }));

      res.json(commentsWithMentions);
    } catch (error) {
      console.error('List comments error:', error);
      res.status(500).json({ error: 'Failed to list comments' });
    }
  });

  // ============================================
  // UPDATE COMMENT
  // ============================================

  router.patch('/:id', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;

      // Get existing comment
      const existing = await prisma.comment.findUnique({
        where: { id },
        include: { author: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      // Only author can edit their comment
      if (existing.authorId !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'You can only edit your own comments' });
      }

      if (!content || content.trim() === '') {
        return res.status(400).json({ error: 'Comment content is required' });
      }

      // Parse new mentions
      const mentionedUserIds = await parseMentions(content);

      const comment = await prisma.comment.update({
        where: { id },
        data: {
          content: content.trim(),
          mentions: mentionedUserIds.length > 0 ? JSON.stringify(mentionedUserIds) : null
        },
        include: {
          author: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      res.json({
        ...comment,
        mentions: comment.mentions ? JSON.parse(comment.mentions) : []
      });
    } catch (error) {
      console.error('Update comment error:', error);
      res.status(500).json({ error: 'Failed to update comment' });
    }
  });

  // ============================================
  // DELETE COMMENT
  // ============================================

  router.delete('/:id', authGuard, invoicingAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Get existing comment
      const existing = await prisma.comment.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      // Only author or admin can delete
      if (existing.authorId !== req.user.id &&
          req.user.role !== 'SUPER_ADMIN' &&
          req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'You can only delete your own comments' });
      }

      await prisma.comment.delete({ where: { id } });

      res.json({ success: true, message: 'Comment deleted' });
    } catch (error) {
      console.error('Delete comment error:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  });

  return router;
}

export default createCommentsRouter;
