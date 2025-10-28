# Order Tracker Project - Complete Documentation (2025)

## Project Overview

Order Tracker is a comprehensive order management system built with Next.js (frontend) and Express/Prisma (backend). The system provides order tracking, manufacturing management, commission tracking, notifications, and comprehensive reporting capabilities.

## Repository Information

- **GitHub Repository:** https://github.com/streetunity/order-tracker/
- **Branch:** aws-deployment (ALWAYS use this branch)
- **Owner:** streetunity
- **Repository Name:** order-tracker

## Server Information

- **SSH Access:** Use PuTTY to connect to the server
- **Server Path:** /var/www/order-tracker/
- **PM2 Services:**
  - order-tracker-backend (id: 0)
  - order-tracker-frontend (id: 1)

## Critical Development Rules

1. **ALWAYS modify files through GitHub** - NEVER make changes server-side directly
2. **ALWAYS use the aws-deployment branch**
3. **ALL code changes must be made via GitHub** - no exceptions
4. After making changes in GitHub, pull them to the server using:
   ```bash
   cd /var/www/order-tracker
   git pull origin aws-deployment
   ```

## Current Project Structure

```
/var/www/order-tracker/
├── api/
│   ├── prisma/
│   │   └── schema.prisma                 # Database schema
│   └── src/
│       ├── index.js                      # Main entry point (~330 lines)
│       ├── state.js                      # State management
│       ├── rateLimit.js                  # Rate limiting configuration
│       ├── config/                       # Configuration modules
│       │   └── stageThresholds.js        # Stage-specific thresholds
│       ├── helpers/                      # Helper functions
│       ├── middleware/                   # Express middleware
│       │   └── auth.js                   # Authentication guards
│       ├── routes/                       # Route modules (ALL ENDPOINTS HERE)
│       │   ├── accounts.js               # Account management
│       │   ├── audit.js                  # Audit logging endpoints
│       │   ├── auth.js                   # Authentication (login, logout, etc.)
│       │   ├── items.js                  # Order item management
│       │   ├── locks.js                  # Order lock/unlock functionality
│       │   ├── manufacturers.js          # Manufacturer management
│       │   ├── measurements.js           # Measurement tracking
│       │   ├── notifications.js          # Notification system
│       │   ├── orders.js                 # Order CRUD operations
│       │   ├── public.js                 # Public endpoints (tracking)
│       │   ├── reports.js                # Sales & revenue reports
│       │   ├── reportsComplete.js        # Completion reports
│       │   ├── reportsCycleTime.js       # Cycle time analytics
│       │   ├── reportsOperational.js     # Operational reports
│       │   ├── settings.js               # System settings
│       │   ├── stages.js                 # Stage management
│       │   └── users.js                  # User management
│       └── utils/                        # Utility functions
│           └── reportHelpers.js          # Report generation helpers
├── web/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── board/                   # Admin Board page
│   │   │   ├── change-password/         # Password change page
│   │   │   ├── commission-settings/     # Commission configuration
│   │   │   ├── commissions/             # Commission tracking
│   │   │   ├── customers/               # Customer management
│   │   │   ├── kiosk/                   # Kiosk display
│   │   │   ├── manufacturers/           # Manufacturer management
│   │   │   ├── notifications/           # Notification center
│   │   │   ├── orders/                  # Order management
│   │   │   │   ├── [id]/                # Edit Order page
│   │   │   │   └── new/                 # Add New Order page
│   │   │   ├── profile/                 # User profile
│   │   │   ├── reports/                 # Reports section
│   │   │   ├── settings/                # System settings
│   │   │   └── users/                   # User management
│   │   ├── api/                         # API routes
│   │   ├── config/                      # Frontend configuration
│   │   ├── history/                     # Order history
│   │   ├── login/                       # Login page
│   │   └── t/
│   │       └── [token]/                 # Customer tracking page
│   └── .next/                           # Next.js build cache
```

## Database Schema (Current Models)

