# EMERGENCY FIX - DATABASE MIGRATION FAILURE

## Problem
After the October 30th update that added item-level commission tracking, the database schema changed but migrations were not run. This caused all API endpoints to fail with 500 errors.

## Root Cause
Your commits on Oct 30th added:
- `ItemCommission` model (per-item commission tracking)
- `CommissionSettings` model (default settings)
- Modified `CommissionPayout` to link to `ItemCommission` instead of `Commission`

The code expects these new tables/relationships, but the database doesn't have them yet.

## Solution

### Option 1: Automated Script (RECOMMENDED)

1. **Download the fix script to your server:**
   ```bash
   cd /var/www/order-tracker
   wget https://raw.githubusercontent.com/streetunity/order-tracker/aws-deployment/emergency-fix.sh
   chmod +x emergency-fix.sh
   ```

2. **Run the script:**
   ```bash
   sudo ./emergency-fix.sh
   ```

3. **Verify services are running:**
   ```bash
   pm2 status
   ```
   Both services should show status: **online**

### Option 2: Manual Steps

If you prefer to run each step manually:

```bash
# 1. Navigate to project
cd /var/www/order-tracker

# 2. Pull latest code
git pull origin aws-deployment

# 3. Clear Next.js cache
rm -rf web/.next

# 4. Navigate to API and sync database
cd api
npx prisma db push --accept-data-loss
npx prisma generate

# 5. Build frontend
cd ../web
npm run build

# 6. Restart services
cd ..
pm2 restart all

# 7. Check status
pm2 status
pm2 logs --lines 50
```

## What This Does

1. **Pulls latest code** - Ensures server has the newest schema.prisma
2. **Clears Next.js cache** - Prevents stale frontend code
3. **Syncs database** - Creates new tables/columns to match schema
4. **Regenerates Prisma client** - Updates code to access new database structure
5. **Rebuilds frontend** - Compiles latest React code
6. **Restarts services** - Applies all changes

## After Running

1. **Check PM2 status:**
   ```bash
   pm2 status
   ```
   Both services should be "online"

2. **Check logs for errors:**
   ```bash
   pm2 logs order-tracker-backend --lines 30
   ```

3. **Test in browser:**
   - Navigate to http://50.19.66.100:3000
   - Check if orders page loads
   - Verify commission pages work

## If Problems Persist

1. **Check backend logs:**
   ```bash
   pm2 logs order-tracker-backend --lines 100
   ```

2. **Check database file permissions:**
   ```bash
   ls -l /var/www/order-tracker/api/prisma/dev.db
   ```

3. **Verify Prisma client generated:**
   ```bash
   ls -l /var/www/order-tracker/api/node_modules/.prisma/client/
   ```

## Prevention for Future

**ALWAYS** follow this sequence after schema changes:

1. Update schema.prisma in GitHub
2. SSH to server: `cd /var/www/order-tracker && git pull origin aws-deployment`
3. Run migration: `cd api && npx prisma db push`
4. Regenerate client: `npx prisma generate`
5. Restart backend: `pm2 restart order-tracker-backend`
6. If frontend changes: `cd ../web && npm run build && pm2 restart order-tracker-frontend`

---

**Document created:** October 30, 2025  
**Issue:** Database schema out of sync after item-level commission update  
**Status:** Requires immediate fix
