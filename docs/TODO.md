# Order Tracker — Outstanding Work

**Last updated:** April 26, 2026  
**Branch:** `feature/invoicing-port`

Consolidated punch list of everything still to do. Cross-referenced against the `feature/invoicing-port` branch as of this date. See `docs/ROADMAP.md` for full specifications and `docs/future-considerations.md` for back-burnered items.

---

## ✅ Recently Completed

### SQLite → PostgreSQL Migration (April 26, 2026)

Production database migrated from SQLite to PostgreSQL 16.13 on the same EC2 instance. All 6,062 rows migrated and verified across 60 models. ~10 minutes of downtime. Cutover commit: `6518f6b`. Pre-cutover snapshot preserved at `s3://order-tracker-backups-2025/pre-postgres-cutover/dev.db.pre-postgres-cutover.20260426-210312` (keep until ~July 2026). Backup chain restored with `pg_dump -Fc`. See `docs/POSTGRES_MIGRATION.md` for the full runbook and lessons learned.

**Outstanding follow-ups from the migration:**
- May 26, 2026: retire the live SQLite file at `/var/www/order-tracker/api/prisma/dev.db` by renaming to `dev.db.retired-YYYYMMDD`
- The hourly local backup runs 11x/day with 30-backup retention (only 2.7 days of history). Consider trimming to 4 hours.
- Pre-existing bug at `api/src/index.js:302` (`app.close is not a function` on shutdown). Should be `server.close()`. Harmless but ugly.

---

## 🔴 Not Started

### Global Search (Roadmap 1.1)
No `search.js` route, no `GlobalSearch.jsx` component, no `Cmd+K` modal. Highest-leverage build remaining — read-only, ~4–6 hrs, no schema changes. Recommended next pickup.

### Internal Order Notes (Roadmap 2.1)
The existing `comments.js` route only attaches to `Estimate` and `Invoice` (via the `Comment` schema model — no `orderId` relation). `Order.internalNotes` is a single text blob, not a thread. Needs a new `OrderNote` model + routes + Notes tab on the order detail page.

### Order / Item Templates (Roadmap 2.2)
No `OrderTemplate` / `OrderTemplateItem` models in `schema.prisma`. `EstimateTemplate` exists but is invoicing-only. `Bundle` is product-bundling for invoicing, not order templates.

### Bulk Board Operations (Roadmap 2.3)
Confirmed by reading `api/src/routes/items.js` — no `POST /api/items/bulk-stage` or `POST /api/items/bulk-archive` endpoint. Every stage move is single-item only.

### Agent Mobile View (Roadmap 2.4)
No `/agent` route under `web/app/`. The board page remains the only entry point.

---

## 🟡 Partially Done

### Executive Dashboard (Roadmap 3.1)
`/admin/page.jsx` exists with Quick Links + the `CommissionDashboardWidget`. `dashboard.css` is in place.
**Missing:** revenue-this-month widget, items-by-stage chart, overdue items, top agents YTD, leads-this-week, conversion funnel.

### Unified Customer Portal (Roadmap 3.2)
`api/src/routes/customerPortal.js` is built and serves estimates / invoices / payments via `Customer.portalToken`.
**Missing:** does not include orders or tracking — those are still on the separate `/t/[token]` flow. No magic-link login. The unification (one login → orders + invoices + files) is the actual work that's left.

### Cost / Margin Tracking (Roadmap 3.3)
Invoicing side is done — `Estimate`, `Invoice`, `Product`, `Bundle` all have `cost` / `unitCost` / `totalCost` / `marginAmount` / `marginPercent`.
**Missing:** `OrderItem` has `itemPrice` but no `costPrice`. No margin-by-product / margin-by-agent / margin-by-month reports. The original roadmap intent was the orders side, so this is mostly not done.

### Document Generation (Roadmap 3.4)
Estimate PDFs (`estimatePdf.js`) and Invoice PDFs (`invoicePdf.js`) are done. There's also a `/admin/generic-manifest` page worth checking.
**Missing:** Packing List generator on order detail, Certificate of Conformity generator.

