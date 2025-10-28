# Order Tracker Project - Knowledge Base (UPDATED 2025)

## Repository Information

- **GitHub Repository:** https://github.com/streetunity/order-tracker/
- **Branch:** aws-deployment (ALWAYS use this branch)
- **Owner:** streetunity
- **Repository Name:** order-tracker

## Server Information

- **SSH Access:** Use PuTTY to connect to the server
- **Server Path:** /var/www/order-tracker/
- **PM2 Services:**
  - order-tracker-backend (id: 0) - Port 4000
  - order-tracker-frontend (id: 1) - Port 3000

## Critical Working Rules

1. **ALWAYS modify files through GitHub**, NEVER make changes server-side directly
2. **ALWAYS use the aws-deployment branch**
3. **ALL code changes must be made via GitHub** - no exceptions
4. After making changes in GitHub, pull them to the server using:
   ```bash
   cd /var/www/order-tracker
   git pull origin aws-deployment
   ```

## Project Structure (FULLY MODULARIZED)

```
/var/www/order-tracker/
├── api/
│   ├── prisma/
│   │   ├── schema.prisma              # Database schema (10KB+)
│   │   └── dev.db                     # SQLite database file
│   └── src/
│       ├── index.js                   # Main entry point (~350 lines / 11KB - safe to edit via GitHub)
│       ├── config/                    # Configuration modules
│       │   └── stageThresholds.js     # Stage-specific thresholds
│       ├── helpers/                   # Helper functions
│       │   ├── auditHelpers.js        # Audit logging helpers
│       │   └── orderHelpers.js        # Order-related helpers
│       ├── middleware/                # Express middleware
│       │   └── auth.js                # Authentication guards (authGuard, adminGuard, etc.)
│       ├── routes/                    # Route modules (ALL ENDPOINTS HERE)
│       │   ├── accounts.js            # Account management
│       │   ├── audit.js               # Audit logging endpoints
│       │   ├── auth.js                # Authentication (login, logout, etc.)
│       │   ├── items.js               # Order item management (28KB - largest module)
│       │   ├── locks.js               # Order lock/unlock functionality
│       │   ├── manufacturers.js       # Manufacturer management
│       │   ├── measurements.js        # Measurement tracking
│       │   ├── notifications.js       # Notification system (21KB)
│       │   ├── orders.js              # Order CRUD operations (24KB)
│       │   ├── public.js              # Public endpoints (tracking)
│       │   ├── reports.js             # Sales & revenue reports
│       │   ├── reportsComplete.js     # Completion reports
│       │   ├── reportsCycleTime.js    # Cycle time analytics (24KB)
│       │   ├── reportsOperational.js  # Operational reports
│       │   ├── settings.js            # System settings (16KB)
│       │   ├── stages.js              # Stage management
│       │   └── users.js               # User management (14KB)
│       ├── utils/                     # Utility functions
│       │   ├── measurements.js        # Measurement utilities
│       │   ├── notificationHelpers.js # Notification utilities (9KB)
│       │   ├── password.js            # Password utilities
│       │   ├── reportHelpers.js       # Report generation helpers (8KB)
│       │   └── roleHelpers.js         # Role-based access helpers (4KB)
│       ├── rateLimit.js               # Rate limiting configuration
│       └── state.js                   # Application state management
├── web/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── board/
│   │   │   │   └── page.jsx           # Admin Board page
│   │   │   ├── change-password/
│   │   │   │   └── page.jsx           # Password change page
│   │   │   ├── commission-settings/
│   │   │   │   └── page.jsx           # Commission configuration
│   │   │   ├── commissions/
│   │   │   │   └── page.jsx           # Commission management
│   │   │   ├── customers/
│   │   │   │   └── page.jsx           # Customer management
│   │   │   ├── kiosk/
│   │   │   │   └── page.jsx           # Kiosk display view
│   │   │   ├── manufacturers/
│   │   │   │   └── page.jsx           # Manufacturer management
│   │   │   ├── notifications/
│   │   │   │   └── page.jsx           # Notification center
│   │   │   ├── orders/
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.jsx       # Edit Order page
│   │   │   │   └── new/
│   │   │   │       └── page.jsx       # Add New Order page
│   │   │   ├── profile/
│   │   │   │   └── page.jsx           # User profile
│   │   │   ├── reports/
│   │   │   │   └── page.jsx           # Reports dashboard
│   │   │   ├── settings/
│   │   │   │   └── page.jsx           # System settings
│   │   │   ├── users/
│   │   │   │   └── page.jsx           # User management
│   │   │   └── page.jsx               # Admin dashboard
│   │   └── t/
│   │       └── [token]/
│   │           └── page.jsx           # Customer tracking page
│   ├── components/                    # Shared React components
│   ├── lib/                           # Frontend utilities
│   └── .next/                         # Next.js build cache (clear when having display issues)
```

