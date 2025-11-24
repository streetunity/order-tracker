# Order Tracker Overview
**Project Handover Document**
**Date:** November 24, 2025
**Prepared for:** Incoming Project Manager

---

## Executive Summary

The Order Tracker is a full-stack web application for Stealth Machine Tools that manages custom manufacturing orders from creation through delivery. The system has undergone significant enhancements including a complete commission tracking module, comprehensive security improvements, backend modularization, AWS S3 document storage, automated database backups, a broker portal, and UI/UX refinements. The application serves both internal staff (admins, agents, accountants), external users (customers, manufacturers), and brokers with role-based access controls.

---

## System Architecture

### Technology Stack
- **Frontend:** Next.js 14+ (Port 3000)
- **Backend:** Node.js/Express (Port 4000)
- **Database:** SQLite with Prisma ORM
- **File Storage:** AWS S3
- **Process Manager:** PM2 on AWS EC2
- **Repository:** github.com/streetunity/order-tracker (aws-deployment branch)
- **Server Path:** /var/www/order-tracker/

### User Roles & Permissions
1. **SUPER_ADMIN** - Full system access, commission settings management
2. **ACCOUNTANT** - Financial reports, commission approval/payment
3. **ADMIN** - Standard admin access (no financial settings)
4. **AGENT** - Sales agents, limited to their own orders (filtered by SKU field)
5. **MANUFACTURER** - External access to assigned items only
6. **BROKER** - Read-only access to orders via dedicated portal

---

## Recent Features (November 2025)

### 7. AWS S3 Document Upload System ✅

**Purpose:** Allow users to upload, download, and manage documents (PDFs, images, spreadsheets) attached to orders, stored securely in AWS S3.

**Technical Implementation:**

**Backend Files:**
- `api/src/services/fileUploadService.js` - S3 upload/download/delete operations
- `api/src/routes/documents.js` - API endpoints for document management
- `api/prisma/schema.prisma` - Added `OrderDocument` model

**Frontend Files:**
- `web/components/DocumentUpload.jsx` - Upload/download/delete UI component
- Integrated into order details page under "Documents" tab

**Database Model:**
```prisma
model OrderDocument {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  fileName    String
  fileSize    Int
  fileType    String
  s3Key       String
  s3Url       String
  uploadedBy  String
  uploadedAt  DateTime @default(now())
  @@index([orderId])
  @@map("order_documents")
}
```

**API Endpoints:**
- `POST /api/orders/:orderId/documents` - Upload document
- `GET /api/orders/:orderId/documents` - List documents
- `GET /api/documents/:documentId/download` - Get signed download URL
- `DELETE /api/documents/:documentId` - Delete document

**File Restrictions:**
- Max size: 10MB
- Allowed types: PDF, JPG, PNG, WEBP, DOCX, XLSX

**Permissions:**
- Agents can only upload to their own orders
- Only uploader, ADMIN, or SUPER_ADMIN can delete
- Downloads use signed URLs (1-hour expiry)

**Environment Variables Required:**
```
AWS_REGION=us-east-1
S3_DOCUMENTS_BUCKET=your-documents-bucket-name
```

---

### 8. Automated Database Backup System ✅

**Purpose:** Daily automated backups of the SQLite database to AWS S3 with 30-day retention.

**Implementation:**
- Backup script: `/usr/local/bin/backup-order-tracker.sh`
- Cron job: Daily at 2 AM (root crontab)
- Log file: `/var/log/order-tracker-backup.log`

**Backup Script Features:**
- Creates SQLite-safe backup using `.backup` command
- Uploads to S3 with timestamp in filename
- Automatically deletes backups older than 30 days
- Logs success/failure

**S3 Bucket Structure:**
```
s3://order-tracker-backups-2025/
  └── daily/
      ├── order-tracker-20251124_020000.db
      ├── order-tracker-20251123_020000.db
      └── ...
```

**Environment Variables Required:**
```
S3_BACKUPS_BUCKET=order-tracker-backups-2025
```

**Manual Backup Command:**
```bash
sudo /usr/local/bin/backup-order-tracker.sh
```

**Verify Backups:**
```bash
aws s3 ls s3://order-tracker-backups-2025/daily/
cat /var/log/order-tracker-backup.log
```

**Restore Process:**
```bash
# Download backup
aws s3 cp s3://order-tracker-backups-2025/daily/order-tracker-YYYYMMDD_HHMMSS.db /tmp/restore.db

# Stop API
pm2 stop order-tracker-backend

# Replace database
cp /tmp/restore.db /var/www/order-tracker/api/dev.db

# Restart API
pm2 restart order-tracker-backend
```

