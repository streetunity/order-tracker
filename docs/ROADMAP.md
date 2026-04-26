# Order Tracker — Feature Roadmap

**Last updated:** April 2026  
**Branch:** `feature/invoicing-port`

Prioritised list of planned enhancements beyond the current production system. See `docs/TODO.md` for the consolidated punch list against current branch state.

---

## Priority 1 — High Impact, Contained Builds

### 1.1 Global Search

**Problem:** No way to find an order, customer, item, or invoice without knowing where to navigate first. Staff type serial numbers, customer names, or PO numbers into browser find-in-page as a workaround.

**Solution:** A persistent search bar in the TopNav that queries across all major entities and returns grouped results.

#### Scope

**Backend — `api/src/routes/search.js`**
- `GET /api/search?q=:query` — single endpoint, searches in parallel:
  - Orders: `poNumber`, `account.name`
  - Items: `productCode`, `serialNumber`, `modelNumber`
  - Customers (accounts): `name`, `email`, `contactName`
  - Invoices: `invoiceNumber`, `account.name`
  - Leads: `firstName`, `lastName`, `email`, `company`
- Returns max 5 results per category, total response under 200ms target
- Role-filtered: agents only see their own orders/items
- Register in `index.js`

**Frontend — `web/components/GlobalSearch.jsx`**
- Replaces the static logo text area in TopNav or sits in the nav-right zone
- Keyboard shortcut: `Cmd/Ctrl + K` opens it as a modal overlay
- Debounced input (300ms) triggers the API call
- Results shown in grouped dropdown: Orders / Items / Customers / Invoices
- Each result is a link — clicking navigates and closes the modal
- `Esc` closes, clicking outside closes
- Loading spinner while fetching
- Empty state: "No results for \"xyz\""
- Hidden for MANUFACTURER and BROKER roles

**Files to create/modify:**
- `api/src/routes/search.js` (new)
- `api/src/index.js` (mount route)
- `web/components/GlobalSearch.jsx` (new)
- `web/components/TopNav.jsx` (add search trigger)

**Estimated effort:** 4–6 hours  
**Risk:** Low — read-only queries, no schema changes

---

### 1.2 ~~Stripe Payments~~ → NexNP Production Cutover

**Status:** Stripe is obsolete — NexNP was chosen instead and is mostly built.

**What's done:**
- `api/src/services/nextnpService.js` — gateway integration
- `api/src/routes/payments.js` — manual payment recording, refund support, schedule-item handling
- `api/src/routes/nextnpWebhook.js` — webhook handler
- `web/app/pay/[token]/page.jsx` — public payment page using NexNP Tokenizer (PCI SAQ-A — raw card data never hits the server)
- ACH and card support confirmed
- Schedule-item-aware payment application + auto order creation when deposit threshold met

**What's still required:**
- End-to-end payment testing in production environment (cards + ACH happy paths, edge cases like declines, partials, refunds)
- Swap sandbox NexNP keys for production keys in `.env`
- Remove or stub the dead `stripeService.js` and the unused `stripePaymentIntentId` / `stripeChargeId` fields on `Payment` (cosmetic cleanup, not blocking)

**Estimated effort:** 4–6 hours of testing + key swap  
**Risk:** Medium — involves live money. Test thoroughly in sandbox before flipping keys.

---

## Priority 2 — Medium Impact

### 2.1 Internal Order Notes / Comments

**Problem:** Staff have no way to leave internal notes on an order visible to all team members. Context like "customer requested delay", "waiting on customs clearance", or "follow up Friday" lives in emails or chat.

**Solution:** A collapsible notes thread on the order detail page, visible to all internal roles.

#### Scope

**Backend**
- `OrderNote` Prisma model: `id`, `orderId`, `authorId`, `body`, `createdAt`, `isPinned`
- `api/src/routes/orderNotes.js`:
  - `GET /orders/:id/notes` — list notes newest-first
  - `POST /orders/:id/notes` — create note
  - `PATCH /orders/:id/notes/:noteId` — edit own note (within 10 min window)
  - `DELETE /orders/:id/notes/:noteId` — soft delete (Super Admin only)
  - `PATCH /orders/:id/notes/:noteId/pin` — pin/unpin (Admin+)
- Audit log entry on create

**Frontend**
- New "Notes" tab in `web/app/admin/orders/[id]/page.jsx`
- Also accessible as a compact panel in the board quickview (ViewItemModal) — shows pinned notes only with a "See all" link
- Textarea + Post button
- Each note shows: avatar initials, author name, timestamp, body
- Pinned notes appear at top with a 📌 indicator
- Authors can edit their own notes within 10 minutes (inline edit)
- Note count badge on the tab label