## User Roles & Permissions

The system has five distinct user roles with different access levels:

1. **SUPER_ADMIN** - Full system access, all features
2. **ACCOUNTANT** - Financial reports and commission management
3. **ADMIN** - Standard admin access, most features except financial
4. **AGENT** - Sales agents with limited access to their own orders
5. **MANUFACTURER** - External manufacturers with access to assigned items

### Role-Based Access Control

- **Agents** can only access orders where `sku` field matches their username
- **Manufacturers** can only view/update items assigned to them
- **Manufacturers** are blocked from viewing reports, audit logs, and order locks
- All API endpoints enforce role-based filtering via `buildRoleBasedOrderWhere` helper

## Database Schema Overview

### Core Models

- **Account** - Customer accounts with contact information
- **Order** - Main order records with ETA, tracking, and stage management
- **OrderItem** - Individual items within orders (supports multi-container shipping)
- **User** - System users with role-based permissions
- **Manufacturer** - External manufacturer companies
- **Notification** - Alert and notification system
- **AuditLog** - Comprehensive audit trail for all entities
- **MeasurementAuditLog** - Detailed measurement change tracking
- **StageThreshold** - Configurable warning/critical day thresholds per stage
- **SystemSetting** - Global system configuration

### Key Field Mappings

- **Sales Person:** Stored in `sku` field on Order model
- **Customer Documents:** Stored in `customerDocsLink` field
- **Order Date:** Stored in `orderDate` field (used for ETA calculations)
- **Manufacturer Assignment:** `manufacturerId` on OrderItem model
- **Multi-Container Support:** `containers` field stores JSON array

## Standard Deployment Process

1. **Make changes in GitHub** (on aws-deployment branch)
2. **SSH into server** using PuTTY
3. **Pull changes:**
   ```bash
   cd /var/www/order-tracker
   git pull origin aws-deployment
   ```
4. **If frontend changes were made:**
   ```bash
   cd web
   npm run build
   pm2 restart order-tracker-frontend
   ```
5. **If backend changes were made:**
   ```bash
   pm2 restart order-tracker-backend
   ```

## Complete Rebuild Command (Use when things aren't working)

When experiencing display issues, caching problems, or after significant changes:
```bash
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all && pm2 logs --lines 30
```

This command:
- Pulls latest changes
- Clears Next.js cache (.next folder - often fixes display issues)
- Rebuilds frontend
- Regenerates Prisma client
- Restarts both services
- Shows logs for verification

## Database Schema Update Protocol (CRITICAL - PREVENTS DISPLAY ISSUES)

**PROBLEM:** When Prisma schema changes are made but database migrations are not run, the application will fail to load data, resulting in blank displays on the board and kiosk views.

### MANDATORY WORKFLOW - Always follow these steps in order:

1. **Update schema.prisma on GitHub** (aws-deployment branch)
2. **SSH into server and pull changes**
   ```bash
   cd /var/www/order-tracker
   git pull origin aws-deployment
   ```
3. **Navigate to API directory**
   ```bash
   cd api
   ```
4. **Run database migration (CRITICAL STEP)**
   ```bash
   npx prisma migrate deploy
   ```
   If that fails with a migration error, use db push:
   ```bash
   npx prisma db push
   npx prisma migrate resolve --applied <failed-migration-name>
   ```
5. **Regenerate Prisma Client**
   ```bash
   npx prisma generate
   ```