---

### 9. Broker Portal ✅

**Purpose:** Provide brokers with read-only access to view orders and items they're associated with, separate from the main admin interface.

**Technical Implementation:**

**Backend Files:**
- `api/src/routes/broker.js` - All broker-specific API endpoints
- `api/src/middleware/auth.js` - Added BROKER role handling

**Frontend Files:**
- `web/app/broker/` - Dedicated broker pages
  - `page.jsx` - Broker dashboard
  - `orders/page.jsx` - Order list view
  - `orders/[id]/page.jsx` - Order details (read-only)
  - `items-at-sea/page.jsx` - Items in transit view

**Key Features:**
- Separate login portal for brokers
- Read-only access (no edit capabilities)
- Filtered view of orders/items
- Arrival date calculations
- Items at sea tracking
- Notification system for brokers

**API Endpoints (all prefixed with `/broker`):**
- `GET /broker/orders` - List broker's orders
- `GET /broker/orders/:id` - Order details
- `GET /broker/items-at-sea` - Items in transit
- `GET /broker/notifications` - Broker notifications

**UI Enforcement:**
- All edit buttons/fields hidden for brokers
- Forms are disabled
- Archive/lock buttons hidden
- Commission information hidden

**Permissions:**
- Brokers only see orders where they're assigned
- No access to commission data
- No access to admin settings
- Can view documents but not upload/delete

---

### 10. Tabbed Order Details Page ✅

**Purpose:** Organize the order details page into tabs for better navigation as the page has grown with new features.

**Tab Structure:**

**Tab 1: "Details"**
- Order header (customer, contact, address)
- Order information (dates, sales agent, etc.)
- Document links (Dropbox links)
- Items table
- Discount and gross total
- Internal notes section
- Commission status card
- Lock/unlock history

**Tab 2: "Shipping Containers"**
- MeasurementSection component (Items At Sea cards)
- Container management
- Generate Manifest button

**Tab 3: "Documents"**
- DocumentUpload component
- S3 file management

**Implementation:**
- State: `const [activeTab, setActiveTab] = useState("details")`
- Tab buttons styled to match app theme (red active, gray inactive)
- Content conditionally rendered based on `activeTab`
- All existing styling preserved

**File Modified:**
- `web/app/admin/orders/[id]/page.jsx`

---

## CRITICAL: Next.js Build Configuration

### Preventing Prerendering Issues

**THE PERMANENT FIX - ALWAYS APPLY THIS:**

Every authenticated page component MUST include this configuration at the top of the file:

```javascript
"use client";
export const dynamic = 'force-dynamic';
```

**Example:**
```javascript
"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function MyAuthenticatedPage() {
  // Component code...
}
```

### Why This Is Critical

Next.js 14 attempts to prerender pages during the build process. When pages make API calls or use authentication context during component initialization, the build fails because:
1. No authentication context exists at build time
2. API endpoints are not available during static generation
3. The prerender manifest cannot be generated

The `export const dynamic = 'force-dynamic'` directive tells Next.js to:
- **Skip prerendering** for this page entirely
- **Render at request time** instead of build time
- **Prevent build failures** from missing authentication/API data

### When to Apply This Pattern

**ALWAYS use `export const dynamic = 'force-dynamic'` for:**
- ✅ Any page using `useAuth()` hook
- ✅ Any page making API calls in `useEffect` on mount
- ✅ Any page behind authentication
- ✅ Any page accessing user-specific data
- ✅ All admin pages (`/admin/*`)
- ✅ All commission pages (`/admin/commissions/*`, `/my-commissions`)
- ✅ All broker pages (`/broker/*`)
- ✅ All user profile pages

**Do NOT use for:**
- ❌ Public landing pages
- ❌ Static marketing content
- ❌ Login page (unless it checks auth state)

### Additional Best Practices

**1. API Call Pattern:**
```javascript
useEffect(() => {
  if (!user) return; // Always check user exists first

  async function loadData() {
    try {
      const res = await fetch('/api/endpoint', {
        headers: getAuthHeaders(),
        cache: "no-store"  // Prevent Next.js caching
      });
      if (res.ok) {
        const data = await res.json();
        // Process data
      }
    } catch (error) {
      console.error(error);
    }
  }

  loadData();
}, [user]); // Only run when user changes
```

