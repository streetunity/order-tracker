# ORDER TRACKER — Unified System Documentation
## Combined & Updated Technical Manual
### (Order Tracker Overview + November 2025 Updates + Invoicing System)

This document merges and replaces:
- **Order Tracker Overview**
- **November 2025 Updates**
- **Invoicing System Integration (January 2026)**

All conflicting information has been **resolved in favor of the latest updates**.

---

# ⚡ QUICK REFERENCE FOR AI ASSISTANTS

**Read this section first before making any changes to the Order Tracker codebase.**

---

## 🚨 CRITICAL NON-NEGOTIABLE RULES

### **1. API ROUTING PATTERN (MOST CRITICAL)**
**NEVER call the backend directly from browser code.**

✅ **CORRECT:**
```javascript
// Browser → Next.js API Proxy → Backend
fetch('/api/orders', { ... })
```

❌ **WRONG:**
```javascript
// Browser → Backend directly (BREAKS IN PRODUCTION)
fetch('http://localhost:4000/api/orders', { ... })
fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/orders`, { ... })
```

**Why:** Production browser cannot reach `localhost:4000`. All API calls MUST go through Next.js API proxy routes (`/web/app/api/*`).

**Production `.env` has empty `NEXT_PUBLIC_API_BASE` to enforce this pattern.**

---

### **2. ALWAYS DELETE `.next` BEFORE BUILDING**
```bash
# REQUIRED before every build
rm -rf .next
npm run build
```

**Why:** Next.js aggressively caches server components. Stale cache = broken pages, wrong schema, incorrect data.

---

### **3. USE `prisma db push` NOT `migrate deploy`**
```bash
# On EC2 production server
cd /var/www/order-tracker/api
npx prisma db push
npx prisma generate
pm2 restart order-tracker-backend
```

**Why:** No migration files are used. Schema changes applied directly via `db push`.

---

### **4. BROKER ROUTES USE `/customs/*` NOT `/broker/*`**
**Backend routes:** `/customs/*`
**Frontend routes:** `/broker/*`
**API proxy routes:** `/api/customs/*`

**Why:** Ad blockers block URLs containing `/broker/`. Backend uses `/customs/` to avoid interference.

---

### **5. AGENT DATA ISOLATION (RBAC)**
Agents MUST only see their own orders. Filter by:
```javascript
where: {
  OR: [
    { sku: user.username },
    { createdById: user.id },
    { assignedToId: user.id }
  ]
}
```

**Never expose other agents' data.**

---

### **6. PRODUCTION BRANCH: `feature/invoicing-port`**
⚠️ **CRITICAL:** The production branch is now `feature/invoicing-port` (changed from `aws-deployment`).

All deployments, git pulls, and code changes must reference this branch:
```bash
git pull origin feature/invoicing-port
git checkout feature/invoicing-port
```

---

## 📂 QUICK FILE PATHS

| Purpose | Path |
|---------|------|
| **Production code** | `/var/www/order-tracker/` |
| **Frontend** | `/var/www/order-tracker/web/` |
| **Backend** | `/var/www/order-tracker/api/` |
| **Database** | `/var/www/order-tracker/api/dev.db` |
| **Prisma schema** | `/var/www/order-tracker/api/prisma/schema.prisma` |
| **Next.js API proxies** | `/var/www/order-tracker/web/app/api/` |
| **Broker frontend pages** | `/var/www/order-tracker/web/app/broker/` |
| **Invoicing frontend pages** | `/var/www/order-tracker/web/app/invoicing/` |
| **Invoicing API routes** | `/var/www/order-tracker/api/src/routes/{leads,customers,estimates,invoices}.js` |
| **Environment (prod)** | `/var/www/order-tracker/web/.env.production` |

---

## 🌐 INVOICING SYSTEM URLs

| URL | Purpose |
|-----|---------|
| `/invoicing` | Invoicing dashboard |
| `/invoicing/leads` | Lead management |
| `/invoicing/customers` | Customer management |
| `/invoicing/estimates` | Estimate/quote management |
| `/invoicing/invoices` | Invoice management |

---

## 🚀 DEPLOY COMMANDS (PRODUCTION)

### **Full Deployment Workflow**
```bash
# 1. SSH into EC2
ssh ubuntu@smt-orders.com

# 2. Navigate to project
cd /var/www/order-tracker

# 3. Pull latest code
git pull origin feature/invoicing-port

# 4. If schema changed, update database
cd api
npx prisma db push
npx prisma generate
cd ..

# 5. Rebuild frontend
cd web
rm -rf .next
npm run build
cd ..

# 6. Restart services
pm2 restart order-tracker-backend
pm2 restart order-tracker-frontend

# 7. Verify services are running
pm2 status
pm2 logs --lines 50
```

### **Backend Only**
```bash
cd /var/www/order-tracker
git pull origin feature/invoicing-port
pm2 restart order-tracker-backend
pm2 logs order-tracker-backend --lines 30
```

### **Frontend Only**
```bash
cd /var/www/order-tracker/web
rm -rf .next
npm run build
pm2 restart order-tracker-frontend
pm2 logs order-tracker-frontend --lines 30
```

---

## 🔧 COMMON PATTERNS

### **Creating a New API Endpoint**

**Step 1:** Create Next.js API proxy route
```javascript
// /web/app/api/your-endpoint/route.js
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const apiUrl = `${API_BASE_URL}/your-endpoint`;
  const res = await fetch(apiUrl, { headers, cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

**Step 2:** Create backend route
```javascript
// /api/src/routes/yourModule.js
router.get('/your-endpoint', authMiddleware, async (req, res) => {
  // Business logic
  res.json({ success: true, data: ... });
});
```

**Step 3:** Call from frontend
```javascript
const response = await fetch('/api/your-endpoint', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## ❌ COMMON MISTAKES TO AVOID

| Mistake | Why It's Wrong | Correct Approach |
|---------|----------------|------------------|
| Using `${process.env.NEXT_PUBLIC_API_BASE}/...` in frontend | Production has empty `NEXT_PUBLIC_API_BASE` | Use `/api/*` proxy routes |
| Building without deleting `.next` | Stale cache breaks pages | Always `rm -rf .next` first |
| Using `prisma migrate deploy` | No migration files exist | Use `npx prisma db push` |
| Creating `/broker/*` backend routes | Ad blockers block it | Use `/customs/*` instead |
| Not filtering by SKU for AGENT role | Data leak to other agents | Always apply ownership filter |
| Forgetting to restart PM2 after changes | Old code still running | `pm2 restart <service-name>` |
| Using `aws-deployment` branch | Branch is now deprecated | Use `feature/invoicing-port` |

---

## 🔍 QUICK TROUBLESHOOTING

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Broker portal shows no data | Missing API proxy routes | Create `/api/customs/*` proxy routes |
| Frontend crashes after build | `.next` not deleted | `rm -rf .next && npm run build` |
| "Unknown field" Prisma error | Schema out of sync | Run `npx prisma generate` |
| "No such column" SQLite error | Database schema outdated | Run `npx prisma db push` |
| Blank UI / missing data | Prisma client out of sync | `npx prisma generate` + rebuild frontend |
| 401 Unauthorized errors | JWT expired or invalid | Check token in cookies, re-login |
| 403 Forbidden errors | Role doesn't have permission | Check RBAC middleware and user role |
| Ad blocker blocking requests | URL contains `/broker/` | Use `/customs/*` backend routes |
| Invoicing pages not loading | Missing API proxy routes | Check `/api/{leads,customers,estimates,invoices}` routes |

---

## 📚 FULL DOCUMENTATION SECTIONS

- **Section 1:** Executive Summary
- **Section 2:** System Architecture Overview
- **Section 3:** Technology Stack
- **Section 4:** AWS Infrastructure
- **Section 5:** User Roles & Permissions
- **Section 6:** Core Platform Modules
- **Section 7:** Next.js Application Layer
- **Section 8:** Backend API Layer
- **Section 9:** Database & Prisma Schema
- **Section 10:** Deployment & Operations
- **Section 11:** Backup Systems
- **Section 12:** Troubleshooting Guide
- **Section 13:** Key Technical Decisions
- **Section 14:** Command Reference
- **Section 15:** Appendix
- **Section 16:** Invoicing System (Production)

---

**END OF QUICK REFERENCE**

---

## 1. Executive Summary

The Order Tracker is a production-grade full‑stack logistics, manufacturing management, and invoicing platform used by Stealth Machine Tools. It manages the complete lifecycle of a machine tool order— from creation, manufacturing workflow, logistics, customs clearance, document management, commission calculation, delivery, and now includes a comprehensive invoicing and estimating system.

**Core Capabilities:**
- Order and item lifecycle management
- 10-stage manufacturing workflow tracking
- Commission calculation and payout management
- AWS S3 document storage
- Broker portal for customs clearance
- **Invoicing & Estimating System** (leads, customers, estimates, invoices, payments)

This serves as the **master technical documentation** for the entire Order Tracker platform.

---

## 2. System Architecture Overview

The Order Tracker platform is a multi-layer, production-grade web application. The platform also includes a complete invoicing and estimating system for CRM and billing capabilities.

### 2.1 Major System Domains

- **Order Lifecycle** - Order creation, editing, tracking, logistics
- **Manufacturing Workflow** - 10-stage model with ETA calculations
- **Document Management** - AWS S3 storage
- **Commission System** - Item-level tracking with multi-stage payouts
- **Broker Portal** - Customs clearance interface
- **Notification System** - Backend-driven alerts
- **Invoicing & Estimating** - Complete CRM and billing module

### 2.2 Technology Stack
- **Frontend:** Next.js 14+ (Port 3000)
- **Backend:** Node.js/Express (Port 4000)
- **Database:** SQLite with Prisma ORM
- **Process Manager:** PM2 on AWS EC2
- **Repository:** github.com/streetunity/order-tracker
- **Production Branch:** `feature/invoicing-port`

---

## 5. User Roles & Permissions

| Role | Scope | Order Access | Invoicing Access |
|------|-------|--------------|------------------|
| **SUPER_ADMIN** | Everything | Full | Full |
| **ACCOUNTANT** | Finance | Full | Full |
| **ADMIN** | Operations | Full | Full |
| **AGENT** | Sales | Own orders only | Full |
| **MANUFACTURER** | Production | Assigned items only | **None** |
| **BROKER** | Customs | Clearance items only | **None** |

---

## 6. Core Platform Modules

### 6.4.2 Invoicing System Module

The invoicing system is a complete CRM and billing module integrated into Order Tracker.

**Responsibilities:**
- Lead management and tracking
- Customer database management
- Estimate/quote generation with PDF output
- Invoice creation and tracking
- Payment recording and tracking
- Auto-increment numbering (INV-XXXXX, EST-XXXXX, CUST-XXXXX, LEAD-XXXXX)

**Key Features:**
- Lead → Customer conversion workflow
- Estimate → Invoice conversion
- PDF generation for estimates and invoices
- Payment tracking with multiple payment methods

**Access Points:**
- Dashboard: `/invoicing`
- Leads: `/invoicing/leads`
- Customers: `/invoicing/customers`
- Estimates: `/invoicing/estimates`
- Invoices: `/invoicing/invoices`

**Backend Routes:**
- `POST/GET /leads` - Lead CRUD
- `POST/GET /customers` - Customer CRUD
- `POST/GET /estimates` - Estimate CRUD + PDF generation
- `POST/GET /invoices` - Invoice CRUD + payment tracking

**Permissions:**
- Access: SUPER_ADMIN, ACCOUNTANT, ADMIN, AGENT
- Blocked: MANUFACTURER, BROKER

---

## 10. Deployment & Operations

### 10.1 Production Branch

**⚠️ CRITICAL:** The production branch is `feature/invoicing-port`.

All deployments must use this branch:
```bash
git pull origin feature/invoicing-port
git checkout feature/invoicing-port
```

**Historical Note:** The previous production branch was `aws-deployment`. If a full rollback to pre-invoicing state is needed, that branch is still available.

### 10.2 Standard Deployment Process

```bash
# Full Deployment
cd /var/www/order-tracker
git pull origin feature/invoicing-port
cd api && npx prisma db push && npx prisma generate && cd ..
cd web && rm -rf .next && npm run build && cd ..
pm2 restart all
pm2 status
```

---

## 12. Troubleshooting Guide

### Rollback Procedure

```bash
# Option 1: Rollback to previous commit on feature/invoicing-port
git log --oneline -10
git checkout <commit-sha>

# Option 2: Full rollback to pre-invoicing (aws-deployment)
git checkout aws-deployment
cd api && npx prisma db push && npx prisma generate
cd ../web && rm -rf .next && npm run build
pm2 restart all
```

---

## 14. Command Reference

### Git Commands
```bash
git pull origin feature/invoicing-port
git checkout feature/invoicing-port
git log --oneline -10
```

### Full Rebuild Command
```bash
cd /var/www/order-tracker && git pull origin feature/invoicing-port && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all
```

---

## 16. Invoicing System (Production)

### Overview
The invoicing system is a complete CRM and billing module integrated into Order Tracker. It was deployed to production in January 2026 and is fully operational.

### Status
✅ **DEPLOYED TO PRODUCTION**

### Access Points
| URL | Purpose |
|-----|---------|
| `/invoicing` | Dashboard |
| `/invoicing/leads` | Lead management |
| `/invoicing/customers` | Customer management |
| `/invoicing/estimates` | Estimate management |
| `/invoicing/invoices` | Invoice management |

### Backend Routes
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/leads` | GET, POST | List/create leads |
| `/leads/:id` | GET, PUT, DELETE | Single lead operations |
| `/customers` | GET, POST | List/create customers |
| `/customers/:id` | GET, PUT, DELETE | Single customer operations |
| `/estimates` | GET, POST | List/create estimates |
| `/estimates/:id` | GET, PUT, DELETE | Single estimate operations |
| `/invoices` | GET, POST | List/create invoices |
| `/invoices/:id` | GET, PUT, DELETE | Single invoice operations |

### Permissions
- **Access**: SUPER_ADMIN, ACCOUNTANT, ADMIN, AGENT
- **Blocked**: MANUFACTURER, BROKER

### Key Features
- Auto-increment numbering (INV-XXXXX, EST-XXXXX, CUST-XXXXX, LEAD-XXXXX)
- PDF generation for estimates/invoices
- Payment tracking
- Lead → Customer conversion workflow
- Estimate → Invoice conversion

### Database Models
Lead, Customer, Estimate, EstimateItem, Invoice, InvoiceItem, Payment, EmailLog, UserEmailSettings, CompanySettings, ZapierWebhook, CreditMemo, RecurringInvoice, RecurringInvoiceItem, Product, InvoicingSettings

### File Locations
| Purpose | Path |
|---------|------|
| Invoicing frontend | `/var/www/order-tracker/web/app/invoicing/` |
| Invoicing API routes | `/var/www/order-tracker/api/src/routes/{leads,customers,estimates,invoices}.js` |
| Invoicing middleware | `/var/www/order-tracker/api/src/middleware/invoicingAuth.js` |

---

**Document Version:** 2.0  
**Last Updated:** January 21, 2026  
**Production Branch:** feature/invoicing-port  
**Status:** Production System - Active

**Critical Updates:**
- Changed production branch from `aws-deployment` to `feature/invoicing-port`
- Added Invoicing System documentation (Section 16)
- Updated all deployment commands to use new branch
- Added invoicing routes to Quick Reference
- Updated role permissions to include invoicing access