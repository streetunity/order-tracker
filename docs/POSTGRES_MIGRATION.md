# SQLite → PostgreSQL Migration Runbook

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

Inside the `psql` prompt, run these one at a time. **Replace `CHANGE_ME_STRONG_PASSWORD` with a real password** — I recommend 24+ random characters. You'll save this in `.env` later.

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

### Set up a temporary Postgres-pointing env for testing

Create a separate env file you'll use only for the migration tooling so the live `.env` is never touched until cutover:

```bash
cp api/.env api/.env.postgres
nano api/.env.postgres
```

Replace the `DATABASE_URL` line with:

```
DATABASE_URL="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public"
```

Use the password you set in Phase 1. Save and exit.

### Push the schema to the empty Postgres DB

```bash
cd /var/www/order-tracker/api

# Use the postgres env file just for this command
DOTENV_CONFIG_PATH=.env.postgres npx dotenv -e .env.postgres -- npx prisma db push
```

If the `dotenv` CLI isn't installed, the simpler approach is to temporarily export the var inline:

```bash
DATABASE_URL="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public" npx prisma db push
```

Expected output: a list of all 74 models being created, then `Your database is now in sync with your Prisma schema.`

### Verify the schema landed

```bash
psql -h localhost -U smt_app -d smt_orders -c "\dt"
```

You should see all the model tables (`Account`, `Order`, `OrderItem`, etc., plus `order_documents`, `customer_documents`, etc. for the `@@map`-renamed ones).

```bash
# Generate the Prisma client against Postgres just for the migration script's use
DATABASE_URL="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public" npx prisma generate
```

---

## Phase 3 — Migration Script and Dry Run

The migration script (`scripts/migrate-to-postgres/migrate.js`) is committed alongside this runbook. It:

- Opens a SQLite Prisma client and a Postgres Prisma client side by side
- Walks the 74 models in foreign-key dependency order
- For each model: pages through SQLite in batches of 500, writes to Postgres
- Verifies row counts after each table
- Logs progress and any errors to stdout
- Is **read-only against SQLite** — the source DB cannot be corrupted
- Truncates the Postgres tables before each run so re-runs are idempotent

### Make a working copy of the live SQLite DB for dry runs

Never run the migration script against the live SQLite file. Always work from a copy.

```bash
cd /var/www/order-tracker

# Make sure no one is mid-write
date

# Copy the live SQLite DB to a dry-run location
cp api/dev.db /tmp/dev-dryrun-$(date +%Y%m%d-%H%M%S).db
ls -lh /tmp/dev-dryrun-*.db

# Symlink it as the dry-run source the script expects
ln -sf /tmp/dev-dryrun-*.db /tmp/dryrun.db
```

### Run the migration script in dry-run mode

```bash
cd /var/www/order-tracker/scripts/migrate-to-postgres

# Install deps if not already (sqlite3 is needed for the script)
npm install

# Run the dry run — reads from /tmp/dryrun.db, writes to Postgres
node migrate.js \
  --source="file:/tmp/dryrun.db" \
  --target="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public"
```

Watch the output. The script logs `Migrated X rows for Model` for each of the 74 models, then a final `Verification: all tables match. Total rows: N`.

**If the script throws an error**, read the error, fix the script or the data, truncate Postgres, and re-run:

```bash
# Reset Postgres for another dry run
DATABASE_URL="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public" \
  npx prisma db push --force-reset --skip-generate
```

### Smoke test the Postgres-backed app (still on the dry run data)

We want to confirm the *application* works against Postgres before doing the real cutover. Spin up a parallel Node process pointing at Postgres, on a different port, while the production app keeps running on its own port.

```bash
# Run the backend pointed at Postgres on port 4001 (production stays on 4000)
cd /var/www/order-tracker/api

DATABASE_URL="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public" \
  PORT=4001 \
  node src/index.js &

# Tail it for a few seconds, look for "Server running on port 4001" and no errors
# Then kill it
kill %1
```

If the backend starts cleanly against Postgres, you have working app + working data on Postgres. The dry run is successful.

For a more thorough check, you can hit a few endpoints:

```bash
# In another terminal session while the test backend is running:
curl http://localhost:4001/api/health
curl http://localhost:4001/api/orders -H "Authorization: Bearer YOUR_TEST_TOKEN"
```

---

## Phase 4 — Code Audit for SQLite-isms

