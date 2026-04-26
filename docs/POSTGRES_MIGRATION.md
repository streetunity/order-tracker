# SQLite → PostgreSQL Migration Runbook

> ## ✅ MIGRATION COMPLETED — April 26, 2026
>
> The migration described in this runbook was executed successfully. **Production now runs on PostgreSQL 16.13 on the EC2 box.** This document is preserved as historical reference.
>
> **Outcome summary:**
> - All 6,062 rows migrated and row-count verified across 60 models
> - 14 route files patched with `mode: 'insensitive'` for case-insensitive search compatibility
> - Total downtime: ~10 minutes (21:00 UTC to 21:10 UTC)
> - Cutover commit: `6518f6b`
> - Pre-cutover SQLite snapshot preserved at `s3://order-tracker-backups-2025/pre-postgres-cutover/dev.db.pre-postgres-cutover.20260426-210312` and locally at `/var/www/order-tracker/api/prisma/dev.db.pre-postgres-cutover.20260426-210312` (keep for 90 days)
> - All 6 smoke tests passed (login, board, order detail, calendar, invoicing, commissions, customer tracking)
> - Backup chain restored: hourly + daily local `pg_dump`, daily S3 `pg_dump` with 30-day retention
>
> **Lessons learned that differ from the runbook below:**
> - The live SQLite path is `/var/www/order-tracker/api/prisma/dev.db` (Prisma resolves SQLite paths relative to `schema.prisma` location, NOT the process working directory). The runbook's references to `api/dev.db` are wrong — the file at that path was a stale 144 KB artifact from October 2025.
> - The pre-existing backup scripts had been silently backing up that stale file. Watch for this pattern on future installs.
> - Strategy adjustment: Mr B chose to skip the separate `feature/postgres-migration` branch and edited `schema.prisma` directly on `feature/invoicing-port` without committing until cutover ("Option A" approach). Worked fine.
> - Migration script `scripts/migrate-to-postgres/` needed a symlink to the api directory's generated Prisma client because it doesn't have its own `schema.prisma` file. See script README for details.
>
> **Outstanding follow-ups (not blocking):**
> 1. May 26, 2026 (~30 days post-cutover): retire the live SQLite file by renaming `dev.db` to `dev.db.retired-YYYYMMDD`
> 2. The hourly backup runs 11x/day with 30-backup retention — only 2.7 days of history. Consider trimming to fewer hours.
> 3. The notifications cron contains a long-lived JWT in plaintext. Move to env-var auth eventually.
> 4. Pre-existing bug at `api/src/index.js:302` — `app.close is not a function` on shutdown. Should be `server.close()`. Harmless but ugly.

---

**Target:** Same EC2 instance, Postgres 16 installed locally alongside the existing SQLite file. App and DB stay on one box.

**Estimated total time:** ~6 hours including dry runs. Actual maintenance window: ~30 minutes.

**Rollback:** SQLite remains intact and untouched throughout. Reverting is a one-line `.env` change + restart.

**Branch strategy:** All work happens on a new branch `feature/postgres-migration` so `feature/invoicing-port` stays clean.

---

## TL;DR Phase Overview

| Phase | What happens | Risk to live app | Time |
|-------|--------------|------------------|------|
| 1 | Install Postgres on EC2, create DB and user | None | 30m |
| 2 | Create branch, change Prisma provider, push schema to Postgres | None — staging only | 30m |
| 3 | Write + dry-run migration script against a *copy* of the live SQLite DB | None | 2h |
| 4 | Audit code for SQLite-isms (case-sensitive `contains:`, raw SQL, etc.) | None | 1h |
| 5 | **Maintenance window** — stop app, snapshot SQLite, run migration, swap `.env`, restart, smoke test | App down ~30m | 30m |
| 6 | Update backup tooling, monitor for a week, eventually retire SQLite file | None | 30m |

---

## Phase 1 — Install PostgreSQL on the EC2 Box

PuTTY into the server. All commands assume Ubuntu 24 (matches current setup).

```bash
# Update apt and install Postgres 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# Verify it's running
sudo systemctl status postgresql

# Confirm version
psql --version
```

Expected output: `psql (PostgreSQL) 16.x`

```bash
# Set Postgres to start on boot (should already be enabled, but confirm)
sudo systemctl enable postgresql
```

### Create the database, user, and password

```bash
# Switch to the postgres system user and open psql
sudo -u postgres psql
```

Inside the `psql` prompt, run these one at a time. **Replace `CHANGE_ME_STRONG_PASSWORD` with a real password** — I recommend 24+ random characters, URL-safe (no `/`, `=`, or other URL-special chars). You'll save this in `.env` later. **Generate with:** `openssl rand -hex 32`

