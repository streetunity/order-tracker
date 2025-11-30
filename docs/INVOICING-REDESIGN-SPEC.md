# Invoicing & CRM Module - Redesign Specification

**Date:** November 30, 2025  
**Purpose:** Complete redesign of the Invoicing & CRM module to achieve a professional, QuickBooks-inspired interface while maintaining the Order Tracker color scheme.

---

## Overview

The current Invoicing & CRM page needs a significant upgrade to look and feel more professional. The goal is to emulate QuickBooks Online's dashboard-style interface with metric cards, charts, and clean data presentation, while keeping our established color scheme:

- **Primary Red:** #dc2626
- **Backgrounds:** Black (#000), Dark Gray (#1f1f1f, #2d2d2d)
- **Borders:** #404040
- **Text:** White (#fff), Gray (#9ca3af, #6b7280)

---

## Current State

The existing page has:
- Simple horizontal tabs (Leads, Customers, Estimates, Invoices, Reports)
- Basic flat table design
- Inline Edit/Delete buttons
- No dashboard metrics or visualizations
- No sidebar navigation

---

## Target State (QuickBooks-Inspired)

### Layout Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopNav (existing Order Tracker navigation)                                │
├─────────────┬────────────────────────────────────────────────────────────┤
│             │                                                             │
│  SIDEBAR    │   MAIN CONTENT AREA                                        │
│             │                                                             │
│  Dashboard  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  ─────────  │   │Outstanding│ │ Overdue │ │Paid 30d │ │ Drafts  │         │
│  Leads      │   │ $12,450  │ │ $3,200  │ │ $28,900 │ │    4    │         │
│  Customers  │   └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
│  Products   │                                                             │
│  Estimates  │   ┌───────────────────────┐ ┌───────────────────────┐     │
│  Invoices   │   │    REVENUE CHART      │ │   INVOICE AGING       │     │
│  Reports    │   │    (Line Graph)       │ │   (Horizontal Bars)   │     │
│             │   └───────────────────────┘ └───────────────────────┘     │
│             │                                                             │
│             │   ┌─────────────────────────────────────────────────┐     │
│             │   │  RECENT INVOICES                        + New   │     │
│             │   │  ┌─────────────────────────────────────────┐   │     │
│             │   │  │ Professional data table                 │   │     │
│             │   │  └─────────────────────────────────────────┘   │     │
│             │   └─────────────────────────────────────────────────┘     │
│             │                                                             │
└─────────────┴────────────────────────────────────────────────────────────┘
```

---

## Components to Build

### 1. Sidebar Navigation Component

**File:** `web/components/InvoicingSidebar.jsx`

```
┌─────────────────┐
│  + New Invoice  │  ← Primary action button (red)
├─────────────────┤
│ ◉ Dashboard     │  ← Active state: red text/indicator
│ ○ Leads         │
│ ○ Customers     │
│ ○ Products      │  ← NEW TAB
│ ○ Estimates     │
│ ○ Invoices      │
│ ○ Reports       │
└─────────────────┘
```

**Specifications:**
- Width: 200px (collapsible to 60px on mobile)
- Dark background (#1a1a1a)
- Hover state: lighter background (#2d2d2d)
- Active state: Red left border, red text
- Icons using lucide-react

---

### 2. Dashboard View (Default Landing)

**File:** `web/app/admin/invoicing/page.jsx`

#### Metric Cards Row
Four cards displaying key metrics:

| Card | Value | Subtitle | Color |
|------|-------|----------|-------|
| Outstanding | $XX,XXX | X invoices | White |
| Overdue | $X,XXX | X invoices | Red (#dc2626) |
| Paid (30 days) | $XX,XXX | X invoices | Green (#10b981) |
| Draft | X | invoices | Gray |

**Card Design:**
```css
{
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 8px;
  padding: 20px;
  min-width: 200px;
}
```

#### Charts Row (Two columns)

**Left: Revenue Chart (Line Graph)**
- 12-month revenue trend
- Uses Chart.js (already installed)
- Red line (#dc2626) on dark background
- Time period selector dropdown

**Right: Invoice Aging (Horizontal Bar Chart)**
- Current (0-30 days)
- 31-60 days
- 61-90 days
- 90+ days (Overdue - red)

#### Recent Activity Section
- Last 5-10 invoices/payments
- Shows: Invoice #, Customer, Amount, Status, Date
- Quick action links

---

### 3. Leads Tab

**File:** `web/app/admin/invoicing/leads/page.jsx`

Pipeline/Kanban style or table view for sales leads:

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Auto-increment |
| name | String | Lead name |
| company | String | Company name |
| email | String | Contact email |
| phone | String | Phone number |
| source | Enum | WEBSITE, REFERRAL, TRADE_SHOW, COLD_CALL, OTHER |
| status | Enum | NEW, CONTACTED, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST |
| value | Decimal | Estimated deal value |
| notes | Text | Notes/comments |
| assignedTo | Int | FK to User |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**Features:**
- Drag-and-drop between status columns (optional)
- Convert lead to customer button
- Add notes/activity log

---

### 4. Customers Tab (Redesigned)

**File:** `web/app/admin/invoicing/customers/page.jsx`

**Current columns:** Customer #, Name, Company, Email, Phone, Payment Terms, Status, Actions

**Redesigned Table:**
- Cleaner row styling with hover states
- Status badges (styled pills, not just text)
- Action dropdown menu instead of inline buttons
- Bulk actions checkbox column
- Better search with filters

**Customer Detail Modal/Page:**
- Contact information
- Billing/shipping addresses
- Payment terms
- Invoice history
- Total spent
- Outstanding balance
- Notes

---

### 5. Products Tab (NEW)

**File:** `web/app/admin/invoicing/products/page.jsx`

Product catalog for quick invoice population.

#### Database Schema

```prisma
model Product {
  id          Int       @id @default(autoincrement())
  sku         String    @unique
  name        String
  description String?
  category    String?
  unitPrice   Decimal   @default(0)
  cost        Decimal?  @default(0)
  taxRate     Decimal?  @default(0)
  unit        String    @default("Each")  // Each, Hour, Sq Ft, Box, etc.
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relations
  invoiceItems InvoiceItem[]
  estimateItems EstimateItem[]
}
```

#### UI Features

**Table Columns:**
| Column | Width | Description |
|--------|-------|-------------|
| SKU | 100px | Product code |
| Name | 25% | Product name |
| Category | 15% | Category/type |
| Unit Price | 120px | Selling price |
| Cost | 100px | Your cost (admin only) |
| Margin | 80px | Calculated % |
| Unit | 80px | Unit of measure |
| Status | 80px | Active/Inactive badge |
| Actions | 100px | Edit dropdown |

**Features:**
- Import from CSV
- Export to CSV
- Category filter dropdown
- Search by name/SKU
- Bulk status update
- Duplicate product

**Add/Edit Product Modal:**
```
┌─────────────────────────────────────────────┐
│  Add Product                            X   │
├─────────────────────────────────────────────┤
│                                             │
│  SKU *            [____________]            │
│  Name *           [____________]            │
│  Description      [____________]            │
│                   [____________]            │
│                                             │
│  Category         [Dropdown____▼]           │
│  Unit             [Dropdown____▼]           │
│                                             │
│  ┌─────────────┐  ┌─────────────┐          │
│  │ Unit Price  │  │ Cost        │          │
│  │ $[________] │  │ $[________] │          │
│  └─────────────┘  └─────────────┘          │
│                                             │
│  Tax Rate         [____]%                   │
│                                             │
│  [x] Active                                 │
│                                             │
├─────────────────────────────────────────────┤
│              [Cancel]  [Save Product]       │
└─────────────────────────────────────────────┘
```

---

### 6. Estimates Tab

**File:** `web/app/admin/invoicing/estimates/page.jsx`

Quotes/proposals that can convert to invoices.

#### Database Schema

```prisma
model Estimate {
  id            Int             @id @default(autoincrement())
  estimateNumber String         @unique  // EST-0001
  customerId    Int
  customer      InvoiceCustomer @relation(fields: [customerId], references: [id])
  status        EstimateStatus  @default(DRAFT)
  issueDate     DateTime        @default(now())
  expiryDate    DateTime?
  subtotal      Decimal         @default(0)
  taxAmount     Decimal         @default(0)
  discount      Decimal         @default(0)
  total         Decimal         @default(0)
  notes         String?
  terms         String?
  createdById   Int
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  
  items         EstimateItem[]
  invoice       Invoice?        // If converted
}

model EstimateItem {
  id          Int       @id @default(autoincrement())
  estimateId  Int
  estimate    Estimate  @relation(fields: [estimateId], references: [id])
  productId   Int?
  product     Product?  @relation(fields: [productId], references: [id])
  description String
  quantity    Decimal   @default(1)
  unitPrice   Decimal
  taxRate     Decimal?  @default(0)
  amount      Decimal
}

enum EstimateStatus {
  DRAFT
  SENT
  VIEWED
  ACCEPTED
  DECLINED
  EXPIRED
  CONVERTED
}
```

**Features:**
- Create estimate with line items
- Select from product catalog or custom items
- Send via email (future)
- Convert to invoice (one-click)
- PDF generation
- Duplicate estimate

---

### 7. Invoices Tab

**File:** `web/app/admin/invoicing/invoices/page.jsx`

#### Database Schema

```prisma
model Invoice {
  id            Int             @id @default(autoincrement())
  invoiceNumber String          @unique  // INV-0001
  customerId    Int
  customer      InvoiceCustomer @relation(fields: [customerId], references: [id])
  estimateId    Int?            // If created from estimate
  estimate      Estimate?       @relation(fields: [estimateId], references: [id])
  status        InvoiceStatus   @default(DRAFT)
  issueDate     DateTime        @default(now())
  dueDate       DateTime
  subtotal      Decimal         @default(0)
  taxAmount     Decimal         @default(0)
  discount      Decimal         @default(0)
  total         Decimal         @default(0)
  amountPaid    Decimal         @default(0)
  balanceDue    Decimal         @default(0)
  notes         String?
  terms         String?
  createdById   Int
  sentAt        DateTime?
  paidAt        DateTime?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  
  items         InvoiceItem[]
  payments      Payment[]
}

model InvoiceItem {
  id          Int       @id @default(autoincrement())
  invoiceId   Int
  invoice     Invoice   @relation(fields: [invoiceId], references: [id])
  productId   Int?
  product     Product?  @relation(fields: [productId], references: [id])
  description String
  quantity    Decimal   @default(1)
  unitPrice   Decimal
  taxRate     Decimal?  @default(0)
  amount      Decimal
}

model Payment {
  id          Int           @id @default(autoincrement())
  invoiceId   Int
  invoice     Invoice       @relation(fields: [invoiceId], references: [id])
  amount      Decimal
  method      PaymentMethod
  reference   String?       // Check #, transaction ID, etc.
  notes       String?
  receivedAt  DateTime      @default(now())
  createdById Int
  createdAt   DateTime      @default(now())
}

enum InvoiceStatus {
  DRAFT
  SENT
  VIEWED
  PARTIAL
  PAID
  OVERDUE
  VOID
}

enum PaymentMethod {
  CASH
  CHECK
  CREDIT_CARD
  BANK_TRANSFER
  OTHER
}
```

**Invoice List View:**
| Column | Description |
|--------|-------------|
| Invoice # | INV-0001 |
| Customer | Company name |
| Issue Date | Date issued |
| Due Date | Payment due date |
| Total | Invoice total |
| Balance Due | Remaining amount |
| Status | Badge (Draft, Sent, Paid, Overdue) |
| Actions | View, Edit, Record Payment, Send, Void |

**Status Badge Colors:**
- Draft: Gray (#6b7280)
- Sent: Blue (#3b82f6)
- Viewed: Purple (#8b5cf6)
- Partial: Yellow (#f59e0b)
- Paid: Green (#10b981)
- Overdue: Red (#dc2626)
- Void: Dark gray, strikethrough

**Create/Edit Invoice Page:**
- Customer selector (searchable dropdown)
- Date pickers (issue date, due date)
- Line items table with product search
- Auto-calculate subtotal, tax, total
- Notes and terms fields
- Preview before sending
- Save as draft or send immediately

---

### 8. Reports Tab

**File:** `web/app/admin/invoicing/reports/page.jsx`

#### Available Reports

1. **Revenue Summary**
   - Total revenue by period
   - Line chart trend
   - Comparison to previous period

2. **Invoice Aging**
   - Current, 1-30, 31-60, 61-90, 90+ days
   - Drill down to individual invoices

3. **Customer Report**
   - Revenue by customer
   - Top customers
   - Outstanding by customer

4. **Product Sales**
   - Best selling products
   - Revenue by product/category

5. **Payment Report**
   - Payments received by period
   - Payment methods breakdown

**Report UI Pattern:**
- Report selector dropdown or cards
- Date range picker
- Export to CSV/PDF
- Print-friendly view

---

## Backend API Routes

**File:** `api/src/routes/invoicing.js`

### Endpoints Required

```
# Customers
GET    /api/invoicing/customers
POST   /api/invoicing/customers
GET    /api/invoicing/customers/:id
PUT    /api/invoicing/customers/:id
DELETE /api/invoicing/customers/:id

# Products
GET    /api/invoicing/products
POST   /api/invoicing/products
GET    /api/invoicing/products/:id
PUT    /api/invoicing/products/:id
DELETE /api/invoicing/products/:id
POST   /api/invoicing/products/import  # CSV import

# Leads
GET    /api/invoicing/leads
POST   /api/invoicing/leads
GET    /api/invoicing/leads/:id
PUT    /api/invoicing/leads/:id
DELETE /api/invoicing/leads/:id
POST   /api/invoicing/leads/:id/convert  # Convert to customer

# Estimates
GET    /api/invoicing/estimates
POST   /api/invoicing/estimates
GET    /api/invoicing/estimates/:id
PUT    /api/invoicing/estimates/:id
DELETE /api/invoicing/estimates/:id
POST   /api/invoicing/estimates/:id/convert  # Convert to invoice
GET    /api/invoicing/estimates/:id/pdf

# Invoices
GET    /api/invoicing/invoices
POST   /api/invoicing/invoices
GET    /api/invoicing/invoices/:id
PUT    /api/invoicing/invoices/:id
DELETE /api/invoicing/invoices/:id
POST   /api/invoicing/invoices/:id/send
POST   /api/invoicing/invoices/:id/void
POST   /api/invoicing/invoices/:id/payments
GET    /api/invoicing/invoices/:id/pdf

# Dashboard & Reports
GET    /api/invoicing/dashboard  # Metrics for dashboard cards
GET    /api/invoicing/reports/revenue
GET    /api/invoicing/reports/aging
GET    /api/invoicing/reports/customers
GET    /api/invoicing/reports/products
```

---

## Database Schema Updates

Add to `api/prisma/schema.prisma`:

```prisma
// ============================================
// INVOICING MODULE
// ============================================

model InvoiceCustomer {
  id            Int       @id @default(autoincrement())
  customerNumber String   @unique  // CUST-0001
  name          String              // Contact name
  company       String?             // Company name
  email         String?
  phone         String?
  billingAddress  String?
  shippingAddress String?
  paymentTerms  String    @default("NET30")
  taxExempt     Boolean   @default(false)
  notes         String?
  status        String    @default("ACTIVE")  // ACTIVE, INACTIVE
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  estimates     Estimate[]
  invoices      Invoice[]
  leads         Lead[]
}

model Lead {
  id          Int       @id @default(autoincrement())
  name        String
  company     String?
  email       String?
  phone       String?
  source      String?   // WEBSITE, REFERRAL, TRADE_SHOW, etc.
  status      String    @default("NEW")  // NEW, CONTACTED, QUALIFIED, etc.
  value       Decimal?
  notes       String?
  assignedToId Int?
  customerId  Int?      // If converted
  customer    InvoiceCustomer? @relation(fields: [customerId], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Product {
  id          Int       @id @default(autoincrement())
  sku         String    @unique
  name        String
  description String?
  category    String?
  unitPrice   Decimal   @default(0)
  cost        Decimal?  @default(0)
  taxRate     Decimal?  @default(0)
  unit        String    @default("Each")
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  invoiceItems  InvoiceItem[]
  estimateItems EstimateItem[]
}

model Estimate {
  id              Int       @id @default(autoincrement())
  estimateNumber  String    @unique
  customerId      Int
  customer        InvoiceCustomer @relation(fields: [customerId], references: [id])
  status          String    @default("DRAFT")
  issueDate       DateTime  @default(now())
  expiryDate      DateTime?
  subtotal        Decimal   @default(0)
  taxAmount       Decimal   @default(0)
  discount        Decimal   @default(0)
  total           Decimal   @default(0)
  notes           String?
  terms           String?
  createdById     Int
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  items           EstimateItem[]
  invoice         Invoice?
}

model EstimateItem {
  id          Int       @id @default(autoincrement())
  estimateId  Int
  estimate    Estimate  @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  productId   Int?
  product     Product?  @relation(fields: [productId], references: [id])
  description String
  quantity    Decimal   @default(1)
  unitPrice   Decimal
  taxRate     Decimal?  @default(0)
  amount      Decimal
}

model Invoice {
  id              Int       @id @default(autoincrement())
  invoiceNumber   String    @unique
  customerId      Int
  customer        InvoiceCustomer @relation(fields: [customerId], references: [id])
  estimateId      Int?      @unique
  estimate        Estimate? @relation(fields: [estimateId], references: [id])
  status          String    @default("DRAFT")
  issueDate       DateTime  @default(now())
  dueDate         DateTime
  subtotal        Decimal   @default(0)
  taxAmount       Decimal   @default(0)
  discount        Decimal   @default(0)
  total           Decimal   @default(0)
  amountPaid      Decimal   @default(0)
  balanceDue      Decimal   @default(0)
  notes           String?
  terms           String?
  createdById     Int
  sentAt          DateTime?
  paidAt          DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  items           InvoiceItem[]
  payments        Payment[]
}

model InvoiceItem {
  id          Int       @id @default(autoincrement())
  invoiceId   Int
  invoice     Invoice   @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  productId   Int?
  product     Product?  @relation(fields: [productId], references: [id])
  description String
  quantity    Decimal   @default(1)
  unitPrice   Decimal
  taxRate     Decimal?  @default(0)
  amount      Decimal
}

model Payment {
  id          Int       @id @default(autoincrement())
  invoiceId   Int
  invoice     Invoice   @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  amount      Decimal
  method      String    // CASH, CHECK, CREDIT_CARD, BANK_TRANSFER, OTHER
  reference   String?
  notes       String?
  receivedAt  DateTime  @default(now())
  createdById Int
  createdAt   DateTime  @default(now())
}
```

---

## File Structure

```
web/app/admin/invoicing/
├── page.jsx                    # Dashboard (default view)
├── layout.jsx                  # Layout with sidebar
├── invoicing.css               # Module-specific styles
├── leads/
│   └── page.jsx
├── customers/
│   ├── page.jsx
│   └── [id]/
│       └── page.jsx            # Customer detail
├── products/
│   └── page.jsx
├── estimates/
│   ├── page.jsx
│   ├── new/
│   │   └── page.jsx
│   └── [id]/
│       └── page.jsx
├── invoices/
│   ├── page.jsx
│   ├── new/
│   │   └── page.jsx
│   └── [id]/
│       └── page.jsx
└── reports/
    └── page.jsx

web/components/invoicing/
├── InvoicingSidebar.jsx
├── MetricCard.jsx
├── RevenueChart.jsx
├── AgingChart.jsx
├── InvoiceTable.jsx
├── CustomerSelect.jsx
├── ProductSelect.jsx
├── LineItemsEditor.jsx
├── StatusBadge.jsx
└── InvoicePDF.jsx

api/src/routes/
├── invoicing.js                # Main invoicing routes
├── invoicingCustomers.js       # Customer CRUD
├── invoicingProducts.js        # Product CRUD
├── invoicingLeads.js           # Lead CRUD
├── invoicingEstimates.js       # Estimate CRUD
├── invoicingInvoices.js        # Invoice CRUD
└── invoicingReports.js         # Report endpoints
```

---

## Implementation Order

### Phase 1: Foundation
1. Add database schema to prisma
2. Run `npx prisma db push`
3. Create basic API routes (CRUD for each entity)
4. Create sidebar navigation component
5. Create layout with sidebar

### Phase 2: Core Pages
1. Dashboard with metric cards (static first, then API)
2. Products page (CRUD, import/export)
3. Customers page redesign
4. Basic Invoices page (list view)

### Phase 3: Invoice Creation
1. Create/Edit invoice page
2. Line items editor with product search
3. Auto-calculations
4. PDF generation using jsPDF

### Phase 4: Estimates
1. Estimates list and CRUD
2. Convert estimate to invoice
3. Estimate PDF

### Phase 5: Advanced Features
1. Leads page
2. Reports with charts
3. Dashboard charts (revenue, aging)
4. Payment recording

### Phase 6: Polish
1. Email sending (future - AWS SES)
2. Stripe integration (future)
3. Customer portal (future)

---

## Design Specifications

### Card Component
```css
.metric-card {
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 8px;
  padding: 20px 24px;
}

.metric-card:hover {
  border-color: #dc2626;
  cursor: pointer;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 4px;
}

.metric-label {
  font-size: 13px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

### Table Styling
```css
.invoice-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.invoice-table th {
  background: #1f1f1f;
  color: #dc2626;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #404040;
}

.invoice-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #2d2d2d;
  color: #e4e4e4;
  font-size: 14px;
}

.invoice-table tr:hover td {
  background: #2d2d2d;
}
```

### Status Badges
```css
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.status-draft { background: #374151; color: #9ca3af; }
.status-sent { background: #1e3a5f; color: #60a5fa; }
.status-paid { background: #064e3b; color: #34d399; }
.status-overdue { background: #7f1d1d; color: #fca5a5; }
.status-partial { background: #78350f; color: #fbbf24; }
.status-void { background: #1f1f1f; color: #6b7280; text-decoration: line-through; }
```

### Sidebar
```css
.invoicing-sidebar {
  width: 220px;
  min-height: calc(100vh - 60px);
  background: #1a1a1a;
  border-right: 1px solid #2d2d2d;
  padding: 16px 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.sidebar-item:hover {
  background: #2d2d2d;
  color: #ffffff;
}

.sidebar-item.active {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  border-left-color: #dc2626;
}
```

---

## Questions to Resolve

1. **Customer Data Sharing:** Should InvoiceCustomer be separate from Order Tracker's Account model, or should they share data?

2. **User Permissions:** Which roles can access invoicing? (Likely SUPER_ADMIN, ACCOUNTANT, maybe ADMIN)

3. **Invoice Numbering:** Start at INV-0001 or continue from existing sequence?

4. **Tax Handling:** Single tax rate or support for multiple tax rates/jurisdictions?

5. **Currency:** USD only or multi-currency support?

6. **Email Integration:** Build email sending now or defer to Phase 6?

---

## Success Criteria

- [ ] Dashboard loads with real metrics from database
- [ ] Products can be created, edited, deleted
- [ ] Invoices can be created with line items from product catalog
- [ ] Invoice PDF generates correctly with company branding
- [ ] Payments can be recorded against invoices
- [ ] Status updates automatically (Paid when fully paid, Overdue when past due)
- [ ] Reports show accurate data with proper filtering
- [ ] UI matches QuickBooks-level professionalism
- [ ] All pages use consistent styling and color scheme
- [ ] Mobile responsive (sidebar collapses)

---

## Reference Images

- Current state screenshot: Basic table with tabs
- Target state: QuickBooks Online dashboard with cards, charts, sidebar

---

**Document Version:** 1.0  
**Created:** November 30, 2025  
**Author:** Project Planning  
**Status:** Ready for Development