6. **Return to root and restart backend**
   ```bash
   cd /var/www/order-tracker
   pm2 restart order-tracker-backend
   ```
7. **Verify logs are clean**
   ```bash
   pm2 logs order-tracker-backend --lines 20
   ```

### Common Errors and What They Mean

- **"The column main.OrderItem.fieldName does not exist"** = Migration not run
- **"Unknown field fieldName for select statement"** = Prisma client not regenerated
- **Blank board/kiosk displays** = Usually database sync issues

## PM2 Commands
```bash
pm2 status                          # View status
pm2 restart order-tracker-frontend  # Restart frontend only
pm2 restart order-tracker-backend   # Restart backend only
pm2 restart all                     # Restart both services
pm2 logs [service-name]             # View logs for specific service
pm2 logs --lines 30                # View last 30 lines of all logs
```

## Common Troubleshooting
```bash
# Clear Next.js cache (fixes many display issues)
rm -rf web/.next

# Check for local changes
git status

# Stash local changes if needed
git stash

# Reset to remote (WARNING: loses local changes)
git reset --hard origin/aws-deployment

# Check Prisma migration status
cd api && npx prisma migrate status

# Force database sync
cd api && npx prisma db push

# Check backend logs for errors
pm2 logs order-tracker-backend --lines 50

# Check frontend build status
cd web && npm run build
```

## Key Files Reference

### Backend Structure (MODULARIZED)
- **Main Entry:** `/api/src/index.js` (~350 lines, safe to edit via GitHub)
  - **IMPORTANT:** Keep this file lean! New functionality goes in modules
  - Only for: core app setup, middleware config, route mounting
  - Target: Keep under 500 lines maximum

### Route Module Sizes (for reference)
- `items.js` - 28KB (largest, handles complex item operations)
- `orders.js` - 24KB (main order CRUD)
- `reportsCycleTime.js` - 24KB (complex analytics)
- `notifications.js` - 21KB (notification system)
- `reports.js` - 19KB (sales reports)
- `settings.js` - 16KB (system configuration)
- `users.js` - 14KB (user management)

### Frontend Key Pages
- **Admin Dashboard:** `/web/app/admin/page.jsx`
- **Order Board:** `/web/app/admin/board/page.jsx`
- **Edit Order:** `/web/app/admin/orders/[id]/page.jsx`
- **Add Order:** `/web/app/admin/orders/new/page.jsx`
- **Customer Tracking:** `/web/app/t/[token]/page.jsx`
- **Kiosk Display:** `/web/app/admin/kiosk/page.jsx`
- **Reports Dashboard:** `/web/app/admin/reports/page.jsx`
- **Global Styles:** `/web/app/globals.css`

## Admin-Only Fields (Can Edit on Locked Orders)

These fields bypass the order lock and can be edited even when locked:
- `itemPrice` - Item pricing information
- `privateItemNote` - Internal purchasing notes
- All measurement fields (height, width, length, weight, units)
- `archivedAt` - Archive/restore status
- `customerDocsLink` - Customer documentation link
- `manufacturerId` - Manufacturer assignment

## Notification System

The application includes a comprehensive notification system:
- **Types:** COMMISSION, ORDER_LATE, STAGE_WARNING, STAGE_CRITICAL, ORDER_DELIVERED
- **Categories:** COMMISSION, OPERATIONAL, ALERT, INFO
- **Priority Levels:** LOW, NORMAL, HIGH, CRITICAL
- **Features:** Read/unread tracking, dismissal, expiration, metadata storage

## Manufacturing Features

- **Manufacturer Management:** Separate manufacturer entities with user accounts
- **Item Assignment:** Items can be assigned to specific manufacturers
- **Filtered Access:** Manufacturers only see items assigned to them
- **Measurement Updates:** Manufacturers can update item measurements
- **Extended Shipping:** Flag for items requiring extended lead times

## Stage Thresholds & ETA System

- **Auto-calculating ETA:** System averages warning and critical days for realistic ETAs
- **Configurable Thresholds:** Per-stage warning and critical day settings
- **On-time Reporting:** Tracks delivery performance against thresholds
- **Visual Indicators:** Color-coded warnings for stage delays

