# Order Tracker Project Documentation
**Last Updated: October 2025**

## Table of Contents
1. [Project Overview](#project-overview)
2. [Repository Information](#repository-information)
3. [Server Configuration](#server-configuration)
4. [Project Architecture](#project-architecture)
5. [Development Workflow](#development-workflow)
6. [Database Management](#database-management)
7. [Deployment Procedures](#deployment-procedures)
8. [API Routes Reference](#api-routes-reference)
9. [Frontend Structure](#frontend-structure)
10. [Common Commands](#common-commands)
11. [Troubleshooting Guide](#troubleshooting-guide)

---

## Project Overview

The Order Tracker is a comprehensive order management system built with:
- **Backend**: Node.js/Express API with modular route architecture
- **Frontend**: Next.js application
- **Database**: SQLite with Prisma ORM
- **Process Manager**: PM2 for service management
- **Authentication**: JWT-based authentication system

## Repository Information

- **GitHub Repository**: https://github.com/streetunity/order-tracker/
- **Primary Branch**: `aws-deployment` (ALWAYS use this branch)
- **Owner**: streetunity
- **Repository Name**: order-tracker

### Critical Rules
1. **ALL code changes must be made via GitHub** - Never edit files directly on the server
2. **Always use the `aws-deployment` branch** for all operations
3. **After GitHub changes**, pull to server using SSH/PuTTY

## Server Configuration

### Access Information
- **Method**: SSH via PuTTY
- **Application Path**: `/var/www/order-tracker/`

### PM2 Services
| Service | ID | Description |
|---------|-----|-------------|
| order-tracker-backend | 0 | Express API server |
| order-tracker-frontend | 1 | Next.js application |

## Project Architecture

### Directory Structure
```
/var/www/order-tracker/
├── api/
│   ├── prisma/
│   │   └── schema.prisma              # Database schema
│   └── src/
│       ├── index.js                   # Main entry (~300 lines, modular)
│       ├── config/                    # Configuration modules
│       │   └── stageThresholds.js
│       ├── helpers/                   # Helper functions
│       ├── middleware/                # Express middleware
│       │   └── auth.js
│       ├── routes/                    # ALL API ENDPOINTS
│       │   ├── accounts.js            # Customer accounts
│       │   ├── audit.js               # Audit logging
│       │   ├── auth.js                # Authentication
│       │   ├── items.js               # Order items
│       │   ├── locks.js               # Order locking
│       │   ├── manufacturers.js       # Manufacturer management
│       │   ├── measurements.js        # Item measurements
│       │   ├── notifications.js       # Notification system
│       │   ├── orders.js              # Order CRUD
│       │   ├── public.js              # Public tracking
│       │   ├── reports.js             # Sales reports
│       │   ├── reportsComplete.js     # Completion reports
│       │   ├── reportsCycleTime.js    # Cycle time analytics
│       │   ├── reportsOperational.js  # Operational reports
│       │   ├── settings.js            # System settings
│       │   ├── stages.js              # Stage management
│       │   └── users.js               # User management
│       ├── utils/                     # Utility functions
│       │   └── reportHelpers.js
│       ├── state.js                   # State management
│       └── rateLimit.js               # Rate limiting config
├── web/
│   ├── app/
│   │   ├── admin/                     # Admin pages
│   │   │   ├── board/                 # Order board
│   │   │   ├── commission-settings/   # Commission configuration
│   │   │   ├── commissions/           # Commission reports
│   │   │   ├── customers/             # Customer management
│   │   │   ├── kiosk/                 # Kiosk display
│   │   │   ├── manufacturers/         # Manufacturer portal
│   │   │   ├── notifications/         # Notification center
│   │   │   ├── orders/                # Order management
│   │   │   ├── profile/               # User profile
│   │   │   ├── reports/               # Report center
│   │   │   ├── settings/              # System settings
│   │   │   └── users/                 # User management
│   │   ├── t/[token]/                 # Customer tracking
│   │   ├── login/                     # Login page
│   │   └── history/                   # Order history
│   └── .next/                         # Next.js build cache
```

### Backend Architecture

The backend follows a **modular architecture**:
- **Main Entry** (`index.js`): Minimal configuration, route mounting (~300 lines)
- **Route Modules** (`/routes/`): All endpoints organized by domain
- **Middleware** (`/middleware/`): Authentication and request processing
- **Utilities** (`/utils/`): Shared helper functions
- **Configuration** (`/config/`): System configuration files

#### Key Architectural Principles
1. **Keep `index.js` under 500 lines** - Add new features to modules
2. **Domain-based organization** - Each route file handles a specific area
3. **Shared utilities** - Common functions in `/utils/`
4. **Configuration separation** - Settings in `/config/`

## Development Workflow

### Standard Development Process

1. **Make changes in GitHub**
   - Navigate to the file in GitHub
   - Switch to `aws-deployment` branch
   - Edit the file using GitHub's editor
   - Commit with descriptive message

2. **Deploy to Server**
   ```bash
   # SSH into server via PuTTY
   cd /var/www/order-tracker
   git pull origin aws-deployment
   ```

3. **Apply Changes**
   - **Frontend changes**: 
     ```bash
     cd web && npm run build
     pm2 restart order-tracker-frontend
     ```
   - **Backend changes**: 
     ```bash
     pm2 restart order-tracker-backend
     ```

### Adding New Features

#### Where to Add Code

| Feature Type | Location | Example |
|-------------|----------|---------|
| New API Endpoint | `/api/src/routes/[domain].js` | Add to existing route file |
| New Route Domain | Create new file in `/api/src/routes/` | `notifications.js` |
| Utility Function | `/api/src/utils/` | `reportHelpers.js` |
| Configuration | `/api/src/config/` | `stageThresholds.js` |
| Middleware | `/api/src/middleware/` | `auth.js` |

#### Creating a New Route Module

1. Create file in `/api/src/routes/newfeature.js`:
```javascript
import express from 'express';

export const createNewFeatureRouter = (prisma) => {
  const router = express.Router();
  
  // Add endpoints here
  router.get('/', async (req, res) => {
    // Implementation
  });
  
  return router;
};
```

2. Mount in `index.js` (minimal change):
```javascript
import { createNewFeatureRouter } from './routes/newfeature.js';
const newFeatureRouter = createNewFeatureRouter(prisma);
app.use('/newfeature', authGuard, newFeatureRouter);
```

## Database Management

### Schema Location
- **File**: `/api/prisma/schema.prisma`
- **Database**: SQLite

### Key Models
- `Account` - Customer accounts
- `Order` - Order records with tracking
- `OrderItem` - Individual items in orders
- `User` - System users with roles
- `Manufacturer` - Manufacturer profiles
- `Notification` - User notifications
- `AuditLog` - Comprehensive audit trail
- `MeasurementAuditLog` - Measurement change tracking
- `StageThreshold` - Stage timing configuration
- `SystemSetting` - Global system settings

### Database Update Protocol

**CRITICAL**: Follow these steps exactly when modifying the schema:

1. **Update schema.prisma in GitHub**
2. **Pull changes to server**:
   ```bash
   cd /var/www/order-tracker
   git pull origin aws-deployment
   ```
3. **Run migration**:
   ```bash
   cd api
   npx prisma migrate deploy
   ```
4. **If migration fails**, use db push:
   ```bash
   npx prisma db push
   npx prisma migrate resolve --applied <migration-name>
   ```
5. **Regenerate Prisma client**:
   ```bash
   npx prisma generate
   ```
6. **Restart backend**:
   ```bash
   cd ..
   pm2 restart order-tracker-backend
   ```
7. **Verify logs**:
   ```bash
   pm2 logs order-tracker-backend --lines 20
   ```

### Common Database Issues

| Error | Cause | Solution |
|-------|-------|----------|
| "Column does not exist" | Migration not run | Run `npx prisma migrate deploy` |
| "Unknown field" | Client not regenerated | Run `npx prisma generate` |
| Blank displays | Database sync issue | Follow full update protocol |

## Deployment Procedures

### Quick Deployment Commands

#### Backend Only
```bash
cd /var/www/order-tracker && \
git pull origin aws-deployment && \
cd api && npx prisma generate && cd .. && \
pm2 restart order-tracker-backend
```

#### Frontend Only
```bash
cd /var/www/order-tracker && \
git pull origin aws-deployment && \
cd web && npm run build && \
pm2 restart order-tracker-frontend
```

#### Complete Rebuild (Fixes Most Issues)
```bash
cd /var/www/order-tracker && \
git pull origin aws-deployment && \
rm -rf web/.next && \
cd web && npm run build && cd .. && \
cd api && npx prisma generate && cd .. && \
pm2 restart all && \
pm2 logs --lines 30
```

### PM2 Management

```bash
# View service status
pm2 status

# Restart services
pm2 restart order-tracker-backend
pm2 restart order-tracker-frontend
pm2 restart all

# View logs
pm2 logs
pm2 logs order-tracker-backend --lines 50
pm2 logs order-tracker-frontend --lines 50

# Monitor resources
pm2 monit
```

## API Routes Reference

### Authentication & Users
- **Module**: `/api/src/routes/auth.js`, `/api/src/routes/users.js`
- **Endpoints**: Login, logout, user management, role management

### Orders & Items
- **Modules**: `/api/src/routes/orders.js`, `/api/src/routes/items.js`
- **Features**: CRUD operations, status updates, item management

### Reporting
- **Modules**: 
  - `reports.js` - Sales and revenue reports
  - `reportsCycleTime.js` - Cycle time analytics
  - `reportsOperational.js` - Operational metrics
  - `reportsComplete.js` - Completion reports

### Manufacturers
- **Module**: `/api/src/routes/manufacturers.js`
- **Features**: Manufacturer portal, item assignment

### Notifications
- **Module**: `/api/src/routes/notifications.js`
- **Features**: Commission alerts, operational notifications, system alerts

### System Configuration
- **Modules**: `/api/src/routes/settings.js`, `/api/src/routes/stages.js`
- **Features**: Stage thresholds, system settings, commission configuration

## Frontend Structure

### Key Pages

| Path | Component | Purpose |
|------|-----------|---------|
| `/admin/board` | Board view | Main order tracking board |
| `/admin/kiosk` | Kiosk display | Public display view |
| `/admin/orders/new` | Add order | Create new orders |
| `/admin/orders/[id]` | Edit order | Modify existing orders |
| `/admin/customers` | Customer management | Manage accounts |
| `/admin/manufacturers` | Manufacturer portal | Manufacturer interface |
| `/admin/notifications` | Notification center | View alerts and updates |
| `/admin/commissions` | Commission tracking | Sales commission reports |
| `/admin/reports` | Report center | All reporting functions |
| `/t/[token]` | Customer tracking | Public order tracking |

### Global Configuration
- **Styles**: `/web/app/globals.css`
- **Layout**: `/web/app/layout.jsx`

## Common Commands

### Development & Debugging
```bash
# Check for uncommitted changes
git status

# Stash local changes
git stash

# Reset to remote state (WARNING: loses local changes)
git reset --hard origin/aws-deployment

# Check Prisma migration status
cd api && npx prisma migrate status

# Force database sync
cd api && npx prisma db push

# Clear Next.js cache
rm -rf web/.next
```

### Monitoring
```bash
# Real-time log monitoring
pm2 logs --lines 100

# Check service health
pm2 describe order-tracker-backend
pm2 describe order-tracker-frontend

# System resource usage
pm2 monit
```

## Troubleshooting Guide

### Common Issues and Solutions

| Issue | Symptoms | Solution |
|-------|----------|----------|
| Display Issues | Blank board/kiosk | Run complete rebuild command |
| Database Errors | "Column not found" | Run migrations and regenerate client |
| Cache Problems | Old UI showing | Clear .next folder and rebuild |
| API Errors | 500 errors | Check PM2 logs for backend |
| Login Issues | Can't authenticate | Verify JWT_SECRET in environment |

### Emergency Procedures

#### Complete System Reset
```bash
# Only use if other methods fail
cd /var/www/order-tracker
git fetch origin
git reset --hard origin/aws-deployment
rm -rf web/.next
rm -rf web/node_modules
rm -rf api/node_modules
cd web && npm install && npm run build
cd ../api && npm install && npx prisma generate
pm2 restart all
```

## Important Field Mappings

| Display Name | Database Field | Notes |
|--------------|---------------|-------|
| Sales Person | `Order.sku` | Legacy field repurposed |
| Customer Docs | `Order.customerDocsLink` | Dropbox URLs |
| Order Date | `Order.orderDate` | Used for ETA calculations |
| Manufacturer | `OrderItem.manufacturerId` | Links to Manufacturer table |
| Item Price | `OrderItem.itemPrice` | Total price for quantity |
| Measurements | `OrderItem.height/width/length/weight` | Editable on locked orders |

## User Roles & Permissions

| Role | Capabilities |
|------|-------------|
| SUPER_ADMIN | Full system access |
| ACCOUNTANT | Financial reports, commission management |
| ADMIN | Order management, user management |
| AGENT | Order creation and updates |
| MANUFACTURER | View assigned items, update status |

## Recent System Updates

### October 2025
- Added manufacturer management system
- Implemented notification system for commissions and alerts
- Added commission configuration and tracking
- Created `reportsComplete.js` for completion metrics
- Enhanced audit logging with flexible entity tracking
- Improved measurement tracking with detailed audit logs

### Architecture Improvements
- Modularized backend from single 2,500-line file to organized modules
- All route handlers moved to `/api/src/routes/`
- Eliminated GitHub API truncation issues
- Improved maintainability and debugging capabilities

## Best Practices

1. **Always edit through GitHub** - Never modify files on server
2. **Test on development first** - If available
3. **Check logs after deployment** - Verify no errors
4. **Document significant changes** - Update this documentation
5. **Use modular architecture** - Add new features to appropriate modules
6. **Keep index.js minimal** - Target under 500 lines
7. **Run migrations for schema changes** - Never skip this step
8. **Clear cache for UI issues** - Delete .next folder

## Support & Maintenance

For issues or questions:
1. Check PM2 logs for error details
2. Review this documentation
3. Verify database migrations are current
4. Ensure all services are running via PM2

---

**Document Version**: 2.0
**Last Modified**: October 2025
**Maintained By**: Development Team
