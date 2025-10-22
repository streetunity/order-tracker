# Notification System - Quick Reference

## What's Been Built

A complete notification system backbone for:
- ✅ **Commission notifications** (earned, payments, adjustments)
- ✅ **Operational alerts** (late orders, stage warnings, critical items)
- ✅ **Order status updates** (delivered, status changes)
- ✅ **Role-based filtering** (agents see only their notifications)

## Files Created

### Backend
1. **`/api/prisma/schema.prisma`** - Added `Notification` model
2. **`/api/src/routes/notifications.js`** - Complete notification API
3. **`/api/src/utils/notificationHelpers.js`** - Helper functions for creating notifications
4. **`/api/src/index.js`** - Mounted notification router

### Documentation
5. **`/docs/NOTIFICATIONS.md`** - Comprehensive API documentation

## Database Migration Required

```bash
cd /var/www/order-tracker
git pull origin aws-deployment
cd api
npx prisma db push
npx prisma generate
cd ..
pm2 restart order-tracker-backend
```

## API Endpoints Available

### User Endpoints (All Roles)
- `GET /notifications` - Get user's notifications (role-filtered)
- `GET /notifications/stats` - Get notification statistics
- `PATCH /notifications/:id/read` - Mark notification as read
- `POST /notifications/read-all` - Mark all as read
- `PATCH /notifications/:id/dismiss` - Dismiss notification

### Admin Endpoints
- `POST /notifications` - Create notification manually
- `POST /notifications/generate-operational` - Auto-generate operational alerts
- `DELETE /notifications/:id` - Delete notification
- `POST /notifications/cleanup` - Clean up old notifications

## Notification Types

### Categories
- **COMMISSION** - Commission-related
- **OPERATIONAL** - Order/item alerts
- **ALERT** - System alerts
- **INFO** - Informational

### Specific Types
- `COMMISSION_EARNED` - Commission earned on order
- `COMMISSION_PAYMENT` - Commission payment processed
- `STAGE_WARNING` - Item approaching threshold
- `STAGE_CRITICAL` - Item critically overdue
- `ORDER_LATE` - Order running late
- `ORDER_DELIVERED` - Order delivered

### Priority Levels
- `LOW` - Informational
- `NORMAL` - Standard
- `HIGH` - Requires attention
- `CRITICAL` - Urgent action required

## Quick Usage Examples

### Generate Operational Notifications (Admin)
```bash
curl -X POST http://localhost:4000/notifications/generate-operational \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### Get User's Unread Notifications
```bash
curl http://localhost:4000/notifications?unreadOnly=true \
  -H "Authorization: Bearer USER_TOKEN"
```

### Create Commission Notification (Code)
```javascript
import { createCommissionNotification } from './utils/notificationHelpers.js';

await createCommissionNotification(prisma, {
  userId: salesRepUserId,
  orderId: order.id,
  orderPoNumber: order.poNumber,
  commissionAmount: 1500,
  orderDate: order.orderDate,
  customerName: order.account.name
});
```

## Role-Based Filtering

### AGENT
- Only sees notifications for orders they sold (where `order.sku` = their name)
- Cannot see other agents' notifications
- Can manage their own notifications

### ADMIN/SUPER_ADMIN
- Can see all notifications
- Can filter by userId
- Can create/delete any notification
- Can run bulk operations

## Integration with Existing Features

### With Operational Reports
The operational reports (`/reports/operational/action-required`) already identify late items. The notification system can automatically create alerts for these:

```javascript
// Manual trigger or scheduled job
await fetch('/notifications/generate-operational', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${adminToken}` }
});
```

### With Commission System (Future)
When the commission system calculates earnings:

```javascript
// When order delivered and commission calculated
await createCommissionNotification(prisma, {
  userId: salesRepId,
  orderId: orderId,
  orderPoNumber: poNumber,
  commissionAmount: calculatedAmount,
  orderDate: orderDate,
  customerName: customerName
});
```

### With Stage Changes
Automatically create notifications when items exceed thresholds:

```javascript
// This is what generate-operational does:
// 1. Checks all active items
// 2. Compares against stage thresholds
// 3. Creates STAGE_WARNING or STAGE_CRITICAL notifications
// 4. Prevents duplicates (24-hour window)
```

## Next Steps for Frontend

### 1. Notification Bell Component
Display unread count in navbar:
```javascript
const { data } = await fetch('/notifications/stats');
// Show data.unread count
```

### 2. Notification List Page
Show all notifications with filtering:
```javascript
const { data } = await fetch('/notifications?unreadOnly=true&category=COMMISSION');
```

### 3. Mark as Read on Click
```javascript
await fetch(`/notifications/${id}/read`, { method: 'PATCH' });
```

### 4. Real-time Updates (Future)
Consider polling or WebSocket for live notifications

## Scheduled Job Recommendation

Set up a daily cron job to auto-generate operational notifications:

```bash
# Run daily at 8 AM
0 8 * * * curl -X POST http://localhost:4000/notifications/generate-operational \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

Or use a scheduler library like `node-cron` in the backend.

## Testing the System

### 1. Generate Test Notifications
```bash
# SSH into server
ssh user@server

# Generate operational notifications
curl -X POST http://localhost:4000/notifications/generate-operational \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### 2. Check Notifications for User
```bash
curl http://localhost:4000/notifications \
  -H "Authorization: Bearer USER_TOKEN"
```

### 3. Verify Role Filtering
- Login as AGENT → Should only see their notifications
- Login as ADMIN → Should see all notifications

## Monitoring and Maintenance

### Daily
- Review critical notifications
- Check notification generation is working

### Weekly
- Run cleanup to remove old notifications
- Monitor notification read rates

### Monthly
- Analyze notification effectiveness
- Adjust stage thresholds if needed
- Review notification types and priorities

## Common Scenarios

### Scenario 1: Item Running Late
1. Item exceeds warning threshold (e.g., 7 days in MANUFACTURING)
2. `generate-operational` creates `STAGE_WARNING` notification
3. Sales agent sees notification in their feed
4. If item reaches critical threshold → `STAGE_CRITICAL` created

### Scenario 2: Commission Earned
1. Order is delivered
2. Commission calculation runs
3. `createCommissionNotification()` called
4. Agent sees "Commission Earned: $1500" notification

### Scenario 3: Monthly Commission Payment
1. Accountant processes payments
2. For each agent: `createCommissionPaymentNotification()` called
3. Agent sees "Commission Payment: $5000" for the month

## Database Schema Summary

```prisma
model Notification {
  id              String   @id @default(cuid())
  userId          String   // Who to notify
  type            String   // COMMISSION_EARNED, STAGE_WARNING, etc.
  category        String   // COMMISSION, OPERATIONAL, etc.
  title           String   // "Commission Earned: $1500"
  message         String   // Detailed message
  relatedOrderId  String?  // Link to order
  relatedItemId   String?  // Link to item
  metadata        String?  // JSON with extra data
  isRead          Boolean  @default(false)
  isDismissed     Boolean  @default(false)
  priority        String   @default("NORMAL")
  createdAt       DateTime @default(now())
  expiresAt       DateTime?
}
```

## Success Metrics

Track these to measure notification effectiveness:
- Notification read rate
- Time to read critical notifications
- Number of dismissed notifications
- False positive rate (notifications that don't need action)
- Commission notification accuracy

## Support

For detailed API documentation, see `/docs/NOTIFICATIONS.md`

For system architecture questions, refer to main project documentation.

---

**Ready to deploy!** Just run the database migration commands and restart the backend.