## Development Workflow Rules

1. Never ask which repository - It's always **streetunity/order-tracker**
2. Never ask which branch - It's always **aws-deployment**
3. **NEVER suggest server-side edits** - ALWAYS use **GitHub**
4. PM2 services are **order-tracker-backend** and **order-tracker-frontend**
5. Server path is **/var/www/order-tracker/**
6. **ALWAYS run migrations** when schema.prisma is modified
7. Clear .next cache when display issues occur
8. **Modular Development:**
   - New endpoints go in `/api/src/routes/` modules
   - Keep index.js under 500 lines
   - Organize by domain (orders, users, reports, etc.)

## Adding New Features - Best Practices

### Where to Add New Code

1. **New Endpoints:** Add to appropriate module in `/api/src/routes/`
2. **Shared Utilities:** Add to `/api/src/utils/`
3. **Helpers:** Add to `/api/src/helpers/`
4. **Configuration:** Add to `/api/src/config/`
5. **Middleware:** Add to `/api/src/middleware/`
6. **Only modify index.js for:**
   - Adding new route module mount points
   - Core Express configuration changes
   - CORS settings updates
   - Global middleware changes

### Creating a New Module Example

```javascript
// 1. Create /api/src/routes/newfeature.js
export function createNewFeatureRouter(prisma) {
  const router = express.Router();
  router.get('/endpoint', async (req, res) => {
    // Implementation
  });
  return router;
}

// 2. Add to index.js (minimal change)
import { createNewFeatureRouter } from './routes/newfeature.js';
const newFeatureRouter = createNewFeatureRouter(prisma);
app.use('/newfeature', authGuard, newFeatureRouter);
```

## Recent Enhancements & Fixes

- **Security:** Comprehensive role-based access control across all endpoints
- **Modularization:** Backend split from 2,500+ lines into organized modules
- **ETA System:** Auto-calculating delivery estimates from stage thresholds
- **Sales Reports:** Fixed to use `orderDate` instead of `createdAt`
- **Audit Logging:** Enhanced with color-coded actions and comprehensive tracking
- **UI/UX:** Improved visual hierarchy with red/black/grayscale color scheme
- **Multi-Container:** Support for items shipped in multiple containers
- **Manufacturer Portal:** Separate access for external manufacturers

## Quick Reference Commands
```bash
# One-line pull and restart backend
cd /var/www/order-tracker && git pull origin aws-deployment && cd api && npx prisma generate && cd .. && pm2 restart order-tracker-backend

# Complete rebuild with cache clear
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all && pm2 logs --lines 30

# Database migration and sync
cd /var/www/order-tracker/api && npx prisma db push && npx prisma generate && pm2 restart order-tracker-backend

# Check system health
pm2 status && pm2 logs --lines 20
```

## Security & Authentication

- **JWT Authentication:** Token-based auth with secure HTTP-only cookies
- **Auth Guards:** Multiple middleware levels (authGuard, adminGuard, unlockGuard, nonManufacturerGuard)
- **Role Filtering:** API-level enforcement via `buildRoleBasedOrderWhere`
- **Audit Trail:** Comprehensive logging of all changes
- **Password Security:** Bcrypt hashing with salt rounds

## Performance Considerations

- **Database:** SQLite with proper indexing on key fields
- **Caching:** Next.js build cache, clear when needed
- **Process Management:** PM2 with automatic restart on failure
- **Rate Limiting:** Configured for public endpoints
- **Query Optimization:** Selective includes and role-based filtering

## Backup & Recovery

- **Database Location:** `/var/www/order-tracker/api/prisma/dev.db`
- **Backup Systems:** Automated backups in place
- **Git History:** All code changes tracked in GitHub
- **Migration History:** Prisma migration files tracked

## Contact & Access

- **Server Access:** Via PuTTY (SSH)
- **Git Operations:** Always pull from origin aws-deployment
- **File Editing:** Through GitHub web interface or API only
- **Support:** Check PM2 logs first for troubleshooting

## Version Information

- **Last Updated:** October 2025
- **Next.js:** 14+
- **Node.js:** Latest LTS
- **Prisma:** Latest stable
- **SQLite:** Production database