### Core Models
- **Account** - Customer accounts
- **Order** - Orders with tracking, dates, and metadata
- **OrderItem** - Individual items within orders
- **OrderStatusEvent** - Order stage change history
- **OrderItemStatusEvent** - Item stage change history

### User & Access Models
- **User** - System users with roles
- **Manufacturer** - Manufacturer profiles linked to users

### Audit & Tracking Models
- **AuditLog** - Flexible audit logging for all entities
- **MeasurementAuditLog** - Specific tracking for measurement changes

### Configuration Models
- **StageThreshold** - Warning/critical thresholds per stage
- **SystemSetting** - Global configuration settings
- **Notification** - User notifications and alerts

## User Roles & Permissions

- **SUPER_ADMIN** - Full system access
- **ACCOUNTANT** - Financial and report access
- **ADMIN** - Administrative functions
- **AGENT** - Order management
- **MANUFACTURER** - Limited access to assigned items

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

## Database Schema Update Protocol (CRITICAL)

When modifying the Prisma schema, ALWAYS follow these steps:

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
4. **Run database migration**
   ```bash
   npx prisma migrate deploy
   ```
   If migration fails:
   ```bash
   npx prisma db push
   npx prisma migrate resolve --applied <failed-migration-name>
   ```
5. **Regenerate Prisma Client**
   ```bash
   npx prisma generate
   ```
6. **Restart backend**
   ```bash
   cd /var/www/order-tracker
   pm2 restart order-tracker-backend
   ```
7. **Verify logs**
   ```bash
   pm2 logs order-tracker-backend --lines 20
   ```

## Complete Rebuild Command

For display issues, caching problems, or after significant changes:
```bash
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all && pm2 logs --lines 30
```

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

### Clear Next.js cache (fixes display issues)
```bash
rm -rf web/.next
```

### Check for local changes
```bash
git status
git stash                                    # Stash local changes
git reset --hard origin/aws-deployment       # Reset to remote (WARNING: loses local changes)
```

### Database Issues
```bash
cd api && npx prisma migrate status         # Check migration status
cd api && npx prisma db push                # Force database sync
```

## Important Technical Stack

- **Frontend:** Next.js 14+ (React)
- **Backend:** Node.js Express API (Modularized)
- **Database:** SQLite with Prisma ORM
- **Process Manager:** PM2
- **Authentication:** JWT tokens
- **State Management:** Server-side state.js

## Key Features

### Order Management
- Order creation, editing, archiving
- Multi-item support with manufacturers
- Lock/unlock mechanism
- ETA and installation date tracking
- Customer document links

### Manufacturing Integration
- Manufacturer accounts with limited access
- Item assignment to manufacturers
- Measurement tracking with audit logs
- Ordered status tracking

### Commission System
- Commission settings configuration
- Automatic commission calculation
- Commission reports
- Commission notifications

### Notification System
- Real-time notifications
- Multiple notification types (commission, alerts, operational)
- Priority levels (low, normal, high, critical)
- Read/dismiss tracking

### Reporting Suite
- Sales reports (by date, rep, customer)
- Cycle time analysis
- Operational reports
- Completion tracking
- Stage threshold monitoring

### Audit System
- Comprehensive audit logging
- Entity-specific tracking
- Measurement change history
- User action logging

## Field Mappings & Special Fields

### Important Field Purposes
- **sku** - Stores sales person name (legacy field repurposed)
- **customerDocsLink** - Customer documentation URLs
- **orderDate** - Actual order date (for reports and calculations)
- **itemPrice** - Total price per item (not unit price)
- **privateItemNote** - Internal purchasing notes

### Admin-Only Fields (Editable on Locked Orders)
- `itemPrice` - Item pricing
- `privateItemNote` - Internal notes
- All measurement fields (height, width, length, weight, units)
- `archivedAt` - Archive status
- `customerDocsLink` - Documentation links

### Multi-Container Support
Items support multiple shipping containers stored as JSON in the `containers` field.

## Development Best Practices

### Adding New Features