**Schema changes:** Add `OrderNote` model — `npx prisma db push` required  
**Estimated effort:** 5–7 hours  
**Risk:** Low

---

### 2.2 Order / Item Templates

**Problem:** Many orders are nearly identical configurations (same product, voltage, accessories). Every new order requires re-entering all items from scratch.

**Solution:** Save an order's items as a named template. Create a new order from a template to pre-populate all items.

#### Scope

**Backend**
- `OrderTemplate` model: `id`, `name`, `description`, `createdByUserId`, `isGlobal`, `createdAt`
- `OrderTemplateItem` model: `id`, `templateId`, `productCode`, `qty`, `voltage`, `modelNumber`, `laserWattage`, `notes`
- `api/src/routes/orderTemplates.js`:
  - `GET /order-templates` — list (own + global)
  - `POST /order-templates` — create from scratch or from existing order ID
  - `GET /order-templates/:id` — fetch with items
  - `DELETE /order-templates/:id` — own templates only
  - `PATCH /order-templates/:id` — rename/toggle global

**Frontend — New Order page**
- "Start from template" option on `/admin/orders/new` — shows a template picker modal before the form
- Selecting a template pre-populates all item rows
- User can still edit before saving

**Frontend — Order detail page**
- "Save as template" button (Admin+) — opens a modal to name it and choose public/private

**Schema changes:** Two new models — `npx prisma db push` required  
**Estimated effort:** 6–8 hours  
**Risk:** Low

---

### 2.3 Bulk Board Operations

**Problem:** When a shipping container arrives, moving 8–12 items from "Container At Sea" to "Arrived at SMT" requires clicking each item individually. Batch operations would take seconds instead of minutes.

**Solution:** Multi-select on the board with bulk stage change, bulk archive, and bulk assign.

#### Scope

**Backend**
- `POST /api/items/bulk-stage` — accepts `{ itemIds: [], stage: '' }`, applies stage change to all, fires email notifications and commission triggers per item
- `POST /api/items/bulk-archive` — soft-archives multiple items

**Frontend**
- Checkbox appears on each item card when hovering (or when a "Select" mode toggle is active in the toolbar)
- Toolbar shows selected count and bulk action buttons when any items are selected: **Move to Stage ▾**, **Archive**, **Clear selection**
- Stage dropdown uses same stage labels as the single-item arrows
- Confirmation modal for destructive actions (archive)
- Stage change confirmation includes the same "customer will be notified" amber warning added for single items
- Select All button selects all visible items across all customers

**Files to modify:**
- `api/src/routes/items.js` (add bulk endpoints)
- `web/app/admin/board/page.jsx` (selection state, toolbar, bulk handlers)
- `web/app/admin/board/board.css` (checkbox styles, selection highlight)

**Estimated effort:** 6–8 hours  
**Risk:** Medium — care needed to ensure commission triggers and email notifications fire correctly for each item in the batch

---

### 2.4 Agent Mobile View

**Problem:** The board is a wide grid layout — completely unusable on a phone. Agents checking on a customer's site or at a trade show have no good option.

**Solution:** A dedicated mobile-optimised route for agents showing only their orders and items in a simple list/card format.

#### Scope

**No new backend needed** — uses existing order/item APIs.

**Frontend — `web/app/agent/page.jsx`**
- Accessible at `/agent` — redirects desktop users to `/admin/board`
- Shows only orders assigned to the logged-in agent (filtered by `sku`)
- Card per order: customer name, PO, item count, latest stage
- Tap an order to expand: shows each item with its current stage pill and progress bar (same pill logic as the customer tracking page)
- Pull-to-refresh
- Simple search/filter bar at top
- "View customer tracking page" link per order
- No editing capability — read-only view
- TopNav hidden; simple header with logo + agent name + logout

**Detection:** `TopNav.jsx` can detect `window.innerWidth < 768` and show a "Switch to mobile view" link for AGENT role

**Estimated effort:** 5–7 hours  
**Risk:** Low — read-only, no schema changes

---

## Priority 3 — Lower Priority / Future

### 3.1 Executive Dashboard

**Problem:** No single view of business health. The board shows individual items but not aggregate metrics.