**2. Separate useEffects:**
- Don't combine multiple API calls in one useEffect
- Each data fetching operation should have its own useEffect
- This prevents cascade failures and makes debugging easier

**3. Build Error Recovery:**
If you encounter prerendering errors:
```bash
cd /var/www/order-tracker/web
pm2 stop order-tracker-frontend
rm -rf .next
npm run build
pm2 restart order-tracker-frontend
```

### Historical Context

This issue surfaced repeatedly during commission module development because authenticated pages were being added without the `force-dynamic` export. Every build would fail with:
```
Error: ENOENT: no such file or directory, open '/var/www/order-tracker/web/.next/prerender-manifest.json'
```

The permanent solution is to **always include the export** on new authenticated pages from the start.

---

## Major Work Completed

### 1. Commission Module Implementation ✅

**Comprehensive Features:**
- Multi-stage payout system (50% at Shipping, 50% at Delivered)
- Individual commission rates per sales person
- Automatic calculation when item prices are available
- Approval workflow (Pending → Approved → Paid)
- Flagging system for edge cases (missing prices, deleted orders)
- Orphaned commission handling for deleted orders
- YTD and monthly reporting with CSV/PDF export
- Projected earnings tracking
- Dashboard widgets for quick overview

**Technical Implementation:**
- Database tables: Commission, CommissionPayout, CommissionRate, CommissionStageSetting
- API endpoints: `/api/src/routes/commissions.js` and `/api/src/routes/commissionSettings.js`
- Frontend pages: `/my-commissions`, `/admin/commissions`, `/admin/commission-settings`
- Role-based visibility (agents see own, SUPER_ADMIN/ACCOUNTANT see all)
- **ALL pages use `export const dynamic = 'force-dynamic'`**

### 2. Backend Modularization ✅

**Problem Solved:**
- Original `index.js` was 2,500+ lines (76KB), causing GitHub API truncation issues

**Solution Implemented:**
- Main `index.js` reduced to ~350 lines
- 15+ modular route files in `/api/src/routes/`
- Organized by domain (orders, users, reports, commissions, etc.)
- All files now safe to edit via GitHub

**Key Modules:**
- `orders.js` (24KB) - Order CRUD operations
- `items.js` (28KB) - Item management
- `reports.js` (19KB) - Sales reports
- `commissions.js` - Commission management
- `notifications.js` (21KB) - Alert system
- `manufacturers.js` (11KB) - Manufacturer portal
- `broker.js` - Broker portal
- `documents.js` - S3 document management

### 3. Security Enhancements ✅

**Role-Based Access Control:**
- `buildRoleBasedOrderWhere` helper enforces data isolation
- Agents only access orders where `sku` matches their username
- Manufacturers limited to assigned items
- Brokers have read-only access
- API-level enforcement on all endpoints
- Soft delete for users (prevents accidental data loss)

**Audit System:**
- Comprehensive logging of all order modifications
- Color-coded action tracking
- Measurement change tracking
- Commission approval audit trail

### 4. UI/UX Improvements ✅