```sql
CREATE DATABASE smt_orders;
CREATE USER smt_app WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE smt_orders TO smt_app;
\c smt_orders
GRANT ALL ON SCHEMA public TO smt_app;
ALTER DATABASE smt_orders OWNER TO smt_app;
\q
```

### Test the connection works

```bash
# Should connect and prompt for password
psql -h localhost -U smt_app -d smt_orders
# Type the password, then \q to exit
```

If the connection asks for a password and accepts it, Postgres is ready.

### Lock down access (Postgres listens on localhost only by default — verify)

```bash
# Confirm Postgres is bound to localhost, not 0.0.0.0
sudo grep listen_addresses /etc/postgresql/16/main/postgresql.conf
```

Expected: `listen_addresses = 'localhost'` (commented out is also fine — default is localhost).

If it shows anything else, edit the file:

```bash
sudo nano /etc/postgresql/16/main/postgresql.conf
# Find the listen_addresses line, set it to:
#   listen_addresses = 'localhost'
# Save and exit (Ctrl+O, Enter, Ctrl+X)
sudo systemctl restart postgresql
```

---

## Phase 2 — Create Migration Branch and Push Schema to Postgres

All the following happens on the EC2 box but never modifies the running production app. Postgres is a fresh empty DB at this point.

```bash
cd /var/www/order-tracker

# Create the migration branch off the current production branch
git fetch origin
git checkout feature/invoicing-port
git pull origin feature/invoicing-port
git checkout -b feature/postgres-migration
```

### Update `schema.prisma` to use Postgres

Edit `api/prisma/schema.prisma`:

```bash
nano api/prisma/schema.prisma
```

Change the top of the file from:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

To:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Save and exit. **Do NOT commit and push yet** — the live app on `feature/invoicing-port` is still pointing at `DATABASE_URL` in `.env` which still points at SQLite. Branch isolation protects us.

### Push the schema to the empty Postgres DB

```bash
cd /var/www/order-tracker/api

# Inline DATABASE_URL keeps the live .env untouched
DATABASE_URL="postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public" npx prisma db push --skip-generate
```

**Critical:** `--skip-generate` prevents the Prisma client from being regenerated, so the live app keeps using its existing SQLite-targeted client.

Expected output: a list of tables being created, then `🚀  Your database is now in sync with your Prisma schema.`

### Verify the schema landed

```bash
psql -h localhost -U smt_app -d smt_orders -c "\dt"
```

You should see all the model tables. Total table count = number of `model` declarations in `schema.prisma` (was 57 in April 2026: 51 PascalCase + 6 `@@map`-renamed).

---

## Phase 3 — Migration Script and Dry Run

The migration script (`scripts/migrate-to-postgres/migrate.js`) is committed alongside this runbook. It:

- Reads from SQLite via `better-sqlite3` (no Prisma client on source side)
- Writes to Postgres via Prisma client
- Walks all models in foreign-key dependency order
- For each model: pages through SQLite in batches of 500, writes to Postgres
- Verifies row counts after each table
- Logs progress and any errors to stdout
- Is **read-only against SQLite** — the source DB cannot be corrupted

### Generate Prisma client for Postgres in the api directory

The migration script needs a Postgres-targeted Prisma client. Generate it in `api/`:

```bash
cd /var/www/order-tracker/api
DATABASE_URL="postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public" npx prisma generate
```

**This does NOT affect the running app** — PM2 has the old client loaded in memory and won't re-read until restarted.

### Symlink the generated client into the migration script

The migration script directory has its own `node_modules` from `npm install`, but its Prisma client was never generated (no `schema.prisma` there). Symlink to the api's generated client:

```bash
cd /var/www/order-tracker/scripts/migrate-to-postgres
npm install
rm -rf node_modules/.prisma node_modules/@prisma/client
ln -s /var/www/order-tracker/api/node_modules/.prisma node_modules/.prisma
ln -s /var/www/order-tracker/api/node_modules/@prisma/client node_modules/@prisma/client
```

### Make a working copy of the live SQLite DB for dry runs

Never run the migration script against the live SQLite file. **The live DB is at `/var/www/order-tracker/api/prisma/dev.db`** (NOT `api/dev.db`).

```bash
cp /var/www/order-tracker/api/prisma/dev.db /tmp/dev-dryrun-$(date +%Y%m%d-%H%M%S).db
ls -lh /tmp/dev-dryrun-*.db
```

### Run the migration script in dry-run mode

```bash
cd /var/www/order-tracker/scripts/migrate-to-postgres
node migrate.js \
  --source="file:/tmp/dev-dryrun-YYYYMMDD-HHMMSS.db" \
  --target="postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public"
```

