# Notification System Documentation

## Overview

The notification system provides real-time alerts for commissions, operational issues, and order status updates. Notifications are **role-filtered** - agents only see notifications for their own orders, while admins can see all notifications.

## Database Schema

### Notification Model

```prisma
model Notification {
  id              String   @id @default(cuid())
  
  // Who this notification is for
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Notification type and category
  type            String   // Specific notification type
  category        String   // Broad category grouping
  
  // Notification content
  title           String
  message         String
  
  // Related entities (optional, for linking)
  relatedOrderId    String?
  relatedItemId     String?
  relatedAccountId  String?
  
  // Metadata (JSON string for flexible data)
  metadata        String?
  
  // State tracking
  isRead          Boolean  @default(false)
  readAt          DateTime?
  isDismissed     Boolean  @default(false)
  dismissedAt     DateTime?
  
  // Priority/severity
  priority        String   @default("NORMAL") // "LOW", "NORMAL", "HIGH", "CRITICAL"
  
  // Timestamps
  createdAt       DateTime @default(now())
  expiresAt       DateTime? // Optional: notifications can expire
}
```

## Notification Types

### Categories
- **COMMISSION** - Commission-related notifications
- **OPERATIONAL** - Order/item status alerts
- **ALERT** - System alerts
- **INFO** - Informational notifications

### Specific Types

#### Commission Types
- `COMMISSION_EARNED` - When a commission is earned on an order
- `COMMISSION_PAYMENT` - When commission payment is processed
- `COMMISSION_ADJUSTMENT` - When commission is adjusted

#### Operational Types
- `STAGE_WARNING` - Item approaching threshold in a stage
- `STAGE_CRITICAL` - Item critically overdue in a stage
- `ORDER_LATE` - Order is running late
- `ORDER_DELIVERED` - Order has been delivered

#### Priority Levels
- `LOW` - Informational only
- `NORMAL` - Standard notification
- `HIGH` - Requires attention
- `CRITICAL` - Urgent action required

## API Endpoints

### Base URL: `/notifications`

All endpoints require authentication via `authGuard` middleware.

---

### `GET /notifications`
Get user's notifications (role-filtered)

**Query Parameters:**
- `unreadOnly` (string, default: "false") - Only return unread notifications
- `category` (string, optional) - Filter by category (COMMISSION, OPERATIONAL, ALERT, INFO)
- `priority` (string, optional) - Filter by priority (LOW, NORMAL, HIGH, CRITICAL)
- `limit` (string, default: "50") - Maximum number of notifications to return
- `userId` (string, optional, admin only) - Filter by specific user

**Response:**
```json
{
  "notifications": [
    {
      "id": "notif123",
      "userId": "user456",
      "type": "COMMISSION_EARNED",
      "category": "COMMISSION",
      "title": "Commission Earned: $1500.00",
      "message": "You earned a commission of $1500.00 from order PO-12345",
      "relatedOrderId": "order789",
      "metadata": {
        "commissionAmount": 1500,
        "orderPoNumber": "PO-12345",
        "orderDate": "2025-10-01",
        "customerName": "Acme Corp"
      },
      "priority": "HIGH",
      "isRead": false,
      "isDismissed": false,
      "createdAt": "2025-10-22T10:30:00Z",
      "user": {
        "id": "user456",
        "name": "John Smith",
        "email": "john@example.com",
        "role": "AGENT"
      }
    }
  ],
  "total": 1,
  "unreadCount": 1
}
```

**Role Behavior:**
- **AGENT**: Only sees their own notifications (filtered by userId)
- **ADMIN/SUPER_ADMIN**: Can see all notifications, or filter by userId

---

### `GET /notifications/stats`
Get notification statistics for user

**Query Parameters:**
- `userId` (string, optional, admin only) - Get stats for specific user

**Response:**
```json
{
  "total": 15,
  "unread": 5,
  "byCategory": {
    "COMMISSION": 3,
    "OPERATIONAL": 10,
    "INFO": 2
  },
  "byPriority": {
    "CRITICAL": 2,
    "HIGH": 3,
    "NORMAL": 0
  }
}
```

---

