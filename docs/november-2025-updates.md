# Order Tracker - November 2025 Updates
**Technical Documentation - Part 2**  
**Date:** November 29, 2025  

---

## Overview

This document covers major features and architectural patterns added during November 2025, including AWS S3 document management, the broker portal, automated backups, and critical Next.js patterns.

---

## 1. AWS S3 Document Management

### Architecture

**Components:**
- `api/src/services/fileUploadService.js` - S3 upload/download service
- `api/src/routes/itemDocuments.js` - Item document API endpoints
- `web/app/api/items/[id]/documents/*` - Next.js API proxy routes
- `web/components/ItemDocumentSection.jsx` - Frontend component

### Document Types Supported
- Commercial Invoice
- Packing List  
- Bill of Lading
- Certificate of Origin
- Customs Declaration
- Insurance Certificate
- Quality Certificate
- Inspection Report
- Other

### S3 Configuration
```javascript
// Environment variables required
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

### API Endpoints

**Backend Routes (localhost:4000):**
```
GET    /api/items/:id/documents         - List documents with checklist
POST   /api/items/:id/documents         - Upload document (multipart/form-data)
DELETE /api/items/:id/documents/:docId  - Delete document
GET    /api/items/:id/documents/:docId/download - Get pre-signed download URL
```

**Next.js Proxy Routes (for frontend use):**
```
GET    /api/items/[id]/documents
POST   /api/items/[id]/documents
DELETE /api/items/[id]/documents/[documentId]
GET    /api/items/[id]/documents/[documentId]/download
```

### Upload Flow
1. Frontend sends FormData to `/api/items/{id}/documents`
2. Next.js proxy forwards to backend
3. Backend uses multer for file handling
4. fileUploadService uploads to S3
5. Document record created in database
6. Returns document metadata with S3 key

### Download Flow
1. Frontend requests `/api/items/{id}/documents/{docId}/download`
2. Backend generates pre-signed S3 URL (expires in 1 hour)
3. Frontend opens URL in new tab

---

## 2. Broker Portal

### Purpose
Read-only portal for customs brokers to access shipping documentation for items requiring customs clearance.

### Route Architecture

**Problem Solved:** Ad-blockers were blocking `/broker/*` routes.

**Solution:** Three-layer routing:
1. **Frontend Pages:** `/broker/*` (user-facing URLs)
2. **Next.js API Proxy:** `/api/customs/*` (internal proxy)
3. **Backend API:** `/customs/*` (actual endpoints)

### Backend Routes (`api/src/routes/broker.js`)

Mounted at `/customs` in index.js:
```javascript
app.use('/customs', brokerRoutes);
```

**Endpoints:**
```
POST   /customs/login                    - Broker authentication
GET    /customs/dashboard                - Items needing clearance
GET    /customs/items/:id                - Single item details
GET    /customs/items/:id/documents      - Item documents
GET    /customs/items/:id/documents/:docId/download - Document download
POST   /customs/items/:id/clear          - Mark item cleared
GET    /customs/history                  - Clearance history
```

### Next.js API Proxy (`web/app/api/customs/*`)

```
web/app/api/customs/
├── dashboard/route.js
├── history/route.js
├── items/
│   └── [id]/
│       ├── route.js
│       ├── clear/route.js
│       └── documents/
│           ├── route.js
│           └── [documentId]/
│               └── download/route.js
└── login/route.js
```

### Frontend Pages

```
web/app/broker/
├── dashboard/page.jsx     - Main dashboard
├── item/[id]/page.jsx     - Item detail view
└── history/page.jsx       - Clearance history
```

### Authentication
- Separate JWT token for brokers
- Stored in `broker_token` cookie
- Role verification on all endpoints

---

## 3. Automated Database Backups

### Configuration
- **Schedule:** Daily at 2:00 AM
- **S3 Bucket:** `order-tracker-backups-2025`
- **Source:** `/var/www/order-tracker/api/dev.db`

### Backup Script Location
Cron job configured on EC2 instance.

### Manual Backup
```bash
# Create manual backup
aws s3 cp /var/www/order-tracker/api/dev.db s3://order-tracker-backups-2025/manual-backup-$(date +%Y%m%d).db
```

### Restore Process
```bash
# Stop services
pm2 stop all

# Download backup
aws s3 cp s3://order-tracker-backups-2025/backup-YYYYMMDD.db /var/www/order-tracker/api/dev.db

# Restart services
pm2 restart all
```

---

## 4. Next.js API Proxy Pattern

### Why This Pattern?

**Problem:** Frontend components calling backend directly via `http://localhost:4000` fail in production because:
1. Browser cannot reach `localhost:4000` on the server
2. Only server-side code can access the backend

**Solution:** Next.js API routes act as proxies:
```
Browser → /api/endpoint → localhost:4000/api/endpoint
         (Next.js proxy)   (Backend API)
```

### Implementation Pattern

**Create proxy route at `web/app/api/[path]/route.js`:**

```javascript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/api-config";

export async function GET(request, { params }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  
  const response = await fetch(`${API_BASE_URL}/api/endpoint/${params.id}`, {
    headers: {
      "Authorization": token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
  });
  
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
```

**API Base URL Configuration (`web/lib/api-config.js`):**
```javascript
export const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';
```

### When to Use

**Use Next.js proxy for:**
- Any frontend component fetching from backend
- Document uploads/downloads
- Any authenticated API calls

**Direct backend calls OK for:**
- Server-side code only (getServerSideProps, server components)
- Backend-to-backend communication

---

## 5. Next.js Build Configuration

### The `force-dynamic` Export

**Problem:** Next.js 14 attempts to prerender pages at build time. Authenticated pages fail because:
- No auth context exists at build time
- API endpoints not available during static generation

**Solution:** Add to ALL authenticated pages:

```javascript
"use client";
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
// ... rest of component
```

### Pages Requiring `force-dynamic`

- All `/admin/*` pages
- All `/broker/*` pages
- `/my-commissions`
- Any page using `useAuth()` hook
- Any page making API calls in useEffect on mount

### Build Error Recovery

If you see `prerender-manifest.json` errors:

```bash
cd /var/www/order-tracker/web
pm2 stop order-tracker-frontend
rm -rf .next
npm run build
pm2 restart order-tracker-frontend
```

---

## 6. Order Details Page - Tabbed Layout

### Tab Structure
1. **Details** - Order information, pricing, customer details
2. **Shipping Containers** - Container assignments for items
3. **Documents** - Item-level document management

### Component Architecture
```
web/app/admin/orders/[id]/page.jsx
├── Tab navigation
├── Details tab content (inline)
├── Shipping Containers tab content (inline)
└── Documents tab
    └── ItemDocumentSection component (per item)
```

### Document Tab Features
- Expand/collapse per item
- Document type checklist with status indicators
- Upload with drag-and-drop
- Download via pre-signed S3 URLs
- Delete with confirmation

---

## 7. Commission System - Item-Level Tracking

### Why Item-Level?

Items in an order often ship in different containers at different times. Commission payouts are triggered by individual item stage progression, not order-level stages.

### Payout Trigger Logic

```javascript
// In items.js - stage update endpoint
if (newStage === 'shipping' || newStage === 'delivered') {
  // Trigger commission payout for this item
  await processCommissionPayout(item, newStage);
}
```

### Discount Distribution

Order-level discounts are distributed proportionally across items:
```javascript
const itemDiscount = (item.price / orderTotal) * orderDiscount;
const commissionableAmount = item.price - itemDiscount;
```

---

## 8. File Structure - Key Directories

### Backend (`/api`)
```
api/
├── src/
│   ├── routes/           # API route modules
│   ├── services/         # Business logic (fileUploadService.js)
│   └── middleware/       # Auth, validation
├── prisma/
│   └── schema.prisma     # Database schema
├── dev.db                # SQLite database
└── index.js              # Express app entry point
```

### Frontend (`/web`)
```
web/
├── app/
│   ├── admin/            # Admin pages
│   ├── broker/           # Broker portal pages
│   ├── api/              # Next.js API proxy routes
│   └── my-commissions/   # Agent commission view
├── components/           # Reusable components
├── contexts/             # React contexts (AuthContext)
└── lib/                  # Utilities (api-config.js)
```

---

## 9. Troubleshooting Guide - November Issues

### ERR_CONNECTION_REFUSED
**Cause:** Frontend component calling backend directly
**Fix:** Create Next.js API proxy route

### Ad-blocker Blocking Requests
**Cause:** Route contains "broker" or "ad" in path
**Fix:** Rename backend routes (e.g., `/broker` → `/customs`)

### Documents Tab Not Loading
**Cause:** ItemDocumentSection using wrong API base
**Fix:** Use `/api/items/...` not `${NEXT_PUBLIC_API_BASE}/api/items/...`

### Build Fails with Prerender Error
**Cause:** Missing `export const dynamic = 'force-dynamic'`
**Fix:** Add export to affected page

### Stale Data After Deployment
**Cause:** Next.js cache not cleared
**Fix:** `rm -rf web/.next` before build

---

## 10. API Configuration Reference

### Environment Variables

**Backend (.env):**
```
DATABASE_URL="file:./dev.db"
JWT_SECRET=your-secret
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket
```

**Frontend (.env.local):**
```
API_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

### API Base URL Usage

**Server-side (Next.js API routes):**
```javascript
import { API_BASE_URL } from "@/lib/api-config";
// API_BASE_URL = process.env.API_URL || 'http://localhost:4000'
```

**Client-side (components):**
```javascript
// Use Next.js proxy routes
fetch('/api/items/123/documents')
// NOT: fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/items/123/documents`)
```

---

## Quick Reference - Common Commands

### Deployment
```bash
cd /var/www/order-tracker
git pull origin aws-deployment
cd web && rm -rf .next && npm run build
pm2 restart all
```

### Database
```bash
cd /var/www/order-tracker/api
npx prisma db push      # Apply schema changes
npx prisma generate     # Regenerate client
npx prisma studio       # GUI for database
```

### Logs
```bash
pm2 logs --lines 50
pm2 logs order-tracker-backend --lines 30
pm2 logs order-tracker-frontend --lines 30
```

### S3 Backups
```bash
# List backups
aws s3 ls s3://order-tracker-backups-2025/

# Download specific backup
aws s3 cp s3://order-tracker-backups-2025/backup-20251129.db ./
```

---

**Document Version:** 1.0  
**Last Updated:** November 29, 2025  
**Covers:** November 2025 development work