Watch for `Verification: all tables match. Total rows: N`.

If the script throws an error:

```bash
# Reset Postgres for another dry run
cd /var/www/order-tracker/api
DATABASE_URL="postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public" \
  npx prisma db push --force-reset --skip-generate
```

### Smoke test the Postgres-backed app on a different port

```bash
cd /var/www/order-tracker/api
DATABASE_URL="postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public" \
  PORT=4001 \
  node src/index.js &
# Watch logs for "Server running on port 4001" with no errors, then:
kill %1
```

---

## Phase 4 — Code Audit for SQLite-isms

Production Prisma queries that use `contains:`, `startsWith:`, `endsWith:` behave **case-insensitively on SQLite and case-sensitively on Postgres**. Each one will silently change behavior unless you add `mode: 'insensitive'`.

### Find every offending call site

```bash
cd /var/www/order-tracker/api
grep -rn "contains:" src/ --include="*.js" | grep -v node_modules
grep -rn "startsWith:\|endsWith:" src/ --include="*.js" | grep -v node_modules
```

### Apply scripted fix

For `contains:` patterns, this `sed` command adds `mode: 'insensitive'` inside each clause:

```bash
cd /var/www/order-tracker/api
FILES=(
  "src/index.js"
  "src/routes/customers.js"
  "src/routes/orders.js"
  "src/routes/comments.js"
  "src/routes/estimateTemplates.js"
  "src/routes/estimates.js"
  "src/routes/users.js"
  "src/routes/leads.js"
  "src/routes/calendar.js"
  "src/routes/products.js"
  "src/routes/bundles.js"
  "src/routes/auditSearch.js"
  "src/routes/invoices.js"
  "src/routes/shipments.js"
)
for f in "${FILES[@]}"; do
  sed -i -E "s/(\{[[:space:]]*contains:[[:space:]]*[^}]+)([[:space:]]*\})/\1, mode: 'insensitive'\2/g" "$f"
  echo "Updated: $f"
done
```

**Skip these files:**
- `auditBackfill.js` — contains a literal `'salesPerson'` JSON-key search that should stay case-sensitive
- `numberGenerators.js` — `startsWith: 'INV'`, etc. for invoice number generation, deterministic prefixes
- `orders.js` line ~104 — `startsWith: 'stage_threshold_'` for SystemSetting keys
- `estimates.js` lines ~942, ~995 — versioned estimate number lookups (e.g. `EST-2026-0042-v2`)

For `comments.js` `startsWith: username` (the @mention email lookup), apply manually or with a targeted sed.

### Find raw SQL

```bash
grep -rn '\$queryRaw\|\$executeRaw' src/ --include="*.js" | grep -v node_modules
```

If any results exist, validate each. Common gotchas: `IFNULL` → `COALESCE`, `strftime('%Y',dt)` → `to_char(dt,'YYYY')`, boolean comparisons.

---

## Phase 5 — Production Cutover (Maintenance Window)

**Announce 30–60 minutes of downtime.** Pick a low-traffic time.

### 5.1 — Stop the app

```bash
cd /var/www/order-tracker
pm2 stop all
pm2 status   # both should show "stopped"
```

### 5.2 — Take a labeled snapshot of the live SQLite DB

```bash
TS=$(date +%Y%m%d-%H%M%S)
cp /var/www/order-tracker/api/prisma/dev.db /var/www/order-tracker/api/prisma/dev.db.pre-postgres-cutover.$TS
ls -lh /var/www/order-tracker/api/prisma/dev.db*

# Off-box safety
aws s3 cp /var/www/order-tracker/api/prisma/dev.db.pre-postgres-cutover.$TS \
  s3://order-tracker-backups-2025/pre-postgres-cutover/
```

**Keep this file for at least 90 days. It is your rollback insurance.**

### 5.3 — Reset Postgres and run the real migration

```bash
cd /var/www/order-tracker/api
DATABASE_URL="postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public" \
  npx prisma db push --force-reset --skip-generate

cd /var/www/order-tracker/scripts/migrate-to-postgres
node migrate.js \
  --source="file:/var/www/order-tracker/api/prisma/dev.db" \
  --target="postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public"
```

Wait for `Verification: all tables match. Total rows: N`.

### 5.4 — Swap `.env` to point at Postgres

```bash
cd /var/www/order-tracker/api
cp .env .env.pre-postgres-cutover.$TS
nano .env
```

Replace `DATABASE_URL=file:./dev.db` with `DATABASE_URL=postgresql://smt_app:YOUR_PASSWORD@localhost:5432/smt_orders?schema=public`. Save and exit.

### 5.5 — Rebuild frontend

```bash
cd /var/www/order-tracker/web
rm -rf .next
npm run build
```