**Scope (summary):**
- Route: `/admin/dashboard`
- Widgets:
  - Revenue this month (invoiced) vs same month last year
  - Open orders count + estimated completion dates
  - Items by stage (bar chart)
  - Overdue items (past ETA)
  - Commission payouts pending approval (count + total $)
  - Top agents by revenue YTD
  - New leads this week
  - Conversion rate (leads → invoices → orders)
- All data from existing tables — no schema changes
- Link from TopNav for SUPER_ADMIN and ACCOUNTANT

**Estimated effort:** 8–12 hours  
**Risk:** Low

---

### 3.2 Unified Customer Portal

**Problem:** Customers currently have two separate access points — the order tracking page (`/t/[token]`) and the invoicing portal (`/portal/[token]`). A customer with multiple orders has multiple tracking links and no consolidated view.

**Scope (summary):**
- `CustomerPortalAccess` model: ties a customer email to a login (magic link or password)
- Login via magic link sent to customer email
- Portal shows: all orders (with tracking), all invoices (with payment), all files
- Replaces the per-order tracking token for customers with multiple orders
- Existing per-order tracking links continue to work as fallback

**Estimated effort:** 12–16 hours  
**Risk:** Medium — new auth flow, customer-facing

---

### 3.3 Cost / Margin Tracking (Order Side)

**Problem:** Orders record sale prices but not costs. No way to see margin per order or identify most profitable product lines. (Invoicing side is already done — `Estimate`, `Invoice`, `Product`, `Bundle` all carry cost / margin fields.)

**Scope (summary):**
- Add `costPrice` field to `OrderItem`
- Admin-only field (hidden from agents and customers)
- Reports page: margin by product code, margin by agent, margin by month
- Margin shown on order detail for Admin+

**Estimated effort:** 4–6 hours  
**Risk:** Low — additive only

---

### 3.4 Document Generation

**Problem:** Packing lists, certificates of conformity, and customs documents are likely still manually produced in Word.

**Scope (summary):**
- "Generate Packing List" button on order detail — PDF using jsPDF (already integrated)
- Template: order header, items with serial numbers/quantities/weights, shipping address
- "Generate Certificate of Conformity" — similar PDF, includes voltage/model/serial data per item
- Download immediately or attach to the order's customer files

**Estimated effort:** 6–8 hours  
**Risk:** Low

---

## Priority 4 — E-Signature Enhancements

### 4.1 E-Signature Phase 1 Polish

**Status of what's already built (Option 2 — Draw/Type signatures):**
- `api/src/routes/signatures.js` — capture, decline, retrieval routes (live)
- `Signature` schema model — stores `signerName`, `signerTitle`, `signerEmail`, `signatureData` (base64 PNG), `signatureType` (DRAW or TYPE), `typedSignature`, `ipAddress`, `userAgent`, `signedAt`
- `web/app/sign/[estimateId]/page.jsx` — public signing page with HTML5 canvas (draw) and three cursive font choices (type)
- Estimate flips to ACCEPTED on capture, DECLINED on decline-with-reason
- Activity logged to `customerActivityLog`
- Estimate states handled: signed, declined, expired, success
- PDF includes a textual "Signed by [name] on [date]" line in the ACCEPTANCE section

**Problem:** Two gaps make the experience feel unfinished:
1. The signature image is **not** embedded into a regenerated signed PDF. The `signedPdfS3Key` field exists on `Estimate` but no code populates it. The PDF only shows text acknowledging the signature exists.
2. After capture, the customer success screen states "A copy of the signed estimate will be emailed to you" — but no email is actually sent.

**Solution:** Close both loops in one pass.

#### Scope

**Backend — `api/src/services/pdfService.js`**
- New `generateSignedEstimatePDF(estimate, companySettings, signature)` function — same layout as `generateEstimatePDF` but with the captured signature PNG drawn onto the signature line in the ACCEPTANCE section, plus printed name, date, and IP audit footer
- After `POST /signatures/capture` succeeds, call this function, upload via `uploadPDFToS3` to a `signed/` prefix, store the key on `estimate.signedPdfS3Key`

**Backend — `api/src/services/signedEstimateEmailService.js`** (new)
- Mirrors the `invoiceEmailService.js` pattern
- Sends to: customer email (from signature/estimate) and the estimate's `createdBy` user
- Subject: `Signed Estimate ${estimateNumber} — ${customerName}`
- Body: brief thank-you, link to portal, attached signed PDF (downloaded from S3 inline)
- Logs to `EmailLog` with `estimateId` set
- Triggered from `POST /signatures/capture` after PDF generation completes