This is the part most people skip and regret. The Prisma queries that use `contains:`, `startsWith:`, `endsWith:` behave **case-insensitively on SQLite and case-sensitively on Postgres**. Every one of those will silently change behavior unless you add `mode: 'insensitive'`.

### Find every offending call site

```bash
cd /var/www/order-tracker/api

# These greps surface every place that needs review
grep -rn "contains:" src/ --include="*.js" | grep -v node_modules
grep -rn "startsWith:" src/ --include="*.js" | grep -v node_modules
grep -rn "endsWith:" src/ --include="*.js" | grep -v node_modules
```

For each result, decide: should this be case-insensitive (almost always yes for user-facing search) or case-sensitive (rarely — typically only for tokens, IDs, and emails-as-keys)?

For case-insensitive, change:

```js
where: { name: { contains: query } }
```

To:

```js
where: { name: { contains: query, mode: 'insensitive' } }
```

### Find raw SQL

```bash
grep -rn '\$queryRaw\|\$executeRaw' src/ --include="*.js" | grep -v node_modules
```

If any results exist, validate each. Common gotchas:

- `IFNULL` (SQLite) → `COALESCE` (Postgres)
- `strftime('%Y', dt)` (SQLite) → `to_char(dt, 'YYYY')` (Postgres)
- String concatenation `||` works in both, but `+` is Postgres-only for numerics
- Boolean comparisons: SQLite uses `0`/`1`, Postgres uses `true`/`false`

### Find places that pass empty strings to required fields

Less critical, but Postgres is stricter than SQLite. If your code does `firstName: req.body.firstName || ""` and `firstName` is required, that worked on SQLite and will work on Postgres too — but if the column is non-null and your code passes `null`, SQLite tolerated it where Postgres won't. Watch for it during dry-run errors.

### Commit the audit fixes

After making changes:

```bash
cd /var/www/order-tracker
git add -A
git commit -m "chore: case-insensitive search filters for postgres compatibility"
# Don't push yet — stays on local branch until cutover
```

---

## Phase 5 — Production Cutover (Maintenance Window)

**Announce 30–60 minutes of downtime.** Pick a low-traffic time. Send a heads-up to anyone who might be using the system.

### 5.1 — Stop the app

```bash
cd /var/www/order-tracker

# Stop both processes
pm2 stop all

# Verify both are stopped
pm2 status
```

Both `order-tracker-backend` and `order-tracker-frontend` should be in `stopped` state.

### 5.2 — Take a labeled snapshot of the live SQLite DB

```bash
TS=$(date +%Y%m%d-%H%M%S)
cp api/dev.db api/dev.db.pre-postgres-cutover.$TS
ls -lh api/dev.db*

# Also push it to S3 for off-box safety
aws s3 cp api/dev.db.pre-postgres-cutover.$TS \
  s3://order-tracker-backups-2025/pre-postgres-cutover/
```

**This file is your rollback insurance. Keep it for at least 90 days.**

### 5.3 — Truncate Postgres (any leftover dry-run data) and run the real migration

```bash
cd /var/www/order-tracker/api

# Reset Postgres to a clean schema
DATABASE_URL="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public" \
  npx prisma db push --force-reset --skip-generate

# Run the migration against the live, just-stopped SQLite DB
cd /var/www/order-tracker/scripts/migrate-to-postgres
node migrate.js \
  --source="file:/var/www/order-tracker/api/dev.db" \
  --target="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public"
```

Watch for the final `Verification: all tables match. Total rows: N` line.

### 5.4 — Swap `.env` to point at Postgres

```bash
cd /var/www/order-tracker/api

# Back up the current .env first
cp .env .env.pre-postgres-cutover.$TS

# Edit .env
nano .env
```

Find the `DATABASE_URL=` line. Comment it out and add the new one:

```
# DATABASE_URL="file:./dev.db"
DATABASE_URL="postgresql://smt_app:CHANGE_ME_STRONG_PASSWORD@localhost:5432/smt_orders?schema=public"
```

Save and exit.

### 5.5 — Switch the codebase to the migration branch and rebuild

This is where the schema-provider change goes live:

```bash
cd /var/www/order-tracker

# Push the migration branch to GitHub first so it's recoverable
git push origin feature/postgres-migration

# Switch to it
git checkout feature/postgres-migration

# Regenerate Prisma client against Postgres
cd api
npx prisma generate

# Rebuild the frontend (clears the old prerender cache)
cd ../web
rm -rf .next
npm run build
```