**Design System:**
- Consistent red (#dc2626), black, and grayscale color scheme
- Dark theme throughout application
- Improved readability for measurement displays
- Better visual hierarchy
- Mobile-responsive commission pages
- Tooltips and loading states
- Styled modal dialogs (not browser defaults)
- Tabbed navigation for complex pages

### 5. Manufacturing Features ✅

**Manufacturer Management:**
- Separate manufacturer entities with dedicated logins
- Item assignment system
- Filtered access (manufacturers see only their items)
- Extended shipping flag for longer lead times
- Measurement update capabilities

### 6. Notification System ✅

**Implementation:**
- Multiple notification types (COMMISSION, ORDER_LATE, STAGE_WARNING, etc.)
- Priority levels (LOW, NORMAL, HIGH, CRITICAL)
- Read/unread tracking
- Auto-expiration for time-sensitive alerts
- Metadata storage for context

---

## Critical Business Logic

### Commission Calculations
- **Base Formula:** `orderTotal × (rate / 100)`
- **Default Rate:** 5% (configurable per agent)
- **Stage Distribution:** 50% Shipping, 50% Delivered (configurable)
- **Price Snapshot:** Stored at calculation time for audit
- **Auto-flagging:** When prices missing or changed after calculation

### Order Management
- **ETA Calculation:** Averages stage threshold warning/critical days
- **Lock System:** Prevents concurrent editing
- **Multi-Container:** Support for items in multiple shipments
- **Stage Progression:** Triggers commission payouts automatically

### Field Mappings (Legacy Compatibility)
- **Sales Person:** Stored in `sku` field (repurposed legacy field)
- **Customer Docs:** `customerDocsLink` field
- **Order Date:** `orderDate` (not `createdAt`) for reports

---

## Database Management Protocols

### CRITICAL: Schema Update Workflow
**Never skip these steps when modifying schema.prisma:**

1. Update schema on GitHub (aws-deployment branch)
2. SSH to server and pull changes
3. Navigate to `/var/www/order-tracker/api`
4. Run migration: `npx prisma db push`
5. Regenerate client: `npx prisma generate`
6. Restart backend: `pm2 restart order-tracker-backend`

**Common Issues:**
- Blank displays = Usually missing migrations
- "Column does not exist" = Migration not run
- "Unknown field" = Prisma client not regenerated

### Quick Recovery Commands
```bash
# Complete rebuild (fixes most issues)
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all

# Force database sync
cd /var/www/order-tracker/api && npx prisma db push
```

---

## Current Issues & Pending Items

### Known Issues
1. **Email Notifications:** System designed but not implemented (hooks in place)
2. **Commission Refunds:** No clawback mechanism for returns (by design)
3. **Performance:** Large commission reports (>10,000 records) may be slow

### Technical Debt
1. **Database:** SQLite may need migration to PostgreSQL for scale
2. **File Size:** `items.js` module is 28KB (consider splitting)
3. **Testing:** Limited automated test coverage
4. **Documentation:** API documentation needs updating

### Future Enhancements (Designed but Not Built)
1. **Advanced Reporting:**
   - YoY comparative analysis
   - Commission forecasting
   - Team performance metrics

2. **Automation:**
   - Auto-approval for amounts under threshold
   - Scheduled batch payments
   - Payroll system integration

3. **Mobile Support:**
   - Dedicated mobile app for agents
   - Push notifications
   - Mobile approval interface

---

## Deployment & Operations

### Standard Deployment Process
1. **Always use GitHub** for code changes (aws-deployment branch)
2. Pull changes: `git pull origin aws-deployment`
3. Frontend changes:
   ```bash
   cd web
   rm -rf .next  # Clear cache to prevent issues
   npm run build
   pm2 restart order-tracker-frontend
   ```
4. Backend changes: `pm2 restart order-tracker-backend`

### PM2 Management
- View status: `pm2 status`
- View logs: `pm2 logs --lines 30`
- Restart all: `pm2 restart all`

### Server Access
- **Method:** PuTTY SSH
- **Database:** `/var/www/order-tracker/api/dev.db`
- **Backup:** Daily automated at 2 AM to S3

---

## AWS Configuration

### Required IAM Permissions
The EC2 instance role needs:
- `s3:PutObject` - Upload documents
- `s3:GetObject` - Download documents
- `s3:DeleteObject` - Delete documents
- `s3:ListBucket` - List backups

### S3 Buckets
1. **Documents Bucket:** Stores order documents
   - Path structure: `orders/{orderId}/{timestamp}-{uuid}.{ext}`

2. **Backups Bucket:** Stores database backups
   - Path structure: `daily/order-tracker-{YYYYMMDD_HHMMSS}.db`

### Environment Variables
```bash
# AWS Configuration
AWS_REGION=us-east-1
S3_DOCUMENTS_BUCKET=your-documents-bucket
S3_BACKUPS_BUCKET=order-tracker-backups-2025

# App Configuration
DATABASE_URL=file:./dev.db
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://your-domain:3000
```

---

## Key Decisions & Rationale

### Design Decisions
1. **SKU Field for Sales Person:** Maintained legacy field to avoid migration complexity
2. **Soft Delete Only:** Prevents accidental data loss, maintains audit trail
3. **No Commission Cascade Delete:** Preserves financial records when orders deleted
4. **50/50 Stage Split:** Industry standard, configurable per business needs
5. **Role Hierarchy:** SUPER_ADMIN → ACCOUNTANT → ADMIN → AGENT → BROKER (prevents privilege escalation)
6. **Force Dynamic Rendering:** Prevents build failures for authenticated pages
7. **S3 for Documents:** Scalable, secure, with signed URLs for downloads
8. **SQLite Backups to S3:** Simple, reliable, with automatic retention

### Technical Decisions
1. **Modularization:** Essential for GitHub editing (overcame 64KB limit)
2. **SQLite Retention:** Adequate for current scale, migration path exists
3. **JWT Authentication:** Stateless, scalable authentication
4. **Prisma ORM:** Type safety and migration management
5. **Next.js Force Dynamic:** Prevents prerendering issues with auth
6. **Lucide React Icons:** Consistent icon library across app

---

## Testing Checklist

### Critical Paths to Test
- [ ] Order creation → Commission calculation → Stage trigger → Payout
- [ ] Price changes → Flag generation → Admin review → Recalculation
- [ ] User deactivation with pending commissions → Warning → Soft delete
- [ ] Order deletion → Commission orphaning → Admin review
- [ ] Bulk approval/payment operations
- [ ] Report generation and exports
- [ ] Document upload → Download → Delete
- [ ] Broker login → View orders → View documents
- [ ] Database backup → Verify in S3

### Role-Based Testing
- [ ] Agent: Can only see own commissions and orders
- [ ] Admin: Cannot access commission settings
- [ ] ACCOUNTANT: Can approve but not change rates
- [ ] SUPER_ADMIN: Full access to all features
- [ ] BROKER: Read-only access, no edit capabilities
- [ ] MANUFACTURER: Can only see assigned items

### Build Testing
- [ ] Clean build completes without errors: `rm -rf .next && npm run build`
- [ ] All authenticated pages include `export const dynamic = 'force-dynamic'`
- [ ] No prerender-manifest.json errors

---

## Support Resources

### Documentation
- **Commission Module:** See included specification documents
- **API Endpoints:** Documented in route files
- **UI Mockups:** Available in commission-module-ui-mockups.html

### Common Troubleshooting
1. **Blank displays:** Clear Next.js cache (`rm -rf web/.next`)
2. **Commission not calculating:** Check prices and sales person assignment
3. **Payout not triggering:** Verify stage configuration
4. **Permission denied:** Check user role in database
5. **Build fails with prerender error:** Add `export const dynamic = 'force-dynamic'` to page
6. **Document upload fails:** Check S3 bucket permissions and environment variables
7. **Backup not running:** Check cron job (`sudo crontab -l`) and AWS CLI installation

### Contact Points
- **Repository:** github.com/streetunity/order-tracker
- **Branch:** aws-deployment (NEVER use main)
- **Database Backups:** S3 bucket `order-tracker-backups-2025`

---

## Recommendations for Successor

### Immediate Priorities
1. **Verify backup systems** are functioning (`aws s3 ls s3://order-tracker-backups-2025/daily/`)
2. **Review pending commissions** in approval queue
3. **Check system health:** `pm2 status`
4. **Familiarize with commission workflow** (critical for month-end)
5. **Review Next.js build configuration** section above
6. **Verify S3 bucket access** and document uploads

### Short-term (1-3 months)
1. **Implement email notifications** (hooks already in place)
2. **Add automated testing** for commission calculations
3. **Performance optimization** for large datasets
4. **Update API documentation**

### Long-term Considerations
1. **Database migration** to PostgreSQL for scale
2. **Mobile application** development
3. **Advanced analytics** and forecasting
4. **Integration** with accounting/payroll systems

---

## Success Metrics

### System Performance
- API response time: < 200ms average
- Commission calculation accuracy: 100%
- System uptime: 99.9%
- Flagged commissions: < 5%
- Build success rate: 100%
- Backup success rate: 100%

### Business Impact
- Agent adoption: > 90%
- Approval turnaround: < 24 hours
- Payment processing: < 48 hours
- User satisfaction: Monitor via feedback

---

## Final Notes

The Order Tracker system is production-ready with comprehensive commission tracking, document management, and backup capabilities. The modularized architecture makes maintenance straightforward, and the role-based security ensures data isolation. The commission module handles complex real-world scenarios including split commissions, multi-stage payouts, and edge cases.

Key principles to maintain:
- **Always use GitHub** for code changes
- **Never skip migrations** when updating schema
- **Maintain modular structure** (keep index.js under 500 lines)
- **Test role-based access** after any permission changes
- **Clear Next.js cache** when experiencing display issues
- **ALWAYS add `export const dynamic = 'force-dynamic'` to authenticated pages**
- **Verify backups are running** daily
- **Check S3 bucket permissions** when adding new features

The system is designed for growth with clear extension points for new features. The commission module foundation supports future enhancements like tiered rates, bonus structures, and automated payments.

---

**Document Version:** 2.0
**Last Updated:** November 24, 2025
**Prepared by:** Development Team
**Status:** Production System - Active
**Major Updates:** Added S3 document storage, automated backups, broker portal, tabbed order details