### E-Signature — Phase 1 Polish (Roadmap 4.1)
Core signing works — `signatures.js` route, `Signature` model, `/sign/[estimateId]` page with Draw + Type modes. IP, user agent, timestamp captured. Estimate flips to ACCEPTED.
**Missing:** signature image not embedded into a regenerated signed PDF (the `signedPdfS3Key` field exists but no code populates it). No confirmation email back to customer with the signed PDF — even though the success screen promises one. See Roadmap 4.1 for full scope.

### Zapier / Lead Auto-Population (future-considerations.md)
Surprise — `zapierWebhook.js` and the `ZapierWebhook` model are already in the codebase. Infrastructure exists.
**Missing:** Zapier account details from client, GHL field mapping confirmation, end-to-end test with a real GHL form submission. Status: back-burnered awaiting client info.

---

## ⚙️ Operational / Infra

### NexNP Production Cutover
Integration is built (`payments.js`, `nextnpWebhook.js`, `nextnpService.js`, `/pay/[token]` flow, refund support, schedule-item handling).
**Missing:** end-to-end payment testing in production environment + switching from sandbox to production NexNP keys.

### AWS SES Production Access
Still in sandbox mode. Support case has the reply requesting re-evaluation under the renamed account ("SMT Order Tracker" / "Stealth Machine Tools"). Broker emails currently limited to manually verified addresses until production access is granted.

### S3 Versioning on `stealth-customer-files`
Not enabled. One-click in AWS console (Properties → Bucket Versioning → Enable). Cheap insurance against accidental deletes / overwrites. Distinct from the nightly database backup (`order-tracker-backups-2025`) which is already running.

### Notifications cron contains long-lived JWT in plaintext
The `* * * * * curl -X POST .../notifications/generate-operational` cron entry has a hardcoded Bearer token that expires October 2026. Should move to env-var-driven auth or a proper service account flow eventually.

---

## ⚠️ Roadmap Out-of-Date

### ~~Stripe Payments (Roadmap 1.2)~~ — Obsolete
NexNP was chosen instead and is mostly built. Vestigial Stripe fields remain on the `Payment` model (`stripePaymentIntentId`, `stripeChargeId`) but are unused. `api/src/services/stripeService.js` exists but is dead code. Remaining real work is captured under "NexNP Production Cutover" above.

---

## E-Signature — Phase 2 (Future)

These are real DocuSign-territory items beyond the Phase 1 polish. See Roadmap 4.2 for full scope. Captured here so they don't get lost:

- **Audit / completion certificate** — a separate PDF showing chain of custody (sent → viewed → signed, IP, user agent). Data already captured in `Signature` and `customerActivityLog`, just nothing renders it as a PDF artifact.
- **Multi-signer support** — sequential or parallel signers (e.g., customer + their manager). Needs an `EstimateSigner` join model.
- **Polymorphic signing** — extend signatures to invoices, change orders, packing lists, etc. Currently hard-wired to `Estimate`.
- **Resend / reminder emails** — automated nudges for unsigned estimates after N days. The `Reminder` model exists but isn't wired to estimate signing.
- **Field-level signing** — initials, checkboxes, date fields placed on the doc. Probably overkill for SMT's use case but worth flagging.

---

## Recommended Next Pickup Order

Maximum visible impact for time spent:

1. **Global Search** (4–6 hrs) — biggest daily-friction win, low risk
2. **NexNP production cutover** — closes the invoicing payment loop
3. **AWS SES production access** — keep nagging the support case
4. **E-Signature Phase 1 Polish** (4–6 hrs) — closes the loop the success screen already promises
5. **Internal Order Notes** (5–7 hrs) — modest schema add, big collaboration win
6. **Bulk Board Operations** (6–8 hrs) — biggest single time-saver for daily ops once containers arrive

Then pick from the remaining roadmap items based on what hurts most.
