# Postgres Migration Script

One-time data migration tool. See `docs/POSTGRES_MIGRATION.md` for the full runbook.

## Quick reference

```bash
cd /var/www/order-tracker/scripts/migrate-to-postgres
npm install

node migrate.js \
  --source="file:/tmp/dryrun.db" \
  --target="postgresql://smt_app:PASSWORD@localhost:5432/smt_orders?schema=public"
```

The script:

- Uses `better-sqlite3` to read directly from the SQLite file (no Prisma client needed for the source)
- Uses Prisma client for all writes to Postgres (preserves type coercion)
- Walks tables in foreign-key dependency order so inserts never fail an FK check
- Pages through each table in batches of 500
- Verifies row counts after every table
- Is **read-only** against the SQLite file — the source database cannot be corrupted

## Re-runs

The script does NOT truncate Postgres on its own. To re-run from scratch, reset Postgres first:

```bash
cd /var/www/order-tracker/api
DATABASE_URL="postgresql://smt_app:PASSWORD@localhost:5432/smt_orders?schema=public" \
  npx prisma db push --force-reset --skip-generate
```

Then re-run `migrate.js`.