**Frontend**
- The success screen already says the PDF will be emailed — keep that copy. Optionally add a "Download signed copy" button that links to the `signedPdfS3Key` URL.
- The customer portal (`/portal/[token]/estimates/:id/pdf`) already prefers `signedPdfS3Key` over `pdfS3Key` — this just needs the field populated for it to work end-to-end.

**Files to create/modify:**
- `api/src/services/pdfService.js` (add `generateSignedEstimatePDF`)
- `api/src/services/signedEstimateEmailService.js` (new)
- `api/src/routes/signatures.js` (call new functions after capture succeeds)
- `web/app/sign/[estimateId]/page.jsx` (optional: "Download signed copy" button on success screen)

**Estimated effort:** 4–6 hours  
**Risk:** Low — additive, doesn't touch the working capture path. PDF generation can fail silently without breaking signing.

---

### 4.2 E-Signature Phase 2 (Future)

Larger DocuSign-territory features. Not required for the current workflow but worth keeping on the list.

#### 4.2.a Audit / Completion Certificate PDF

A separate PDF showing chain of custody — when the estimate was sent, viewed, signed, with IP address, user agent, and (if available) browser geo. All this data is already captured in the `Signature` model and `customerActivityLog`. Nothing renders it as a PDF artifact today.

**Effort:** 3–4 hours

#### 4.2.b Multi-Signer Support

Current schema allows one signature per estimate. For deals where two parties must sign (customer + their manager, or customer + spouse on personal purchases), this would require:

- New `EstimateSigner` model with: `id`, `estimateId`, `signerName`, `signerEmail`, `signerOrder`, `status` (PENDING / SIGNED / DECLINED), `signatureId` (when signed), `notifiedAt`, `signedAt`
- Sequential mode: sign-link only emails to next signer once previous one signs
- Parallel mode: all signers get the link at once
- Estimate only flips to ACCEPTED when all signers have signed

**Effort:** 8–12 hours  
**Risk:** Medium — touches the core capture flow.

#### 4.2.c Polymorphic Signing

Signatures are hard-wired to `Estimate` today. Some workflows want signed acknowledgment of receipt on invoices, signed change orders, signed packing lists. The `Signature` model would become polymorphic via nullable `estimateId` / `invoiceId` / `documentId` fields, similar to how `CustomerActivityLog` and `Comment` are structured.

**Effort:** 6–8 hours

#### 4.2.d Resend / Reminder Emails for Unsigned Estimates

No automated nudge emails when estimates sit in SENT status for N days. The `Reminder` model exists in the schema but isn't wired to estimate signing. Build a daily cron that creates Reminder rows for estimates older than 3 / 7 / 14 days without a signature, and a notification or email when the reminder fires.

**Effort:** 4–6 hours

#### 4.2.e Field-Level Signing

DocuSign lets the sender place specific fields (initials, checkboxes, date, custom text) on the document. The signer fills each one. Probably overkill for SMT's use case — flagging here for completeness only.

**Effort:** 20+ hours, low priority

---

## Implementation Order Recommendation

| # | Feature | Est. Hours | Dependencies |
|---|---------|-----------|-------------|
| 1 | Global Search | 4–6 | None |
| 2 | NexNP Production Cutover | 4–6 | Production NexNP keys |
| 3 | E-Signature Phase 1 Polish | 4–6 | None |
| 4 | Internal Order Notes | 5–7 | None |
| 5 | Order Templates | 6–8 | None |
| 6 | Bulk Board Operations | 6–8 | None |
| 7 | Agent Mobile View | 5–7 | None |
| 8 | Executive Dashboard | 8–12 | None |
| 9 | Cost / Margin Tracking | 4–6 | None |
| 10 | Document Generation | 6–8 | None |
| 11 | Unified Customer Portal | 12–16 | None |
| 12 | E-Signature Phase 2 (audit cert + multi-signer + polymorphic + reminders) | 21–30 | Phase 1 done |

**Total estimated: 90–125 hours**

---

## Notes

- All schema changes use `npx prisma db push` — no migration files needed
- All new authenticated pages require `export const dynamic = 'force-dynamic'`
- All new backend routes registered in `api/src/index.js`
- Production branch is `feature/invoicing-port` — never commit to `main` or `aws-deployment`
- Deployment after any backend change: `pm2 restart order-tracker-backend`
- Deployment after any frontend change: `rm -rf web/.next && cd web && npm run build && pm2 restart order-tracker-frontend`
