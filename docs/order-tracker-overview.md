# Order Tracker Overview
**Project Handover Document**  
**Date:** January 21, 2026  
**Prepared for:** Incoming Project Manager  

---

## Executive Summary

The Order Tracker is a full-stack web application for Stealth Machine Tools that manages custom manufacturing orders from creation through delivery, along with a comprehensive invoicing and estimating system. The system includes a complete commission tracking module, comprehensive security improvements, backend modularization, and UI/UX refinements. The application serves both internal staff (admins, agents, accountants) and external users (customers, manufacturers, brokers) with role-based access controls.

---

## System Architecture

### Technology Stack
- **Frontend:** Next.js 14+ (Port 3000)
- **Backend:** Node.js/Express (Port 4000)
- **Database:** SQLite with Prisma ORM
- **Process Manager:** PM2 on AWS EC2
- **Document Storage:** AWS S3
- **Repository:** github.com/streetunity/order-tracker (feature/invoicing-port branch)
- **Server Path:** /var/www/order-tracker/

### User Roles & Permissions
1. **SUPER_ADMIN** - Full system access, commission settings management, invoicing
2. **ACCOUNTANT** - Financial reports, commission approval/payment, invoicing
3. **ADMIN** - Standard admin access (no financial settings), invoicing
4. **AGENT** - Sales agents, limited to their own orders (filtered by SKU field), invoicing
5. **MANUFACTURER** - External access to assigned items only
6. **BROKER** - Read-only portal access at /broker/* routes

---

## CRITICAL: Production Branch

**⚠️ ALWAYS use `feature/invoicing-port` branch for all deployments**

The production branch changed from `aws-deployment` to `feature/invoicing-port` in January 2026 when the invoicing system was deployed.

```bash
# Correct deployment command
git pull origin feature/invoicing-port
```

---

## CRITICAL: Next.js Build Configuration

### Preventing Prerendering Issues

Every authenticated page component MUST include this configuration at the top of the file:

```javascript
"use client";
export const dynamic = 'force-dynamic';
```

This prevents Next.js from attempting to prerender pages that require authentication context.

---

## Major Systems

### 1. Order Management System ✅

Core functionality for tracking custom manufacturing orders through stages:
- Order creation and editing
- Multi-stage progression (Ordered → Manufacturing → Shipping → Delivered)
- Lock system to prevent concurrent editing
- Multi-container support for split shipments
- ETA calculation and warning thresholds

### 2. Commission Module ✅

**Comprehensive Features:**
- Multi-stage payout system (50% at Shipping, 50% at Delivered)
- Individual commission rates per sales person
- Automatic calculation when item prices are available
- Approval workflow (Pending → Approved → Paid)
- Flagging system for edge cases
- YTD and monthly reporting with CSV/PDF export

**Technical Implementation:**
- Database tables: Commission, CommissionPayout, CommissionRate, CommissionStageSetting
- API endpoints: `/api/src/routes/commissions.js` and `/api/src/routes/commissionSettings.js`
- Frontend pages: `/my-commissions`, `/admin/commissions`, `/admin/commission-settings`

### 3. Invoicing System ✅ (Deployed January 2026)

**Frontend Routes:**
- `/invoicing` - Dashboard
- `/invoicing/leads` - Lead management
- `/invoicing/customers` - Customer management
- `/invoicing/estimates` - Estimate creation and management
- `/invoicing/invoices` - Invoice management

**Backend Routes:**
- `/api/src/routes/leads.js` - Lead CRUD operations
- `/api/src/routes/customers.js` - Customer CRUD operations
- `/api/src/routes/estimates.js` - Estimate operations
- `/api/src/routes/invoices.js` - Invoice operations
- `/api/src/middleware/invoicingAuth.js` - Invoicing authorization

**Features:**
- Lead tracking with status workflow
- Customer management with contact details
- Estimate creation with line items
- Estimate → Invoice conversion
- Auto-increment numbering (EST-XXXX, INV-XXXX)
- PDF generation
- Payment tracking

**Access:** SUPER_ADMIN, ACCOUNTANT, ADMIN, AGENT (MANUFACTURER and BROKER blocked)

### 4. Document Management System ✅

**AWS S3 Integration:**
- File uploads via `fileUploadService.js`
- Document routes at `/api/src/routes/documents.js`
- 10MB file size limit
- Signed URL access patterns

**Document Types:**
- ISF
- Arrival Notice
- Bill of Lading
- Commercial Invoice
- Packing List
- Delivery Order
- Other

### 5. Broker Portal ✅

- Read-only access at `/broker/*` routes
- Customs document viewing and upload
- Order status tracking

### 6. Manufacturer Portal ✅

- Separate manufacturer entities with dedicated logins
- Item assignment system
- Filtered access (manufacturers see only their items)
- Measurement update capabilities

---

## Backend Modularization

Main `index.js` reduced to ~350 lines with 15+ modular route files in `/api/src/routes/`:

- `orders.js` - Order CRUD operations
- `items.js` - Item management
- `reports.js` - Sales reports
- `commissions.js` - Commission management
- `commissionSettings.js` - Commission configuration
- `notifications.js` - Alert system
- `manufacturers.js` - Manufacturer portal
- `documents.js` - Document management
- `leads.js` - Lead management
- `customers.js` - Customer management
- `estimates.js` - Estimate management
- `invoices.js` - Invoice management

---

## Database Management

### Database Location
`/var/www/order-tracker/api/dev.db`

### Schema Updates
Use `npx prisma db push` (not migrate deploy):

```bash
cd /var/www/order-tracker/api
npx prisma db push
npx prisma generate
pm2 restart order-tracker-backend
```

### Automated Backups
- Daily at 2AM to S3 bucket `order-tracker-backups-2025`
- 30-day retention

---

## Deployment & Operations

### Standard Deployment Process

```bash
# Pull latest changes
cd /var/www/order-tracker
git pull origin feature/invoicing-port

# Frontend rebuild
cd web
rm -rf .next
npm run build
pm2 restart order-tracker-frontend

# Backend restart (if needed)
cd ../api
npx prisma generate
pm2 restart order-tracker-backend
```

### Quick Recovery Commands

```bash
# Complete rebuild (fixes most issues)
cd /var/www/order-tracker && git pull origin feature/invoicing-port && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all
```

### PM2 Management
- View status: `pm2 status`
- View logs: `pm2 logs --lines 30`
- Restart all: `pm2 restart all`

---

## UI/UX Design System

- **Primary accent:** Red (#dc2626)
- **Backgrounds:** Black and grayscale
- **Success states:** Green (#10b981)
- **Warnings:** Amber (#f59e0b)
- Dark theme throughout application

---

## Key Field Mappings (Legacy Compatibility)

- **Sales Person:** Stored in `sku` field (repurposed legacy field)
- **Customer Docs:** `customerDocsLink` field
- **Order Date:** `orderDate` (not `createdAt`) for reports

---

## Common Troubleshooting

1. **Blank displays:** Clear Next.js cache (`rm -rf web/.next`)
2. **Build fails with prerender error:** Add `export const dynamic = 'force-dynamic'` to page
3. **Commission not calculating:** Check prices and sales person assignment
4. **Permission denied:** Check user role in database
5. **"Column does not exist":** Run `npx prisma db push`
6. **"Unknown field":** Run `npx prisma generate`

---

## Contact Points

- **Repository:** github.com/streetunity/order-tracker
- **Branch:** feature/invoicing-port (ALWAYS use this branch)
- **Database Backups:** S3 bucket order-tracker-backups-2025

---

**Document Version:** 2.0  
**Last Updated:** January 21, 2026  
**Status:** Production System - Active  
**Critical Updates:** 
- Added invoicing system documentation
- Changed production branch to feature/invoicing-port
- Added broker portal documentation
- Updated deployment commands