1. **New Endpoints:** Add to appropriate module in `/api/src/routes/`
   - Sales/revenue → `reports.js`
   - Order operations → `orders.js`
   - Item operations → `items.js`
   - User management → `users.js`
   - Create new module for new domains

2. **Shared Utilities:** Add to `/api/src/utils/`

3. **Configuration:** Add to `/api/src/config/`

4. **Middleware:** Add to `/api/src/middleware/`

5. **Only modify index.js when:**
   - Adding new route module mount points
   - Modifying core Express configuration
   - Changing CORS settings
   - Updating global middleware

### Module Structure Guidelines
- Keep index.js under 500 lines
- Each module handles specific domain
- Use clear, descriptive module names
- Export router factories from modules

## API Endpoints Overview

### Authentication
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user
- `POST /auth/change-password` - Change password

### Orders
- `GET /orders` - List orders (filtered for manufacturers)
- `POST /orders` - Create order
- `GET /orders/:id` - Get order details
- `PUT /orders/:id` - Update order
- `DELETE /orders/:id` - Delete order

### Items
- `POST /orders/:orderId/items` - Add item
- `PUT /orders/:orderId/items/:itemId` - Update item
- `DELETE /orders/:orderId/items/:itemId` - Delete item

### Measurements
- `PUT /orders/:orderId/items/:itemId/measurements` - Update measurements
- `PUT /orders/:orderId/items/:itemId/containers` - Update containers

### Manufacturers
- `GET /manufacturers` - List manufacturers
- `POST /manufacturers` - Create manufacturer
- `PUT /manufacturers/:id` - Update manufacturer
- `DELETE /manufacturers/:id` - Delete manufacturer

### Notifications
- `GET /notifications` - Get user notifications
- `PUT /notifications/:id/read` - Mark as read
- `PUT /notifications/:id/dismiss` - Dismiss notification

### Reports
- Various endpoints under `/reports/*` for different report types
- Sales, cycle time, operational, and completion reports

### Settings
- `GET /settings/stage-thresholds` - Get thresholds
- `PUT /settings/stage-thresholds` - Update thresholds
- `GET /settings/system` - Get system settings
- `PUT /settings/system` - Update system settings

## Environment Variables

Key environment variables used:
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - JWT token secret
- `CORS_ORIGIN` - Allowed CORS origins
- `SERVER_IP` - Server IP address
- `PORT` - API server port (default: 4000)
- `NODE_ENV` - Environment (development/production)

## Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- CORS protection
- Rate limiting on public endpoints
- Audit logging for all critical actions
- Manufacturer access restrictions

## Quick Reference Commands

### One-line pull and restart backend
```bash
cd /var/www/order-tracker && git pull origin aws-deployment && cd api && npx prisma generate && cd .. && pm2 restart order-tracker-backend
```

### Complete rebuild with cache clear
```bash
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all && pm2 logs --lines 30
```

## Contact & Access

- **Server Access:** Via PuTTY (SSH)
- **Git Operations:** Always pull from origin aws-deployment
- **File Editing:** Through GitHub web interface or API only
- **Never edit files directly on server**

## Recent Updates (2025)

- Manufacturer management system implementation
- Notification system for alerts and updates
- Commission tracking and settings
- Enhanced audit logging system
- System-wide settings management
- Multi-container shipping support
- Measurement audit trails
- Rate limiting for public endpoints
- Modularized backend architecture
- Extended reporting capabilities

## Critical Reminders

1. **Never ask which repository** - It's always streetunity/order-tracker
2. **Never ask which branch** - It's always aws-deployment
3. **NEVER suggest server-side edits** - ALWAYS use GitHub
4. **Always run migrations** when schema.prisma is modified
5. **Clear .next cache** when display issues occur
6. **Keep index.js lean** - new code goes in modules
7. **Test locally** before deploying when possible
8. **Check logs** after deployment for errors

## Default Credentials (Change in Production!)

- Admin: admin@stealthmachinetools.com / admin123
- Agent: john@stealthmachinetools.com / agent123

---

*Last Updated: November 2025*
*Version: 2.0 - Modularized Architecture with Enhanced Features*