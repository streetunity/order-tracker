# Order Tracker Overview
**Project Documentation**  
**Date:** November 29, 2025  
**Status:** Production System - Active  

---

## Executive Summary

The Order Tracker is a full-stack web application for Stealth Machine Tools that manages custom manufacturing orders from creation through customs clearance and delivery. The system includes comprehensive commission tracking, AWS S3 document management, automated database backups, and role-based portals for brokers, manufacturers, and internal staff.

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
- **Database Path:** /var/www/order-tracker/api/dev.db

### AWS Services
- **S3 Document Storage:** Item documents uploaded via fileUploadService.js
- **S3 Backups:** Daily automated backups at 2AM to `order-tracker-backups-2025` bucket

### User Roles & Permissions
1. **SUPER_ADMIN** - Full system access, commission settings management
2. **ACCOUNTANT** - Financial reports, commission approval/payment
3. **ADMIN** - Standard admin access (no financial settings)
4. **AGENT** - Sales agents, limited to their own orders (filtered by SKU field)
5. **MANUFACTURER** - External access to assigned items only
6. **BROKER** - Customs brokers, read-only access to shipping documentation via /broker/* portal

---

## Core Features

### 1. Commission Module ✅

**Features:**
- Multi-stage payout system (configurable percentages at Shipping/Delivered)
- Individual commission rates per sales person
- Automatic calculation when item prices are available
- Approval workflow (Pending → Approved → Paid)
- Flagging system for edge cases (missing prices, deleted orders)
- Orphaned commission handling for deleted orders
- YTD and monthly reporting with CSV/PDF export
- Projected earnings tracking

**Technical Implementation:**
- Database tables: Commission, CommissionPayout, CommissionRate, CommissionStageSetting
- Backend routes: `commissions.js`, `commissionSettings.js`, `commissionPayouts.js`
- Frontend pages: `/my-commissions`, `/admin/commissions`, `/admin/commission-settings`

### 2. Document Management System ✅

**Features:**
- AWS S3 document uploads for items
- Document type checklist (Commercial Invoice, Packing List, Bill of Lading, etc.)
- Progress tracking per item
- Download with pre-signed URLs

**Technical Implementation:**
- Backend: `itemDocuments.js` routes, `fileUploadService.js`
- Next.js API proxy routes at `/api/items/[id]/documents/*`
- Frontend: `ItemDocumentSection.jsx` component

### 3. Broker Portal ✅

**Features:**
- Dedicated login for customs brokers
- Read-only access to shipping documentation
- Dashboard with items requiring customs clearance
- Item detail view with documents
- Clearance history tracking

**Technical Implementation:**
- Backend routes: `broker.js` (mounted at `/customs/*` to avoid ad-blockers)
- Next.js API proxy: `/api/customs/*` routes
- Frontend pages: `/broker/dashboard`, `/broker/item/[id]`, `/broker/history`

### 4. Order Management ✅

**Features:**
- Tabbed order details page (Details, Shipping Containers, Documents)
- Multi-container support for items in different shipments
- 10-stage manufacturing workflow
- ETA calculation and tracking
- Order locking to prevent concurrent edits

### 5. Backend Modularization ✅

**Route Modules in `/api/src/routes/`:**
- `orders.js` (34KB) - Order CRUD operations
- `items.js` (23KB) - Item management
- `commissions.js` (29KB) - Commission management
- `commissionPayouts.js` (20KB) - Payout processing
- `commissionSettings.js` (21KB) - Rate configuration
- `broker.js` (19KB) - Broker portal API
- `reports.js` (19KB) - Sales reports
- `reportsCycleTime.js` (24KB) - Cycle time analytics
- `notifications.js` (22KB) - Alert system
- `itemDocuments.js` (15KB) - Document management
- `manufacturers.js` (11KB) - Manufacturer portal
- `users.js` (15KB) - User management
- `settings.js` (16KB) - System settings
- `measurements.js` (12KB) - Measurement tracking
- `accounts.js` (11KB) - Account management

---

## Critical Business Logic

### Commission Calculations
- **Base Formula:** Item prices × (rate / 100), with proportional discount distribution
- **Default Rate:** 5% (configurable per agent)
- **Stage Distribution:** Configurable percentages at Shipping and Delivered stages
- **Price Snapshot:** Stored at calculation time for audit
- **Item-Level Tracking:** Payouts triggered by individual item stage progression

### Order Management
- **ETA Calculation:** Based on stage threshold warning/critical days
- **Lock System:** Prevents concurrent editing
- **Multi-Container:** Items can ship in different containers at different times
- **Stage Progression:** 10 stages from Manufacturing through Follow-up

### Field Mappings (Legacy Compatibility)
- **Sales Person:** Stored in `sku` field (repurposed legacy field)
- **Customer Docs:** `customerDocsLink` field
- **Order Date:** `orderDate` (not `createdAt`) for reports

---

## Database Management

### CRITICAL: Schema Update Workflow

**Use `npx prisma db push` for schema changes (not migrate deploy):**

1. Update schema.prisma on GitHub (aws-deployment branch)
2. SSH to server and pull changes
3. Navigate to `/var/www/order-tracker/api`
4. Run: `npx prisma db push`
5. Regenerate client: `npx prisma generate`
6. Restart backend: `pm2 restart order-tracker-backend`

**Common Issues:**
- Blank displays = Usually missing schema push or prisma generate
- "Column does not exist" = Schema not pushed
- "Unknown field" = Prisma client not regenerated

### Backup System
- **Schedule:** Daily at 2AM
- **Destination:** S3 bucket `order-tracker-backups-2025`
- **Database Path:** `/var/www/order-tracker/api/dev.db`

### Quick Recovery Commands
```bash
# Complete rebuild (fixes most issues)
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all

# Force database sync
cd /var/www/order-tracker/api && npx prisma db push
```

---

## Deployment & Operations

### Standard Deployment Process
1. **Always use GitHub** for code changes (aws-deployment branch)
2. Pull changes: `git pull origin aws-deployment`
3. Frontend changes:
   ```bash
   cd web
   rm -rf .next    # ALWAYS clear cache
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
- **Backup:** Daily automated to S3

---

## Design System

### Color Scheme (Strictly Enforced)
- **Primary Red:** #dc2626 (buttons, accents, highlights)
- **Background:** Black and grayscale
- **Success:** #10b981 (green - limited use)
- **Warning:** #f59e0b (amber - limited use)

### UI Principles
- Dark theme throughout
- Consistent red accents
- Mobile-responsive layouts
- Tooltips and loading states

---

## Key Technical Decisions

### Design Decisions
1. **SKU Field for Sales Person:** Maintained legacy field to avoid migration complexity
2. **Soft Delete Only:** Prevents accidental data loss, maintains audit trail
3. **No Commission Cascade Delete:** Preserves financial records when orders deleted
4. **Item-Level Commission Tracking:** Items ship separately, commissions track individually
5. **Role Hierarchy:** SUPER_ADMIN → ACCOUNTANT → ADMIN → AGENT → BROKER

### Technical Decisions
1. **Next.js API Proxy Pattern:** Frontend calls `/api/*` routes which proxy to backend - prevents browser CORS/connection issues
2. **`force-dynamic` Export:** All authenticated pages use `export const dynamic = 'force-dynamic'` to prevent Next.js prerendering errors
3. **SQLite Retention:** Adequate for current scale, migration path to PostgreSQL exists
4. **JWT Authentication:** Stateless, scalable authentication
5. **Broker Routes at /customs:** Renamed from /broker to avoid ad-blocker interference

---

## Known Issues & Technical Debt

### Known Issues
1. **Email Notifications:** System designed but not implemented (hooks in place)
2. **Commission Refunds:** No clawback mechanism for returns (by design)
3. **Performance:** Large commission reports (>10,000 records) may be slow

### Technical Debt
1. **Database:** SQLite may need migration to PostgreSQL for scale
2. **Testing:** Limited automated test coverage
3. **Documentation:** API documentation needs updating

---

## Common Troubleshooting

1. **Blank displays:** Clear Next.js cache (`rm -rf web/.next`) and rebuild
2. **Commission not calculating:** Check prices and sales person assignment
3. **Payout not triggering:** Verify stage configuration
4. **Permission denied:** Check user role in database
5. **Build fails with prerender error:** Add `export const dynamic = 'force-dynamic'` to page
6. **ERR_CONNECTION_REFUSED:** Component calling backend directly - needs Next.js API proxy route
7. **Ad-blocker blocking requests:** Check if route contains "broker" - use /customs/* instead

---

## Repository Information

- **Repository:** github.com/streetunity/order-tracker
- **Branch:** aws-deployment (NEVER use main)
- **Owner:** streetunity

---

## Key Principles

- **Always use GitHub** for code changes - never edit server-side directly
- **Always clear .next cache** when deploying frontend changes
- **Use `npx prisma db push`** for schema changes (not migrate deploy)
- **Add `export const dynamic = 'force-dynamic'`** to all authenticated pages
- **Use Next.js API proxy routes** for frontend-to-backend communication
- **Maintain color consistency** - #dc2626 red, black/grayscale backgrounds
- **Test role-based access** after any permission changes

---

**Document Version:** 2.0  
**Last Updated:** November 29, 2025  
**Status:** Production System - Active
