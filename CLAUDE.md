# ORDER TRACKER — Unified System Documentation
## Combined & Updated Technical Manual
### (Order Tracker Overview + November 2025 Updates)

This document merges and replaces:
- **Order Tracker Overview**
- **November 2025 Updates**

All conflicting information has been **resolved in favor of the November updates**, per user instruction.

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
| **Environment (prod)** | `/var/www/order-tracker/web/.env.production` |
| **Environment (dev)** | `/home/brian/tracking/manufacturing-tracker/web/.env` |

---

## 🚀 DEPLOY COMMANDS (PRODUCTION)

### **Full Deployment Workflow**
```bash
# 1. SSH into EC2
ssh ubuntu@smt-orders.com

# 2. Navigate to project
cd /var/www/order-tracker

# 3. Pull latest code
git pull origin aws-deployment

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
git pull origin aws-deployment
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

---

## 📚 FULL DOCUMENTATION SECTIONS

For detailed information, see the corresponding section numbers below:

- **Section 2:** System Architecture Overview
- **Section 3:** Technology Stack (Deep Technical Detail)
- **Section 4:** AWS Infrastructure (Full Deep-Dive)
- **Section 5:** User Roles & Permissions
- **Section 6:** Core Platform Modules
- **Section 7:** Next.js Application Layer (High Detail)
- **Section 8:** Backend API Layer (High Detail)
- **Section 9:** Database & Prisma Schema Overview
- **Section 10:** Deployment & Operations
- **Section 11:** Backup Systems
- **Section 12:** Troubleshooting Guide
- **Section 13:** Key Technical Decisions
- **Section 14:** Command Reference

---

**END OF QUICK REFERENCE**

---

## 1. Executive Summary

The Order Tracker is a production-grade full‑stack logistics and manufacturing management platform used by Stealth Machine Tools. It manages the complete lifecycle of a machine tool order— from creation, manufacturing workflow, logistics, customs clearance, document management, commission calculation, and delivery.

This unified document consolidates the platform’s full architecture, AWS infrastructure, broker portal, S3 document management system, Next.js operational patterns, deployment workflow, backup systems, troubleshooting, and DevOps procedures.

This serves as the **master technical documentation** for the entire Order Tracker platform.

---
## Table of Contents
1. Executive Summary
2. System Architecture Overview
3. Technology Stack
4. AWS Infrastructure
5. User Roles & Permissions
6. Core Platform Modules
   - Orders
   - Items
   - Commission System
   - Document Management (S3)
   - Broker Portal
7. Next.js Application Layer
8. Backend API Layer (Node/Express)
9. Database & Prisma Schema Overview
10. Deployment & Operations
11. Backup Systems
12. Troubleshooting Guide
13. Key Technical Decisions
14. Command Reference
15. Appendix
---

## 2. System Architecture Overview

The Order Tracker platform is a multi-layer, production-grade web application designed to manage the entire lifecycle of custom machine tool orders — from the moment a sales agent creates an order, through manufacturing, logistics, customs clearance, and final delivery.  
The architecture balances **scalability**, **security**, **modularity**, and **real‑time data integrity**, and supports internal users, external manufacturers, and customs brokers.

---

## 2.1 High-Level Architecture Diagram (Conceptual)

```
                   ┌────────────────────────────────────────┐
                   │           Frontend (Next.js)            │
                   │  - Admin Portal                         │
   Browser  ─────► │  - Agent Portal                         │
 (Users)           │  - Broker Portal                        │
                   │  - API Proxy Routes (/api/*)            │
                   └────────────────────────────────────────┘
                                   │
                                   ▼
                   ┌────────────────────────────────────────┐
                   │       Backend API (Node/Express)        │
                   │  - Orders, Items, Commissions           │
                   │  - Broker APIs (/customs/*)             │
                   │  - Document APIs                        │
                   │  - Business Logic & Validation          │
                   └────────────────────────────────────────┘
                                   │
                                   ▼
                   ┌────────────────────────────────────────┐
                   │            Prisma ORM Layer              │
                   │  - Data modeling                        │
                   │  - Query abstraction                    │
                   └────────────────────────────────────────┘
                                   │
                                   ▼
                   ┌────────────────────────────────────────┐
                   │                 SQLite                  │
                   │   (Migratable to PostgreSQL)            │
                   └────────────────────────────────────────┘
                                   │
                                   ▼
                   ┌────────────────────────────────────────┐
                   │           AWS Cloud Services            │
                   │   - S3 Document Storage                 │
                   │   - S3 Automated Backups                │
                   │   - IAM Credential Access               │
                   └────────────────────────────────────────┘
```

---

## 2.2 Architectural Principles

The architecture is built on the following principles:

### **1. API-Proxy Frontend**
All frontend calls route through Next.js API routes (`web/app/api/*`) rather than calling the backend directly.

### **2. Separation of Concerns**
- Frontend handles rendering, routing, and user interaction.
- Backend handles data validation, business logic, and secure operations.
- Database stores normalized relational data.

### **3. Modular Backend**
Each backend module (orders, items, brokers, commissions, documents) is isolated in:
`/api/src/routes/*`

### **4. Stateless Authentication**
JWT tokens in cookies (internal users) and separate JWTs for brokers ensure clean separation of roles.

### **5. AWS S3 as the Single Source of Truth for Documents**
All documents are uploaded, versioned, and retrieved from S3 using signed URLs.

### **6. SQLite Database with Automated Backups**
Daily S3 backups + manual one‑command backup ensure safe recovery.

### **7. Role-Based Access Control (RBAC)**
Access is filtered by user role at every layer:
- SUPER_ADMIN
- ACCOUNTANT
- ADMIN
- AGENT
- MANUFACTURER
- BROKER

### **8. Scalable Deployment Model**
- PM2 manages Node and Next.js processes.
- Code changes deployed via GitHub → EC2 pull → rebuild.

---

## 2.3 Major System Domains

### **A. Order Lifecycle**
Handles everything related to machine tool order creation, editing, tracking, logistics, and container assignments.

### **B. Manufacturing Workflow**
10-stage manufacturing model with ETA calculations and stage threshold highlighting.

### **C. Document Management**
AWS S3 system storing:
- Commercial invoice
- Packing list
- BOL
- Inspection reports
- Certificates
- Customs docs

### **D. Commission System**
Fully featured item-level commission tracking:
- Multi-stage payouts
- Orphaned commission detection
- Proportional discount allocation
- Audit reliability

### **E. Broker Portal**
Read-only portal for customs brokers using secure, isolated JWT auth.

### **F. Notification System**
Backend-driven notifications for:
- Missing documents
- Shipping updates
- Commission events
- Clearance events

---

## 2.4 Data Flow Summary

### **1. User → Frontend**
User interacts with Next.js pages, which call:

```
/api/... (Next.js proxy)
```

### **2. Frontend → Backend**
Next.js API proxies request to:

```
http://localhost:4000/api/...
```

### **3. Backend → Prisma**
Route handlers validate input, run business logic, then perform reads/writes through Prisma.

### **4. Backend → S3**
Document uploads are streamed to S3 and stored with metadata in the database.

### **5. Backend → JWT Layer**
Authentication is validated on each call.

### **6. Backend → Broker Portal**
Broker requests are handled via `/customs/*` to avoid ad blocker conflicts.

---

## 2.5 Deployment-Level Architecture

### **Frontend Deployment**
- Next.js runs in production mode under PM2
- Static assets and API proxy run under `/web`

### **Backend Deployment**
- Express app under `/api`  
- PM2 handles restarts, logs, and uptime

### **EC2 Instance Responsibilities**
- Host frontend and backend
- Run PM2
- Store SQLite database
- Upload backups to S3 nightly

### **AWS Resources**
- S3 bucket for item documents
- S3 bucket for database backups
- IAM roles for secure access

---

## 2.6 Networking and Ports

| Component        | Port | Description |
|------------------|------|-------------|
| Frontend (Next.js) | 3000 | Public-facing application |
| Backend (Express)  | 4000 | API server |
| SQLite DB          | local | File-based database |
| S3                 | N/A | Cloud storage for documents/backups |

---


## 3. Technology Stack (Deep Technical Detail)

This section provides an expanded, engineering‑level breakdown of each technology powering the Order Tracker platform.  
Unlike typical high‑level documentation, this section covers **runtime behavior**, **performance characteristics**, **architectural constraints**, and **internal mechanisms**.

---

# 3.1 Next.js 14+ (Frontend Application Layer)

The frontend is built on **Next.js 14**, running in **production mode** on the EC2 instance under PM2.

### 3.1.1 Rendering Models Used

Next.js 14 supports three major rendering paradigms:

#### **A. RSC (React Server Components)**
- Executed on the server at request time.
- Never sent to the browser.
- Used for authenticated server‑side fetching in Order Tracker.
- Eliminates client bundle size for server‑heavy pages.

#### **B. Client Components**
- Used for dynamic UI, hooks, forms, modals, interactive components.
- Must begin with `"use client"`.

#### **C. Server Actions (Not currently used)**
- Could be used later for secure form submissions.

##### **Order Tracker's Required Pattern**
To prevent build‑time prerendering of authenticated routes, all secure pages **must include**:

```javascript
"use client";
export const dynamic = "force-dynamic";
```

Without this:
- Next.js attempts prerender at build time.
- Auth context doesn’t exist → crash.
- Backend is not reachable at build time → crash.

---

### 3.1.2 Build Pipeline

1. **Compilation** via SWC
2. **Tree-shaking & code splitting**
3. **Server and client bundles generated**
4. `.next` directory created
5. PM2 serves the optimized application

### Why `.next` must always be deleted before rebuilding
- Next.js caches server components aggressively.
- Stale cache = pages rendering old schema or incorrect data.
- Deleting `.next` forces a complete rebuild of:
  - Server bundle
  - Client bundle
  - Route handlers
  - Edge pre-computation

---

### 3.1.3 Next.js API Route Proxying

Browser cannot reach:
```
http://localhost:4000
```
when deployed.

Therefore:

```
Browser → Next.js API Route (/api/*) → Backend (localhost:4000)
```

This ensures:
- CORS-free communication  
- Cookie-based JWT works server-side  
- Backend stays private  

Proxy routes implemented under:  
`/web/app/api/...`

---

### 3.1.4 Runtime Behavior Under PM2

PM2 runs Next.js in **fork** mode (not cluster).  
Reason:
- Next.js server components do not support multi-process concurrency safely.
- File-based SQLite DB requires single-process access to avoid race conditions.

---

# 3.2 Node.js + Express Backend (Port 4000)

The backend is a modular Express application.

### 3.2.1 Runtime Model

Node.js is single-threaded, event-driven:
- All I/O (S3, DB, file operations) are async.
- Blocking operations (like PDF generation) must be avoided.

The backend is **not clustered** under PM2:
- SQLite cannot handle concurrent writers across multiple processes.
- Prisma client does not support multiple separate Node processes writing simultaneously.

---

### 3.2.2 Express Structure

Each domain has its own route module under:
```
api/src/routes/
```

Major modules:
- orders.js
- items.js
- commissions.js
- broker.js
- itemDocuments.js
- reports.js
- users.js
- notifications.js
- settings.js  
…and many more.

Each route module:
- Validates JWT
- Applies RBAC filters
- Executes business logic
- Queries SQLite via Prisma
- Returns JSON

---

### 3.2.3 Performance Characteristics

Node.js excels in:
- High concurrency
- Many simultaneous I/O operations
- Low-latency async workflows

Weaknesses:
- CPU-heavy tasks block the event loop
- PDF generation, zip compression, or image processing must be offloaded to:
  - background workers
  - job queues (future enhancement)

---

# 3.3 Prisma ORM (Database Abstraction Layer)

Prisma provides:
- Type-safe client
- Schema-driven design
- Migration tooling (not used here—db push instead)
- Query validation

### 3.3.1 Why Prisma Is Well-Suited

Pros:
- Clean schemas
- Strong typing
- Easy relation modeling
- Simple for SQLite → PostgreSQL migration path

Cons:
- Large queries not optimized automatically
- Requires schema discipline
- Query performance heavily depends on index usage

---

### 3.3.2 Query Performance Details (SQLite)

SQLite has:
- Single writer lock
- Unlimited concurrent readers
- File-level locking

Prisma generates SQL optimized for SQLite, but:
- Joins across large tables degrade
- ORDER BY with no index is expensive
- COUNT(*) across large tables is expensive

This affects:
- Commission reports (heavy)
- Historical order queries
- Broker portal large listings

Indexes are critical for performance.

---

# 3.4 SQLite (Local File-Based Database)

SQLite is used because:
- Simple deployment
- Zero config
- Perfect for applications with < 50k rows per major table
- Works well under single-process Node.js environments

### 3.4.1 I/O Behavior on EC2

SQLite interacts with the filesystem:
- Reads are extremely fast (cached in RAM)
- Writes acquire file lock (~1–20ms)
- Multiple writes in parallel = queued

### Potential Bottlenecks
- Commission calculations on thousands of items
- Bulk updates to many items at once
- Repeated writes to notifications table

### Why Not PostgreSQL Yet?
- Migration is planned
- SQLite performance acceptable
- Developer velocity higher with file-based DB
- Backups are trivial

---

# 3.5 AWS S3 (Document Storage + Backups)

Two separate buckets:

### **1. Document Storage Bucket**
Stores:
- Commercial Invoices
- Packing Lists
- Bills of Lading
- Certifications
- Inspection Reports
- Misc docs

Each document is stored using:
- UUID pathing
- MIME metadata
- Access via pre-signed URLs

### **S3 Upload Lifecycle**
1. File received in Express via multer  
2. Sent to S3 via `PutObjectCommand`
3. DB entry created with:
   - S3 key
   - MIME type
   - Original filename
   - Uploaded timestamp

### **S3 Download Lifecycle**
1. Backend receives request for doc  
2. `GetObjectCommand` generates signed URL  
3. URL returned valid for 3600 seconds  
4. Browser downloads file directly from S3  

---

### **2. Backup Bucket**  
Nightly 2AM cron job:
- Copies `/api/dev.db` into S3
- Names backup: `backup-YYYYMMDD.db`
- Provides complete disaster recovery snapshot

### Advantages:
- Zero downtime backups  
- Rapid restoration  
- Immutable daily snapshots  

---

# 3.6 PM2 (Process Manager)

PM2 runs:
- Next.js frontend (`order-tracker-frontend`)
- Express backend (`order-tracker-backend`)

### Why PM2?
- Automatic restart on crash  
- Log storage  
- Single-command deployments  
- Environment variable injection  
- Process monitoring  
- Memory usage dashboards  

### PM2 Modes:
- **Fork Mode (used)**: Safe for SQLite  
- **Cluster Mode (NOT allowed)**: Would cause DB corruption

---

# 3.7 JWT Authentication

There are two independent JWT systems:

### **1. Internal User JWT**
Stored in:
- `token` cookie (HTTP-only)

Users:
- SUPER_ADMIN  
- ACCOUNTANT  
- ADMIN  
- AGENT  
- MANUFACTURER

### **2. Broker JWT**
Stored in:
- `broker_token` cookie  

Purpose:
- Isolation from internal permissions
- Dedicated portal under `/broker/*`

---

# 3.8 Environment Configuration

Critical frontend/backend environment variables include:

```
API_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE=http://localhost:4000
DATABASE_URL="file:./dev.db"
```

AWS credentials:
```
AWS_ACCESS_KEY_ID=xxxx
AWS_SECRET_ACCESS_KEY=xxxx
AWS_REGION=us-east-1
AWS_S3_BUCKET=...
```

JWT:
```
JWT_SECRET=your-secret
```

---

# 3.9 Summary of Technology Roles

| Technology | Purpose | Reason for Choice |
|-----------|---------|-------------------|
| **Next.js 14** | Frontend SPA + SSR | Performance, DX, SSR |
| **Node + Express** | Backend REST API | Flexibility, speed |
| **Prisma ORM** | DB schema & queries | Type safety, migration path |
| **SQLite** | Lightweight DB | Fast, simple, zero-config |
| **AWS S3** | File storage & backups | Durability, scalability |
| **PM2** | Process management | Reliability & uptime |
| **JWT Auth** | Stateless authentication | Scalable, secure |

---

This completes **Section 3: Deep Technology Stack**.

## 4. AWS Infrastructure (Full Deep-Dive)

This section provides a comprehensive analysis of the AWS infrastructure that supports the Order Tracker platform, including S3 storage architecture, IAM security modeling, EC2 operational behavior, and the complete lifecycle of document and database storage.

---

# 4.1 AWS Architecture Overview

The Order Tracker platform uses a focused subset of AWS services to maximize reliability while keeping operational complexity low.  
Primary AWS components include:

- **AWS S3 (Documents Bucket)** – Stores all item-related documents  
- **AWS S3 (Backup Bucket)** – Stores nightly SQLite backups  
- **AWS IAM** – Provides controlled access to S3 resources  
- **AWS EC2** – Hosts the entire application stack (Next.js + Express + SQLite)  

The infrastructure is intentionally lean, optimized for reliability, simplicity, and cost control.

---

# 4.2 S3 Document Storage Architecture

Two separate S3 buckets are used:

### **1. Item Document Bucket**
Stores all uploaded order/item documents including:
- Commercial Invoice  
- Packing List  
- BOL  
- Certifications  
- Inspection Reports  
- Photos  
- Misc documents  

### **2. Backup Bucket**
Stores SQLite `.db` snapshots:
- Named `backup-YYYYMMDD.db`
- Created nightly at **2 AM**
- Upload triggered by cron on the EC2 instance

---

# 4.3 S3 Bucket Structure & Keying Strategy

The document bucket uses a **UUID-based key** structure:

```
documents/
   {itemId}/
      {documentId}/
         original_filename.pdf
```

### Why UUID key paths?
- Collision-free  
- No reliance on user filenames  
- Allows storing multiple versions of the same document type  
- Prevents overwriting conflicts  
- Supports future versioning policies  

---

# 4.4 Upload Lifecycle (Deep)

When a document is uploaded through the frontend:

### **Step 1 — FormData Sent from Browser**
The browser sends FormData via:

```
POST /api/items/{id}/documents
```

### **Step 2 — Next.js API Proxy**
Next.js forwards the request:

```
POST localhost:4000/api/items/{id}/documents
```

Ensures:
- CORS-free flow  
- Browser cannot directly reach the backend  
- JWT validated server-side  

### **Step 3 — Express Receives multipart/form-data**
Handled by `multer`:
- Parses file  
- Streams to memory/disk buffer  

### **Step 4 — fileUploadService.js Sends to S3**
A `PutObjectCommand` is used:

```
PutObjectCommand({
  Bucket,
  Key,
  Body,
  ContentType,
  Metadata,
})
```

### **Step 5 — DB Record Created**
Entry stored in SQLite via Prisma:
- Key  
- Document type  
- Timestamp  
- Original filename  

### **Step 6 — Frontend Refreshes Document List**
The updated checklist is returned.

---

# 4.5 Download Lifecycle (Deep)

### **Step 1 — Browser Requests Download**
```
GET /api/items/{itemId}/documents/{documentId}/download
```

### **Step 2 — Backend Validates**
- JWT  
- Role  
- Document ownership  

### **Step 3 — Signed URL Generated**
Using:
```
GetObjectCommand + getSignedUrl()
```

### **Step 4 — URL Returned**
Valid for **3600 seconds**.

### **Step 5 — Browser Downloads Directly from S3**
This avoids routing large files through EC2.

---

# 4.6 IAM Policy Model (Full Detail)

The EC2 instance uses an **IAM role** with permissions restricted to the two buckets.

Example **least privilege policy**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::order-tracker-documents/*",
        "arn:aws:s3:::order-tracker-documents"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::order-tracker-backups-2025/*",
        "arn:aws:s3:::order-tracker-backups-2025"
      ]
    }
  ]
}
```

### Key principles:
- No wildcards outside specific buckets  
- No S3 ACL modification permissions  
- No ListAllMyBuckets (not needed)  
- No s3:DeleteBucket or destructive admin actions  

---

# 4.7 S3 Object Lifecycle Policies

(Optional but recommended for future)

### Suggested Policies:
1. **Document Bucket**
   - Transition objects > 1 year to S3 Standard-IA
   - Transition objects > 3 years to Glacier

2. **Backup Bucket**
   - Retain 30 days of backups  
   - Delete any older ones  

This prevents storage growth from exceeding operational needs.

---

# 4.8 EC2 Instance Architecture

The entire application runs on a **single EC2 instance**:

### Components Hosted:
- Next.js 14 frontend (Port 3000)
- Node.js Express backend (Port 4000)
- SQLite database file
- Cron job backup scripts
- PM2 for process management

### OS Considerations:
- Ubuntu LTS
- System updates managed manually or via cron
- Basic firewall via Security Groups

### CPU Requirements:
- Next.js build uses ~700–900MB RAM
- Express uses minimal CPU
- SQLite performs well with single-process writes

---

# 4.9 Security Groups

The EC2 instance uses a minimal firewall model:

### Inbound rules:
| Port | Purpose |
|------|---------|
| 22   | SSH |
| 3000 | Next.js frontend |
| 4000 | Backend API (INTERNAL ONLY if behind reverse proxy) |

### Outbound rules:
- All outbound traffic allowed  
- Required for S3 access  

---

# 4.10 Backup Architecture (Full Detail)

### Location:
```
/var/www/order-tracker/api/dev.db
```

### Operation:
- Cron triggers at **2 AM daily**
- Copies database to S3 backup bucket
- Script ensures unique filenames:
  `backup-YYYYMMDD.db`

### Why backups are safe:
- SQLite file can be copied live (ACID + WAL mode)
- No risk of corruption during read-only operations

### Restore Procedure:
1. Stop PM2 services  
2. Download desired backup  
3. Replace `dev.db`  
4. Restart PM2  

---

# 4.11 IAM Credential Handling

EC2 instance retrieves credentials via:
```
Instance Metadata Service v2 (IMDSv2)
```

Advantages:
- No hardcoded access keys  
- No leaked secrets  
- Rotation handled automatically  

---

# 4.12 Latency & Throughput Considerations

### S3:
- Typical S3 Get latency: 20–80ms  
- PutObject: ~40–150ms depending on file size  
- Nearly infinite throughput for Order Tracker’s workload  

### SQLite:
- Read speed: exceptionally fast (~microseconds)
- Write lock: 1–20ms typical
- Perfect for small-medium datasets

---

# 4.13 Future Migration Path (Optional)

When needed:
- Replace SQLite with RDS PostgreSQL
- Replace EC2-managed Next.js with ECS or Lambda@Edge
- S3 document architecture remains unchanged

---

This completes **Section 4: AWS Infrastructure (Full Deep-Dive)**.

## 5. User Roles & Permissions  
### Clean Hierarchical Breakdown (Business + Operational Focus)

The Order Tracker platform implements a clearly defined role hierarchy to control access to orders, commissions, documents, settings, and sensitive financial data.  
This RBAC model applies across **frontend UI**, **Next.js API proxies**, **backend Express routes**, and **Prisma query filters.**

This section provides a **clean, business-oriented breakdown** of each role, its capabilities, and its restrictions.

---

# 5.1 Role Hierarchy (Top → Bottom)

```
SUPER_ADMIN
   ↓
ACCOUNTANT
   ↓
ADMIN
   ↓
AGENT
   ↓
MANUFACTURER
   ↓
BROKER
```

Permissions cascade **downwards**, meaning:
- Higher roles inherit all permissions of lower roles  
- Lower roles do NOT inherit upward  

---

# 5.2 Role Definitions & Capabilities

---

## **5.2.1 SUPER_ADMIN**  
### **Highest-Level Role — Full System Access**

The SUPER_ADMIN has unrestricted access to the entire platform, including:

### **Capabilities**
- Full CRUD on all Orders, Items, Customers, Accounts  
- Full Commission access (edit rates, approve payouts, process payments)  
- Full access to all Reports  
- Full Document access  
- View and edit System Settings  
- Manage:
  - Users  
  - Roles  
  - Commission settings  
  - Stages / thresholds  
  - Manufacturers  
  - Notifications  
  - Email templates  
- Override locks and protected states on orders/items  
- Access broker-only endpoints for debugging  

### **Restrictions**
- None. This is the highest possible role.

---

## **5.2.2 ACCOUNTANT**  
### **Financial Visibility + Control Role**

The ACCOUNTANT manages all financial aspects of the Order Tracker system.

### **Capabilities**
- Full access to:
  - Commissions  
  - Commission settings  
  - Commission payouts  
  - Payment records  
  - Financial reports  
  - AR aging  
  - Sales summary  
  - Export CSV/PDF  
- Read/write access to invoice-related fields on orders (e.g., prices)  
- View **all** orders and items (not limited by SKU assignment)  
- Upload/download all documents  
- Read-only access to System Settings  

### **Restrictions**
- Cannot manage users  
- Cannot modify manufacturing stages  
- Cannot modify shipping containers  
- Cannot update items unrelated to pricing or financials  
- Cannot delete orders or items  

---

## **5.2.3 ADMIN**  
### **Operational Manager Role**

Admins manage orders, items, documents, customers, and manufacturers but do not access financial details.

### **Capabilities**
- Full CRUD on Orders and Items  
- Manage:
  - Documents  
  - Container assignments  
  - Stage updates  
  - Customer details  
  - Accounts  
  - Manufacturers  
- View reports (non-financial)  
- View commissions (read-only)  

### **Restrictions**
- Cannot view commission payout totals  
- Cannot change commission settings  
- Cannot approve or pay out commissions  
- Cannot view or modify user financials  
- Cannot modify System Settings related to finance  

---

## **5.2.4 AGENT**  
### **Sales Role — Can only access their own accounts**

This role powers the sales portal experience.

### **Capabilities**
- View and manage **only their own orders**  
  - Determined by `order.sku === agent.username`  
- Create new orders  
- Edit customer details for their customers  
- Upload and download item documents  
- View their own commissions via `/my-commissions`  
- Track shipping and manufacturing progress for their orders  
- Use broker documents interface indirectly  

### **Restrictions**
- Cannot view other agents’ orders  
- Cannot see any commission payout details  
- Cannot access any financial reports  
- Cannot modify commission rates  
- Cannot modify system settings  
- Cannot modify users or roles  
- Cannot modify manufacturers  
- Cannot override locked orders  

---

## **5.2.5 MANUFACTURER**  
### **External Vendor Role**

This role provides restricted access for machine manufacturers.

### **Capabilities**
- View only **assigned items**  
- Update:
  - Serial numbers  
  - Production notes  
  - Item-specific metadata allowed by internal policy  
- Upload manufacturer-originated documentation  
- Read access to shipping/container information  

### **Restrictions**
- Cannot view orders not linked to them  
- Cannot modify financial or commission data  
- Cannot change customer information  
- Cannot delete documents  
- Cannot change manufacturing stages beyond what is explicitly allowed  
- Cannot see internal notes  

---

## **5.2.6 BROKER**  
### **Customs Clearance Role (Highest Restriction)**

This role is used by customs brokers through the dedicated **Broker Portal**, accessible through:

```
/broker/*
```

Backed by special backend routes:

```
/customs/*
```

### **Capabilities**
- Login via `/customs/login`  
- View:
  - Items requiring customs clearance  
  - Documents for these items  
  - Clearance history  
- Download relevant documents  
- Mark an item as cleared  

### **Restrictions**
- Cannot edit any order data  
- Cannot upload documents  
- Cannot access internal UI or admin routes  
- Cannot view manufacturing stages except for clearance summaries  
- Cannot change customer/cost/sales details  
- Cannot view ANY commissions or pricing  

---

# 5.3 Enforcement Layers

To guarantee correct application of role permissions, RBAC is enforced across **four layers**:

---

## **Layer 1: Next.js Frontend (Navigation Restriction)**  
Pages are hidden or disabled based on role:
- Example: AGENTS never see admin menus  
- BROKERS are isolated in `/broker/*`  
- ACCOUNTANTS see commission-related pages  

---

## **Layer 2: API Proxy Routing (Next.js API Routes)**  
Proxies block or filter requests by:
- Cookie token  
- Role  
- Endpoint rules  

Example:
```
/api/admin/commissions (blocked for AGENT, MANUFACTURER, BROKER)
```

---

## **Layer 3: Backend Express Middleware**  
JWT middleware checks:
- Token validity  
- Role  
- Expiration  
- Route permissions  

If insufficient:
```
403 Forbidden
```

---

## **Layer 4: Prisma Query Filtering**  
For AGENTS:
```javascript
where: {
  OR: [
    { createdById: user.id },
    { assignedToId: user.id },
    { sku: user.username }
  ]
}
```
Guarantees agents **cannot ever** access another agent’s data.

---

# 5.4 Summary Table

| Role | Scope | Financial Access | Order Access | Document Access | Internal Settings |
|------|-------|------------------|--------------|------------------|-------------------|
| **SUPER_ADMIN** | Everything | Full | Full | Full | Full |
| **ACCOUNTANT** | Finance | Full | Full | Full | Limited |
| **ADMIN** | Operations | None | Full | Full | Partial |
| **AGENT** | Sales | Own commissions only | Own orders only | Own orders only | None |
| **MANUFACTURER** | Production | None | Assigned items only | Assigned item docs | None |
| **BROKER** | Customs | None | Clearance items only | Clearance docs | None |

---

This completes **Section 5: User Roles & Permissions (Clean Hierarchical Breakdown)**.


## 6. Core Platform Modules  
### (Organized by System Architecture Domain)

This section describes all major functional modules within the Order Tracker platform, organized by **technical architecture domain**.  
Each module includes:  
- What it does  
- Key responsibilities  
- How it interacts with other modules  
- Important data flows  
- Critical behaviors  
- Integration with backend, frontend, and AWS services

---

# 6.1 DATA DOMAIN MODULES  
## 6.1.1 Orders Module

The **Orders** module is the backbone of the entire system. It stores top-level information about customer orders, including dates, customer information, manufacturing workflow progress, container assignments, and pricing.

### Responsibilities
- Create/edit/view orders  
- Manage customer and account linkage  
- Track manufacturing stages  
- Drive ETA calculations  
- Handle shipping and container assignments  
- Store system-level metadata (lock flags, notes, internal data)

### Key Behaviors
- Orders are filtered by **SKU** for AGENT role (legacy mapping: `order.sku = salesPersonUsername`)
- Orders support a **10-stage manufacturing workflow**
- Editing is restricted when an order is **locked**  
- Order creation triggers downstream processes (commission initialization, document slots, etc.)

### Data Flow Summary
```
Frontend → Next.js API → Backend /orders.js → Prisma → SQLite
```

### Integrations
- **Items Module** (one-to-many items under each order)
- **Commission Module**
- **Document Module**
- **Broker Portal**
- **Notifications**

---

## 6.1.2 Items Module

Items represent physical machine units inside each order. An order may contain multiple individual items, each with its own workflow, documents, serial numbers, and commissions.

### Responsibilities
- Store item-specific details (price, model, voltage, specs)
- Track manufacturing stage per item
- Assign items to shipping containers
- Manage item-level documents
- Trigger commission payouts when item changes stage

### Key Behaviors
- Items progress **independently** through the manufacturing pipeline  
- Prices determine commissions  
- Item stage updates may trigger **payout eligibility**  
- Some stages are broker-relevant (e.g., SHIPPED/AT_SEA)

### Integrations
- Orders (parent)
- Document System (item-level docs)
- Commission System (payout triggers)
- Broker Portal (clearance-related items)

---

## 6.1.3 Accounts Module

The legacy **Account** model stores customer-level divisions and historical data.

### Responsibilities
- Link orders to customer entities
- Maintain customer info for reporting
- Store machine voltage defaults and customer notes

### Integrations
- Orders
- Future CRM integrations

---

# 6.2 DOCUMENT DOMAIN MODULES  
## 6.2.1 Item Document System (AWS S3)

The document management system handles uploads, retrieval, and deletion of documents at the **item level**, not order level.

### Responsibilities
- Uploading documents to AWS S3  
- Maintaining a per-item document checklist  
- Providing secure pre-signed URLs for document download  
- Deleting documents from S3  
- Tracking metadata in SQLite

### Supported Document Types
- Commercial Invoice  
- Packing List  
- Bill of Lading  
- Certificate of Origin  
- Insurance Certificate  
- Inspection Report  
- Quality Certification  
- Misc documents

### Data Flow: Upload
```
Browser → Next.js API Proxy → Express → Multer → S3 PutObject → DB Record
```

### Data Flow: Download
```
Browser → Next.js API Proxy → Express → S3 Signed URL → Browser Download
```

### Integrations
- Broker Portal  
- Orders/Items  
- Notifications (future)

---

# 6.3 WORKFLOW DOMAIN MODULES  
## 6.3.1 Manufacturing Stage Workflow

The system uses a **10-stage** manufacturing process applied to items (not orders).  
Stages are critical for:
- ETA warnings  
- Commission payout triggering  
- Broker clearance visibility  

### Responsibilities
- Track item progress  
- Compute stage-based ETA  
- Trigger state-based notifications  
- Determine payout eligibility  

### Behavior
Each stage has:
- **Threshold Warning Days**  
- **Threshold Critical Days**  

If an item exceeds these periods, UI highlights change color:
- Green → Normal  
- Amber → Warning  
- Red → Critical  

---

## 6.3.2 Shipping Container Module

Each item can be assigned to a shipping container.

### Responsibilities
- Record container numbers  
- Link multiple items to the same container  
- Track multi-container orders  
- Provide status to brokers  
- Store container-level metadata (ETD/ETA, port info, vessel name)

### Integrations
- Items  
- Broker Portal  
- Reports  

---

# 6.4 FINANCIAL DOMAIN MODULES  
## 6.4.1 Commission System

The commission module is one of the most sophisticated systems in the Order Tracker.

### Responsibilities
- Calculate agent earnings  
- Distribute discounts proportionally  
- Handle multi-stage payouts  
- Track orphaned commissions  
- Generate payout events  
- Provide YTD, monthly, and historical reporting  

### Key Behaviors
- Commissions calculated **per item**, not per order  
- Payouts triggered when items reach:
  - **SHIPPING** stage  
  - **DELIVERED** stage  
- Commission rates are configurable per agent  
- Discounts applied proportional to item price  
- Orphaned commissions occur when orders are deleted (system retains commission record for audit)

### Integrations
- Items (stage updates)  
- Reports (commission reports)  
- Payments (payout confirmations)  

---

# 6.5 EXTERNAL ACCESS DOMAIN  
## 6.5.1 Broker Portal

The broker portal is a **fully isolated external-facing interface** used by customs brokers.

### Responsibilities
- Authenticate as broker  
- View items requiring customs clearance  
- Access item documentation  
- View container info  
- Mark items as cleared  
- View historical clearance data  

### Architecture Flow
```
Frontend:  /broker/*
Next.js API Proxy: /api/customs/*
Backend API: /customs/*
```

### Why /customs/*?
- Prevents ad-blockers from blocking backend traffic  
- `/broker` was frequently blocked by browser filters  

### Integrations
- Item Document System  
- Container Module  
- Manufacturing Workflow  
- Notifications (future)

---

# 6.6 INFRASTRUCTURE DOMAIN MODULES  
## 6.6.1 Notification System

The notification system alerts internal staff of important events.

### Responsibilities
- Delivery of in-app alerts  
- Database-backed storage of messages  
- Triggering on:
  - Missing documents  
  - Clearance events  
  - Stage updates  
  - Commission events  

### Integrations
- Orders  
- Items  
- Broker Portal  
- Commission System  

---

## 6.6.2 Reports Module

The reports module provides various analytics including:

### Report Types
- Cycle Time Reports  
- Sales Reports  
- Commission Reports  
- Container Activity  
- Export to CSV/PDF  

### Responsibilities
- Aggregate large datasets  
- Provide YTD and monthly summaries  
- Support business analytics  

---

# 6.7 CONFIGURATION DOMAIN  
## 6.7.1 System Settings

Settings stored in SQLite control:
- Stage thresholds  
- Commission defaults  
- Manufacturer lists  
- Shipping metadata  
- App-level variables  

Only SUPER_ADMIN and ADMIN users have full access.

---

# 6.8 AUTHENTICATION DOMAIN  
## 6.8.1 User Management

The user module manages:
- User creation  
- Role assignments  
- Password resets  
- JWT issuance  
- Login sessions (internal vs broker)  

### Key Separation
- Internal users use JWT stored in `token`
- Brokers use JWT stored in `broker_token`

---

This completes **Section 6: Core Platform Modules (System Architecture Order)**.

## 7. Next.js Application Layer  
### (High Detail — Platform-Specific Architecture & Patterns)

The Order Tracker frontend is built on **Next.js 14**, structured for high performance, strict role isolation, and seamless integration with the Express backend through internal API proxy routes.  
This section provides a *high-detail architectural breakdown* of how the frontend is structured and operates.

---

# 7.1 Frontend Folder Structure (Actual Project Layout)

```
/web
  /app
    /admin
    /agent
    /broker
    /containers
    /documents
    /items
    /orders
    /reports
    /settings
    /login
    /api        ← Next.js API proxy routes
  /components
  /lib
  /styles
  /public
```

### Key Principles

- **Role-based directory isolation**  
  Admin pages under `/admin/*`, broker pages under `/broker/*`, etc.

- **Server-side fetching when possible**  
  To protect secure routes and ensure consistent data delivery.

- **Client components for anything interactive**  
  Forms, modals, tables, filters, dynamic UI.

- **API calls never hit the backend directly**  
  Always routed through Next.js proxy endpoints for:
  - JWT cookie forwarding
  - CORS avoidance
  - Security consistency

---

# 7.2 Routing Strategy

### 1. **File-Based Routing**
Every route in `/app/*` automatically maps to a frontend page.

### 2. **Dynamic Routes**
For pages such as:
```
/orders/[id]
/items/[itemId]
/containers/[containerId]
```

### 3. **Segment Layouts**
Shared navigation bars and role-based layouts are implemented via:

```
/app/admin/layout.jsx  
/app/agent/layout.jsx  
/app/broker/layout.jsx  
```

These enforce:
- Navigation restrictions  
- Role-appropriate theming  
- Page-level security checks  

---

# 7.3 Client vs Server Components (How OT Uses Them)

### **Server Components (RSC)**  
Used for:
- Protected pre-render loading of data  
- Fetching order lists  
- Fetching item summaries  
- Rendering dashboard counts  

Benefits:
- Zero client bundle cost  
- Eliminates duplicated API calls  
- Perfect for large tables  

### **Client Components**
Used when:
- State is interactive  
- User forms exist  
- Drag/drop functionality  
- Filtering, sorting, pagination  
- Export buttons  
- Modals and dialogs  

Common examples:
- “Edit Order” modal  
- Document upload dialog  
- Inline item editing  
- Stage updating UI  

---

# 7.4 Authentication Flow in Next.js

### Internal Users
Stored in:
```
token (HTTP-only cookie)
```

### Broker Users
Stored in:
```
broker_token (HTTP-only cookie)
```

### On Each Request
A **server-side cookie reader** checks:
- If the token exists  
- If it’s valid  
- If the user has access to the requested path  

If not:
```
redirect("/login")
```

---

# 7.5 API Layer (Next.js API Proxy Routes)

All frontend requests go through:
```
/web/app/api/*
```

Example:
```
/web/app/api/orders/get  
/web/app/api/items/update  
/web/app/api/items/[id]/documents/upload
```

### Why this is crucial:

1. Ensures JWT cookies are forwarded correctly  
2. Can enforce role-based checks **before** hitting backend  
3. Avoids CORS  
4. Allows edge-based pre-validation  
5. Protects the backend from being internet-facing  

### Typical Proxy Pattern

```javascript
export async function POST(req) {
  const body = await req.json();

  const res = await fetch("http://localhost:4000/api/orders/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie")
    },
    body: JSON.stringify(body)
  });

  return Response.json(await res.json(), { status: res.status });
}
```

---

# 7.6 UI Framework & Component Library

### Components built around:
- React  
- TailwindCSS  
- Custom modal patterns  
- Reusable table components  
- Shared icon set  

### Performance Notes
- Tailwind ensures minimal CSS overhead  
- Components follow memoization where appropriate  
- Heavy lists use pagination instead of infinite scroll  

---

# 7.7 Error Handling

### **UI-Level Errors**
Handled via:
- Error boundaries  
- Toast notifications  
- Inline field validation  

### **API-Level Errors**
Uniform JSON responses:
```
{ error: "Message" }
```

Frontend interprets:
- 400 → user form error  
- 401 → redirect to login  
- 403 → permission denied modal  
- 500 → retry prompt  

---

# 7.8 Performance Considerations

### 1. Avoiding heavy client components  
Large pages (order lists, item lists) use **server components** for rendering large tables.

### 2. Schema-heavy pages (like commissions)
- Use batched server-side fetches  
- Perform sorting server-side  
- Use filtered Prisma queries exposed via backend  

### 3. Memoization Strategies
- React.memo  
- useCallback  
- useMemo  
When components become large and stateful.

### 4. Build-Time Considerations
`.next` MUST be deleted before:
```
npm run build
```

Without doing so:
- You risk stale schemas  
- Cached server components break pages  
- UI loads outdated data  

---

# 7.9 Deployment Behavior Under PM2

### When pushing to production:
1. `git pull`  
2. Delete `.next`  
3. `npm run build`  
4. Restart PM2  

Frontend runs at:
```
pm2 start web.js --name order-tracker-frontend
```

Logs can be viewed:
```
pm2 logs order-tracker-frontend
```

PM2 ensures:
- Auto-restart  
- Log rotation  
- Crash resilience  

---

# 7.10 Frontend Security Patterns

1. **Authorization enforced in UI**  
   Unauthorized buttons/menus hidden.

2. **Authorization enforced in API proxy**  
   Prevents direct browser manipulation.

3. **Authorization enforced in backend**  
   Final layer of protection.

4. **Role isolation through file structure**  
   Admin pages physically separated from agent pages.

5. **HTTP-only cookies**  
   Tokens cannot be stolen via JavaScript.

---

# 7.11 Summary of Next.js Layer Responsibilities

| Area | Responsibility |
|------|----------------|
| Routing | Role-based layouts, secure navigation |
| API | Proxying to backend with cookies |
| Rendering | Server components for heavy pages |
| Forms | Client components for interactivity |
| Security | Token checks, redirects, UI restrictions |
| Performance | Tailwind, memoization, SSR, pagination |
| Deployment | `.next` rebuilds, PM2, logs |

---

This completes **Section 7: Next.js Application Layer (High Detail)**.

## 8. Backend API Layer (Node + Express)  
### High Detail — Platform Architecture & Operational Behavior

The backend API is the operational core of the Order Tracker system. It handles all business logic, enforces security, processes document uploads, manages commissions, updates item stages, interacts with S3, and serves all data consumed by the Next.js frontend.

This section provides a **high-detail** breakdown of the backend architecture without going into code-level internals.

---

# 8.1 Backend Folder Structure

```
/api
  /src
    /routes
      orders.js
      items.js
      commissions.js
      broker.js
      documents.js
      reports.js
      users.js
      auth.js
      settings.js
    /middleware
      auth.js
      role.js
      errorHandler.js
    /services
      fileUploadService.js
      documentService.js
      commissionService.js
      containerService.js
    /utils
      jwt.js
      prisma.js
  server.js
  dev.db
```

---

# 8.2 Express Server Overview

### Responsibilities:
- Validate incoming requests  
- Authenticate and authorize users  
- Act as the primary gateway to SQLite via Prisma  
- Execute business logic  
- Integrate with external services (AWS S3)  
- Serve responses to the Next.js API proxy  

### Characteristics:
- Stateless  
- Single-threaded event loop  
- Single-process mode under PM2  
- Uses middleware pipeline for each request  

---

# 8.3 API Routing Strategy

All backend routes live under:

```
/api/*
```

Examples:
- `/api/orders/create`
- `/api/orders/list`
- `/api/items/update-stage`
- `/api/commissions/report`
- `/api/customs/clear-item`
- `/api/documents/upload`

### Why Express?
- Extremely stable  
- Predictable routing  
- Simple middleware pipeline  
- Easy integration with Prisma  
- Low overhead  
- Ideal for this type of line-of-business system  

---

# 8.4 Middleware Architecture

Requests pass through multiple layers:

## **1. JWT Authentication Middleware**
Attached to nearly all routes (except login).
- Verifies token signature  
- Extracts user details  
- Attaches `req.user`  

If invalid:
```
401 Unauthorized
```

---

## **2. Role Enforcement Middleware**
After authentication:
- Checks if `req.user.role` is allowed to access the route  
- Specific routes only available to ADMIN or SUPER_ADMIN  
- AGENTS filtered by order ownership (SKU-based)

Unauthorized:
```
403 Forbidden
```

---

## **3. Validation Middleware**
Ensures:
- Required fields exist  
- Integers are valid  
- Dates are real  
- Document types are recognized  

Common responses:
```
400 Bad Request
```

---

## **4. File Upload Middleware (Multer)**
Used for:
- Commercial Invoice  
- Packing List  
- BOL  
- Certificates  
- Photos  

Uploads are streamed to temp buffer and then sent to S3.

---

## **5. Error Handler**
The final middleware catches any thrown errors and returns:
```
500 { error: "Message" }
```

---

# 8.5 Authentication Flow

### Step-by-step:

1. User logs in (internal or broker)  
2. JWT created with:
   - id  
   - role  
   - username  
   - expiration  

3. Token stored in **HTTP-only cookie**  
4. Every request includes cookie  
5. Backend verifies token on every route  

### Broker tokens:
- Stored in `broker_token`  
- Restricted routes prefixed: `/customs/*`  

---

# 8.6 Prisma Integration Layer

### Purpose:
Prisma serves as the database abstraction between Express and SQLite.

### Capabilities:
- Strongly typed queries  
- Easy relation fetching  
- Automatic schema syncing with `prisma db push`  
- Transaction support  

### Common query patterns:
- Pagination for order/item lists  
- Sorted queries for commission reporting  
- Relational queries for multi-item orders  
- Filtered queries for AGENT isolation  

---

# 8.7 Core Backend Modules (High Detail)

Below is an overview of how each major backend route module operates.

---

## **8.7.1 Orders Module (`orders.js`)**

Handles:
- Creating orders  
- Updating order metadata  
- Managing container linkage  
- Filtering orders by role  
- Providing manufacturing overview data  

Business logic includes:
- SKU → agent ownership  
- Lock/unlock behavior  
- Manufacturing stage constraints  

---

## **8.7.2 Items Module (`items.js`)**

Handles:
- Item creation and editing  
- Stage updates  
- Price updates  
- Metadata updates  
- Assigning items to containers  

Triggers:
- Commission events  
- Broker visibility updates  

---

## **8.7.3 Document Module (`documents.js`)**

Handles:
- Uploading documents (multer)  
- Streaming documents to S3  
- Generating pre-signed URLs  
- Listing existing documents  
- Deletion  

This is one of the highest I/O modules.

---

## **8.7.4 Commission Module (`commissions.js`)**

Handles:
- Calculating commissions  
- Generating reports  
- Processing payouts  
- Summaries for ADMIN/ACCOUNTANT  
- Agent commission views  

Includes core logic:
- Proportional discount allocation  
- Multi-stage payout  
- Orphaned commission handling  

---

## **8.7.5 Broker Module (`broker.js` + `/customs/*`)**

Handles:
- Broker login  
- Listing items pending clearance  
- Fetching required documents  
- Marking items as cleared  
- Fetching vessel + container metadata  

Routes are isolated intentionally under `/customs/*`.

---

## **8.7.6 Reports Module (`reports.js`)**

Handles:
- Manufacturing cycle time  
- Shipping performance  
- Commission summaries  
- Export endpoints  

Optimized through:
- Batched queries  
- Indexed fields  
- Pagination  

---

## **8.7.7 Settings Module (`settings.js`)**

Handles:
- Stage threshold configuration  
- Manufacturer list management  
- Commission defaults  
- Shipping metadata  

Restricted to:
- SUPER_ADMIN  
- ADMIN  

---

# 8.8 Request / Response Patterns

### Standard JSON response:
```
{
  success: true,
  data: { ... }
}
```

### Standard error response:
```
{
  error: "Message"
}
```

Backend errors never expose:
- Stack traces  
- Internal server secrets  
- SQL errors  

---

# 8.9 Backend Security Controls

### 1. **JWT required for all sensitive endpoints**
No fallback allowed.

### 2. **RBAC checked before business logic**
Protects from privilege escalation.

### 3. **AGENT query filtering**
Agents cannot request another agent’s order via:
- URL guess  
- API manipulation  
- Proxy tampering  

### 4. **S3 signed URLs**
Documents are never public.

### 5. **Rate limiting (planned)**
The November updates specify future optional enforcement for:
- Document upload limits  
- Authentication throttling  

---

# 8.10 Performance Considerations

### 1. Minimal blocking operations
Heavy operations must not block the event loop.

### 2. Batched Prisma queries
Large lists are fetched in paged or batched form.

### 3. Avoiding N+1 patterns
When fetching orders or items.

### 4. Multer streaming for uploads
Prevents large file memory cost.

---

# 8.11 PM2 Process Behavior

Backend runs under PM2 as:
```
order-tracker-backend
```

Benefits:
- Auto-restart on crash  
- Log persistence  
- Environment injection  
- Restart without downtime  

---

# 8.12 Summary of Backend Responsibilities

| Area | Responsibility |
|------|----------------|
| Authentication | JWT validation, login/logout |
| Orders | CRUD, stage tracking, ownership logic |
| Items | Metadata, stage updates, commissions |
| Documents | Upload, storage, retrieval |
| Commission | Calculation + reporting |
| Broker | Clearance workflows |
| Reports | Aggregated operational data |
| Settings | App-wide configuration |

---

This completes **Section 8: Backend API Layer (High Detail)**.

## 9. Database & Prisma Schema Overview  
### High Detail — Logical Model & Operational Considerations

The Order Tracker platform uses **SQLite** as its primary relational database, accessed exclusively through **Prisma ORM**. The schema is designed for clarity, maintainability, and a future migration path to PostgreSQL.

This section provides a **high-detail** overview of the logical schema, key relations, indexing strategy, and operational behaviors that matter for day-to-day work.

---

# 9.1 Core Entities & Relationships (Logical View)

At a high level, the schema revolves around these core entities:

- **Account** – Customer account container (legacy/primary)
- **Order** – Top-level commercial agreement with a customer
- **Item** – Individual machine or unit within an order
- **Commission** – Earnings tied to items and agents
- **Document** – Item-level document records stored in S3
- **Manufacturer** – External production partners
- **User** – Internal or external (manufacturer/broker) user
- **Notification** – In-app alerting
- **Settings** – System-wide configuration

### Simplified Relationship Diagram

```
Account 1 ────* Order 1 ────* Item 1 ────* Document
                     │
                     └────* Commission

User 1 ────* Order     (via SKU or explicit assignment)
User 1 ────* Commission (as agent)
User 1 ────* Notification

Manufacturer 1 ────* Item
```

---

# 9.2 Orders & Items Schema (Conceptual)

### Orders (Key Fields)
- `id` – Primary key
- `accountId` – Links to Account
- `sku` – Salesperson/agent identifier (legacy mapping)
- `orderDate` – Actual commercial order date
- `currentStage` – High-level order status
- `internalNotes` – Private notes
- `customerDocsLink` – External or shared documentation link (legacy)
- `isLocked` – Prevents editing

### Items (Key Fields)
- `id` – Primary key
- `orderId` – Parent order reference
- `productCode` / `modelNumber` – SKU/model data
- `qty` – Ordered quantity
- `itemPrice` – Price per unit
- `currentStage` – Item-level stage in 10-step workflow
- `containerId` or container references – Shipping linkage
- `privateItemNote` – Internal notes
- Measurement fields (height/width/length/weight/units)

**Important Notes:**
- **Item stage** drives commission triggers and broker visibility.
- **Order stage** is high-level; most workflows are item-driven.
- Agent ownership is often derived from `order.sku`.

---

# 9.3 Commission Schema (Conceptual)

The commission system includes several tables (names may vary slightly by implementation):

- **Commission** – Calculated earnings per item
- **CommissionPayout** – Records of paid-out commission events
- **CommissionRate** – Per-agent configurable rates
- **CommissionStageSetting** – Stage-level payout percentage configuration

### Commission (Key Fields):
- `id`
- `itemId`
- `agentId` (user)
- `baseAmount` – Commissionable base after discounts
- `rate` – Rate at time of calculation
- `amount` – Calculated commission value
- `stage` – Stage at which it became eligible
- `status` – Pending / Approved / Paid / Orphaned

### Operational Notes:
- Commission data is **never cascade-deleted** with orders/items.
- Orphaned commissions are retained for audit.
- Discount distribution is proportional across item prices.

---

# 9.4 Document Schema (Conceptual)

Each document record represents an object stored in S3.

**Key Fields:**
- `id`
- `itemId`
- `type` – Document type (invoice, packing list, etc.)
- `s3Key` – Full path in S3 bucket
- `originalFilename`
- `mimeType`
- `uploadedAt`
- `uploadedByUserId`

**Key Behavior:**
- Deletion marks DB entry removed and deletes S3 object.
- Pre-signed URLs rely on `s3Key` and bucket name.

---

# 9.5 User & Role Schema (Conceptual)

Users are stored with role and login credentials.

**Key Fields:**
- `id`
- `email`
- `username`
- `role` – One of SUPER_ADMIN, ACCOUNTANT, ADMIN, AGENT, MANUFACTURER, BROKER
- `passwordHash`
- `isActive`
- Timestamps

Prisma-level enums or string fields define roles; the RBAC logic is applied at runtime (see Section 5).

---

# 9.6 Settings & Configuration Tables

Settings are stored for:
- Stage thresholds (warning/critical days)
- Commission defaults
- Manufacturer lists
- Misc system-level flags

Approach:
- Small, normalized tables
- Single-row tables for global settings or key-value style

Only SUPER_ADMIN and ADMIN roles should modify these.

---

# 9.7 Indexing Strategy

Because SQLite can degrade quickly with non-indexed queries, the schema uses indexes on:

- **Orders**
  - `orderDate`
  - `sku` (agent ownership)
  - `accountId`
  - `currentStage`

- **Items**
  - `orderId`
  - `currentStage`
  - `manufacturerId`
  - `containerId` (if present)

- **Commissions**
  - `agentId`
  - `status`
  - `createdAt`
  - `itemId`

- **Documents**
  - `itemId`
  - `type`
  - `uploadedAt`

- **Users**
  - `email`
  - `role`
  - `isActive`

### Performance Considerations:
- Large report queries *must* filter on indexed columns.
- Use pagination (limit/offset) for large lists.
- Avoid full-table scans when querying across dates or stages.

---

# 9.8 Prisma & Schema Management

## 9.8.1 Schema Definition

All schema definitions live in:

```
/api/prisma/schema.prisma
```

Prisma models define:
- Tables  
- Relations  
- Indexes  
- Enum-like behavior  

## 9.8.2 Applying Schema Changes

**CRITICAL RULE:**

> Use `npx prisma db push` for schema changes on the EC2 instance (NOT `migrate deploy`).

### Workflow:
1. Update `schema.prisma` in GitHub (aws-deployment branch)
2. SSH into server
3. Navigate to `/var/www/order-tracker/api`
4. Run:
   ```bash
   npx prisma db push
   npx prisma generate
   ```
5. Restart backend:
   ```bash
   pm2 restart order-tracker-backend
   ```

If frontend consumes new fields, also rebuild:
```bash
cd /var/www/order-tracker/web
rm -rf .next
npm run build
pm2 restart order-tracker-frontend
```

---

# 9.9 Common Failure Modes & Fixes

### 1. Blank UI / missing data
**Cause:** Prisma client out of sync with schema.  
**Fix:** `npx prisma generate` and redeploy frontend.

### 2. "Unknown field" Prisma errors
**Cause:** Backend code referencing schema field that doesn’t exist.  
**Fix:** Ensure `prisma db push` has been run with the updated schema.

### 3. "No such column" database errors
**Cause:** SQLite file not updated with new schema.  
**Fix:** Run `npx prisma db push` on the server.

### 4. Performance issues on large reports
**Cause:** Non-indexed filters or large unpaginated queries.  
**Fix:** Add or use appropriate Prisma indexes, paginate queries.

---

# 9.10 Backup & Restore Behavior at DB Level

### Backups:
- Entire `dev.db` file is copied to S3 (see Section 4).
- ACID guarantees and WAL journaling make hot backups safe.

### Restore:
1. Stop PM2 services  
2. Replace `dev.db` with backup file  
3. Restart backend and frontend  
4. Optionally run integrity checks via `prisma studio`  

---

# 9.11 Migration Considerations (SQLite → PostgreSQL)

While not yet implemented, Prisma enables:
- Reusing model definitions with a new `provider = "postgresql"`  
- Regenerating the client  
- Running migrations to build PostgreSQL schema  

Reports and business logic can remain largely unchanged, but any raw SQL or SQLite-specific behaviors must be audited.

---

This completes **Section 9: Database & Prisma Schema Overview (High Detail)**.
