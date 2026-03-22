# Future Considerations

Items to revisit when time permits.

---

## Zapier / Lead Auto-Population

**Status: Back-burnered — awaiting Zapier account details from client**

The lead flow is: Facebook/Google Ads → Go High Level CRM → Zapier → Order Tracker.

When a lead comes in or a deal is won in Go High Level, Zapier should automatically create a Lead record in the invoicing module — eliminating manual data entry entirely.

**What needs to happen:**
1. Confirm the Zapier account and which GHL triggers to use (new contact, deal stage change, form submission, etc.)
2. Build a public webhook endpoint: `POST /api/webhooks/zapier/lead` — validates a shared secret, maps GHL field names to our Lead schema, creates/updates the record
3. Map GHL custom fields to: `firstName`, `lastName`, `email`, `phone`, `company`, `source`, `notes`, `assignedTo`
4. Add webhook secret to `.env`: `ZAPIER_WEBHOOK_SECRET`
5. Register the webhook URL in Zapier as the action target
6. Test end-to-end with a real GHL form submission

**Estimated effort:** 2–4 hours once Zapier credentials and GHL field mapping are confirmed.

---

## S3 Bucket Backup / Versioning

**Bucket:** `stealth-customer-files`

AWS S3 does not automatically back up data. If a file is deleted it is gone. Options to address this:

- **S3 Versioning (recommended)** — Enable on the bucket via Properties → Bucket Versioning → Enable. Keeps every version of every file, allowing recovery from accidental deletes or overwrites. Minor storage cost increase.
- **S3 Cross-Region Replication** — Automatically replicates everything to a second bucket in a different region for disaster recovery. More complex, doubles storage cost.
- **S3 Lifecycle Rules** — Automatically moves older files to cheaper storage tiers (e.g. Glacier) after a set number of days.

Note: `order-tracker-backups-2025` already handles nightly database backups. This item covers S3 file protection only.

---

## SQLite → PostgreSQL Migration

The system currently runs SQLite which is adequate for current scale but has known limitations (single writer lock, no concurrent writes across processes). Migration to PostgreSQL is planned for when scale demands it.

**What Prisma makes easy:**
- One line change in `schema.prisma` — provider from `"sqlite"` to `"postgresql"`
- Route files barely change since Prisma abstracts the SQL differences

**The actual work:**

1. **Schema adjustments** — Audit `BigInt` fields and JSON-stored-as-String fields (e.g. `containers`, `metadata`, `flagDetails`). These could optionally become native `Json` type in PostgreSQL, enabling querying inside them.
2. **Set up PostgreSQL** — AWS RDS is recommended over installing directly on EC2. RDS handles backups, patching, and failover automatically. Estimated ~$15–30/mo for a small instance.
3. **Data migration** — Export from SQLite, run `npx prisma db push` against the new DB to create the schema, then run a migration script to transfer all records. CUIDs used for IDs make this simpler (no auto-increment sequences to worry about).
4. **Update `DATABASE_URL`** in `.env` from the SQLite file path to a PostgreSQL connection string.
5. **Test everything** — commissions, invoicing, broker portal, role-based filtering, stage progressions.

**Estimated effort:** 1–2 days done carefully. Actual downtime can be kept under 1 hour if the new database is fully prepped in advance and the cutover is just a final data sync + DNS/env switch.

---