### 5.6 — Restart and verify

```bash
cd /var/www/order-tracker
pm2 restart all --update-env
pm2 status
pm2 logs --lines 50
```

Look for:
- Both processes in `online` status
- No `PrismaClientInitializationError`
- No `connect ECONNREFUSED` errors
- The expected `Server running on port 4000` line

### 5.7 — Smoke test

In a browser, log into `https://smt-orders.com` as a known admin and run through these checks:

- [ ] Login works (validates User table + password hash compatibility)
- [ ] Board page loads and shows orders (validates the big polymorphic queries)
- [ ] Click into one order, view items, view documents
- [ ] Calendar page loads with events
- [ ] Invoices page loads, click into one
- [ ] Estimates page loads
- [ ] Commission dashboard widget on /admin loads
- [ ] Try the existing customer-facing tracking link `/t/[token]` for a known order
- [ ] Notifications dropdown opens

If all eight pass, the cutover is successful.

### 5.8 — If anything is broken: ROLLBACK

The rollback is fast because we never touched the SQLite file:

```bash
cd /var/www/order-tracker/api

# Restore the previous .env
cp .env.pre-postgres-cutover.$TS .env

# Switch back to the production branch
cd /var/www/order-tracker
git checkout feature/invoicing-port

# Regenerate Prisma client against SQLite
cd api
npx prisma generate

# Rebuild frontend
cd ../web
rm -rf .next
npm run build

# Restart
cd /var/www/order-tracker
pm2 restart all --update-env
pm2 status
```

Total rollback time: ~5 minutes. Zero data loss because the app was stopped during the entire cutover — no Postgres writes happened that aren't in SQLite.

Then investigate the failure mode in staging without time pressure.

---

## Phase 6 — Post-Cutover Cleanup

### 6.1 — Update the daily backup tooling

The existing nightly backup probably copies `api/dev.db` to S3. That's now stale data. Replace with `pg_dump`:

```bash
# Check what's currently in cron
crontab -l
sudo crontab -u root -l   # in case it's a root cron
```

Find the SQLite backup line. Replace with something like:

```cron
0 2 * * * pg_dump -h localhost -U smt_app -d smt_orders -Fc -f /tmp/smt_orders_$(date +\%Y\%m\%d).dump && aws s3 cp /tmp/smt_orders_$(date +\%Y\%m\%d).dump s3://order-tracker-backups-2025/postgres/ && rm /tmp/smt_orders_$(date +\%Y\%m\%d).dump
```

For the cron user to authenticate without prompting, create a `~/.pgpass` file:

```bash
echo "localhost:5432:smt_orders:smt_app:CHANGE_ME_STRONG_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
```

Test the backup command manually before trusting cron:

```bash
pg_dump -h localhost -U smt_app -d smt_orders -Fc -f /tmp/test.dump
ls -lh /tmp/test.dump
rm /tmp/test.dump
```

### 6.2 — Merge the migration branch into the active branch

Once you've run on Postgres for ~3 days without issues, fold the migration branch back:

```bash
cd /var/www/order-tracker
git checkout feature/invoicing-port
git merge feature/postgres-migration
git push origin feature/invoicing-port

# Optionally delete the migration branch from GitHub via the website,
# or:
git push origin --delete feature/postgres-migration
```

### 6.3 — Retire the SQLite file (after a comfortable wait)

After ~30 days of stable Postgres operation:

```bash
cd /var/www/order-tracker/api

# Move the live SQLite file out of the way (don't delete — just rename)
mv dev.db dev.db.retired-$(date +%Y%m%d)

# The pre-cutover snapshot in S3 stays as the historical record.
```

Do NOT delete `api/dev.db.pre-postgres-cutover.*` from local disk for 90 days.

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
- The `aws-deployment` and `feature/invoicing-port` branches — untouched until merge

## What Changes

- `schema.prisma` provider: `"sqlite"` → `"postgresql"`
- `.env` `DATABASE_URL`: `file:./dev.db` → `postgresql://...`
- Backup tooling: `cp dev.db` → `pg_dump`
- Search filters: explicitly `mode: 'insensitive'` where intended
- Anywhere using `$queryRaw` with SQLite-only functions (audit during Phase 4)