### `PATCH /notifications/:id/read`
Mark a notification as read

**Response:**
```json
{
  "id": "notif123",
  "isRead": true,
  "readAt": "2025-10-22T11:00:00Z",
  ...
}
```

---

### `POST /notifications/read-all`
Mark all user's notifications as read

**Response:**
```json
{
  "message": "All notifications marked as read",
  "count": 5
}
```

---

### `PATCH /notifications/:id/dismiss`
Dismiss a notification

**Response:**
```json
{
  "id": "notif123",
  "isDismissed": true,
  "dismissedAt": "2025-10-22T11:00:00Z",
  ...
}
```

---

### `POST /notifications` (Admin Only)
Create a notification manually

**Request Body:**
```json
{
  "userId": "user456",
  "type": "COMMISSION_EARNED",
  "category": "COMMISSION",
  "title": "Commission Earned: $1500.00",
  "message": "You earned a commission of $1500.00 from order PO-12345",
  "relatedOrderId": "order789",
  "metadata": {
    "commissionAmount": 1500,
    "orderPoNumber": "PO-12345"
  },
  "priority": "HIGH",
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Required Fields:**
- `userId`
- `type`
- `category`
- `title`
- `message`

**Response:**
```json
{
  "id": "notif123",
  "userId": "user456",
  "type": "COMMISSION_EARNED",
  ...
}
```

---

### `POST /notifications/generate-operational` (Admin Only)
Automatically generate operational notifications based on current order states

**Request Body:**
```json
{
  "userId": "user456" // Optional: generate for specific user only
}
```

**Response:**
```json
{
  "message": "Generated 5 operational notifications",
  "count": 5,
  "notifications": [...]
}
```

**What it does:**
- Scans all active orders/items
- Checks against stage thresholds
- Creates STAGE_WARNING or STAGE_CRITICAL notifications for late items
- Prevents duplicate notifications (won't create if one exists in last 24 hours)
- Role-aware: respects sales rep assignments

---

### `DELETE /notifications/:id` (Admin Only)
Delete a notification

**Response:**
```json
{
  "message": "Notification deleted"
}
```

---

### `POST /notifications/cleanup` (Admin Only)
Clean up old/expired notifications

**Request Body:**
```json
{
  "olderThanDays": 30 // Optional, default: 30
}
```

**Response:**
```json
{
  "message": "Cleaned up 42 old notifications",
  "count": 42
}
```

**What it removes:**
- Expired notifications (expiresAt < now)
- Dismissed notifications older than X days
- Read notifications older than X days

---

## Helper Functions

Located in `/api/src/utils/notificationHelpers.js`

### `createCommissionNotification(prisma, options)`
Create a commission earned notification

**Options:**
```javascript
{
  userId: "user456",
  orderId: "order789",
  orderPoNumber: "PO-12345",
  commissionAmount: 1500,
  orderDate: "2025-10-01",
  customerName: "Acme Corp"
}
```

### `createCommissionPaymentNotification(prisma, options)`
Create a commission payment notification

**Options:**
```javascript
{
  userId: "user456",
  paymentAmount: 5000,
  period: "October 2025",
  orderCount: 12,
  paymentDate: "2025-11-01"
}
```

### `createOrderLateNotification(prisma, options)`
Create an order late notification

**Options:**
```javascript
{
  userId: "user456",
  orderId: "order789",
  itemId: "item123",
  orderPoNumber: "PO-12345",
  productCode: "SMT-1000",
  stage: "MANUFACTURING",
  daysLate: 5,
  customerName: "Acme Corp",
  priority: "HIGH"
}
```

### `createStageWarningNotification(prisma, options)`
Create a stage warning notification

### `createStageCriticalNotification(prisma, options)`
Create a stage critical notification

### `createOrderDeliveredNotification(prisma, options)`
Create an order delivered notification

### `generateOperationalNotifications(prisma, userId?)`
Bulk generate operational notifications based on current states

**Returns:** Array of created notifications

---

## Usage Examples

### Frontend: Fetching Notifications

```javascript
// Get unread notifications
const response = await fetch('/notifications?unreadOnly=true', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const data = await response.json();
console.log(`${data.unreadCount} unread notifications`);
```

### Backend: Creating a Commission Notification

```javascript
import { createCommissionNotification } from './utils/notificationHelpers.js';

// When order is delivered and commission is calculated
const notification = await createCommissionNotification(prisma, {
  userId: salesRepUserId,
  orderId: order.id,
  orderPoNumber: order.poNumber,
  commissionAmount: calculatedCommission,
  orderDate: order.orderDate,
  customerName: order.account.name
});
```

### Scheduled Job: Generate Operational Notifications

```javascript
import { generateOperationalNotifications } from './utils/notificationHelpers.js';

// Run daily via cron job
const notifications = await generateOperationalNotifications(prisma);
console.log(`Created ${notifications.length} operational notifications`);
```

---

## Role-Based Filtering

The notification system respects user roles:

### AGENT Role
- Only sees notifications where `userId` matches their user ID
- Cannot access other users' notifications
- Can only mark their own notifications as read/dismissed

### ADMIN/SUPER_ADMIN Role
- Can see all notifications
- Can filter by userId to see specific user's notifications
- Can create notifications for any user
- Can delete any notification
- Can run bulk operations (generate, cleanup)

---

## Integration Points

### With Commission System
When commissions are calculated or paid:
```javascript
await createCommissionNotification(prisma, { ... });
await createCommissionPaymentNotification(prisma, { ... });
```

### With Order Status Changes
When items move stages or are delivered:
```javascript
// On delivery
await createOrderDeliveredNotification(prisma, { ... });

// On stage change (if late)
await createStageWarningNotification(prisma, { ... });
```

### With Reports
Link notifications to operational reports:
```javascript
// Use existing operational reports data to create notifications
const actionRequired = await fetch('/reports/operational/action-required');
// Process and create notifications for late items
```

---

## Deployment Steps

### 1. Update Database Schema
```bash
cd /var/www/order-tracker
git pull origin aws-deployment
cd api
npx prisma db push
npx prisma generate
```

### 2. Restart Backend
```bash
cd /var/www/order-tracker
pm2 restart order-tracker-backend
```

### 3. Verify API
```bash
curl http://localhost:4000/notifications \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Future Enhancements

1. **Real-time Updates**: WebSocket support for live notifications
2. **Email Notifications**: Send email for critical notifications
3. **SMS Notifications**: Text alerts for critical items
4. **Notification Preferences**: User settings for notification types
5. **Snooze Feature**: Temporarily dismiss notifications
6. **Notification Groups**: Group related notifications together
7. **Push Notifications**: Mobile app push notifications

---

## Testing

### Manual Testing
```bash
# Get notifications
curl http://localhost:4000/notifications \
  -H "Authorization: Bearer YOUR_TOKEN"

# Generate operational notifications (admin only)
curl -X POST http://localhost:4000/notifications/generate-operational \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Mark as read
curl -X PATCH http://localhost:4000/notifications/NOTIF_ID/read \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Expected Notification Flow

1. **Order is created** → No notification yet
2. **Item enters stage** → Timer starts
3. **Item exceeds warning threshold** → STAGE_WARNING notification created
4. **Item exceeds critical threshold** → STAGE_CRITICAL notification created
5. **Order is delivered** → ORDER_DELIVERED notification created
6. **Commission calculated** → COMMISSION_EARNED notification created
7. **Commission paid** → COMMISSION_PAYMENT notification created

---

## Troubleshooting

### No notifications appearing
- Check if user has active orders
- Verify stage thresholds are configured
- Run `/notifications/generate-operational` manually
- Check user role (agents need assigned orders)

### Duplicate notifications
- Helpers check for duplicates within 24 hours
- If seeing duplicates, check notification creation logic

### Performance issues
- Run `/notifications/cleanup` regularly
- Consider archiving old notifications
- Add pagination if needed

---

## Maintenance

### Regular Tasks

**Daily:**
- Run `generate-operational` to create new alerts
- Monitor notification volume

**Weekly:**
- Review critical notifications
- Check notification read rates

**Monthly:**
- Run `cleanup` to remove old notifications
- Analyze notification effectiveness
- Update thresholds if needed