### 5.6 — Restart and verify

```bash
cd /var/www/order-tracker
pm2 restart all --update-env
pm2 status
pm2 logs order-tracker-backend --lines 40 --nostream
```

Look for `API server running` and **no** `PrismaClientInitializationError` or `connect ECONNREFUSED`.

### 5.7 — Smoke test

- [ ] Login as known admin
- [ ] Board page loads with all orders
- [ ] Click into one order, view tabs
- [ ] Calendar page loads
- [ ] Invoicing page loads
- [ ] Commissions page loads
- [ ] Customer tracking link `/t/[token]` loads

### 5.8 — Commit the migration

```bash
cd /var/www/order-tracker
git add api/prisma/schema.prisma api/src/
git commit -m "feat: migrate from SQLite to PostgreSQL"
git push origin feature/invoicing-port
```

### 5.9 — Rollback (only if smoke tests fail)

```bash
cp /var/www/order-tracker/api/.env.pre-postgres-cutover.$TS /var/www/order-tracker/api/.env
cd /var/www/order-tracker
git checkout api/prisma/schema.prisma api/src/
cd api && npx prisma generate
cd ../web && rm -rf .next && npm run build
cd /var/www/order-tracker && pm2 restart all --update-env
```

Total rollback time: ~5 minutes. Zero data loss because the app was stopped during cutover.

---

## Phase 6 — Post-Cutover Cleanup

### 6.1 — Set up `~/.pgpass` for password-less auth

```bash
echo "localhost:5432:smt_orders:smt_app:YOUR_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
```

### 6.2 — Update backup scripts to use `pg_dump`

Replace existing SQLite-based backup scripts with `pg_dump -Fc` versions. The two scripts to replace:

- `/var/www/order-tracker/backup-database.sh` — hourly + daily local backup
- `/usr/local/bin/backup-order-tracker.sh` — daily S3 upload

See the live versions on the server for the current Postgres-aware implementations.

**Watch out:** These two scripts existed pre-cutover but were silently backing up the WRONG file (`api/dev.db`, the 144 KB stale file) for an unknown duration. Always verify backup file size after replacing.

### 6.3 — Test the backup scripts manually

```bash
/var/www/order-tracker/backup-database.sh
/usr/local/bin/backup-order-tracker.sh
ls -lh /var/www/order-tracker/api/backups/*.dump | tail -3
aws s3 ls s3://order-tracker-backups-2025/daily/ | tail -3
```

Real backups should be ~500 KB compressed for ~5 MB of data.

### 6.4 — Retire the SQLite file (after ~30 days of stable operation)

```bash
cd /var/www/order-tracker/api/prisma
mv dev.db dev.db.retired-$(date +%Y%m%d)
```

Do NOT delete `dev.db.pre-postgres-cutover.*` from local disk for at least 90 days.

---

## Risk Summary (Quick Reference)

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|-----------|
| Case-sensitive search breaks user UX | High | Medium | Phase 4 audit + add `mode: 'insensitive'` |
| Boolean / DateTime coercion errors during migration | Medium | Medium | Migration script handles types explicitly; dry runs catch the rest |
| Foreign key insertion order wrong | Low | Low | Script enforces dependency order; throws if FK fails |
| Postgres connection limit exhaustion | Low | Medium | Single Node process, default pool of 10 is plenty |
| Concurrent-write race conditions newly visible | Low | Low | Brief audit of `findFirst` → `update` patterns; most paths use Prisma transactions already |
| Data loss during cutover | Very low | Critical | App stopped during cutover; SQLite untouched; pre-cutover snapshot in two places |
| Password hash incompatibility | None | N/A | bcrypt hashes are opaque text; no DB-side processing involved |
| NexNP / S3 / SES credentials affected | None | N/A | All in `.env`, untouched by DB swap |
| Wrong DB path used in scripts | High | High | The live SQLite path is `api/prisma/dev.db`, not `api/dev.db` — see Phase 3 |

---

## What Stays the Same

- All Prisma client API calls (`findMany`, `create`, etc.)
- All `cuid()` IDs (generated client-side)
- All bcrypt password hashes
- All JWT tokens issued before cutover (signed with the same secret in `.env`)
- All S3 keys and document URLs
- All NexNP transaction IDs and references
- All file paths and PM2 service names
- The deploy workflow (`git pull` → `pm2 restart`)
- Schema models and relationships

## What Changed

- `schema.prisma` provider: `"sqlite"` → `"postgresql"`
- `.env` `DATABASE_URL`: `file:./dev.db` → `postgresql://...`
- Backup tooling: `cp dev.db` → `pg_dump -Fc`
- Search filters: explicitly `mode: 'insensitive'` in 14 route files
