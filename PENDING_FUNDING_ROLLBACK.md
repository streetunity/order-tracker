# PENDING_FUNDING Stage - Rollback Instructions

## Quick Rollback

If issues arise after deploying the PENDING_FUNDING stage, follow these steps to safely rollback:

### Option 1: Git Rollback (Safest)

```bash
# 1. Switch back to previous branch
git checkout feature/invoicing-port

# 2. Revert Prisma schema default (optional - only affects NEW items)
cd api
# Edit prisma/schema.prisma line 308:
# Change: currentStage String @default("PENDING_FUNDING")
# Back to: currentStage String @default("MANUFACTURING")

# 3. Apply schema change
DATABASE_URL="file:./dev.db" npx prisma db push
DATABASE_URL="file:./dev.db" npx prisma generate

# 4. Rebuild frontend
cd ../web
rm -rf .next
npm run build

# 5. Restart services (if on production)
pm2 restart order-tracker-backend
pm2 restart order-tracker-frontend
```

### Option 2: Manual Code Rollback

If you need to rollback but keep other changes, revert only these files:

#### Backend:
1. **`api/src/state.js`** - Remove PENDING_FUNDING from STAGES array
2. **`api/prisma/schema.prisma`** - Change OrderItem default back to MANUFACTURING
3. **`api/src/helpers/commission.js`** - Remove PENDING_FUNDING blocking logic
4. **`api/src/config/stageThresholds.js`** - Remove PENDING_FUNDING entry

#### Frontend:
1. **`web/app/admin/board/page.jsx`** - Remove PENDING_FUNDING from STAGES and STAGE_LABELS

Then run:
```bash
cd api
DATABASE_URL="file:./dev.db" npx prisma db push
cd ../web
rm -rf .next
npm run build
pm2 restart all  # if on production
```

---

## What Happens to Existing Data?

### Items Already in PENDING_FUNDING
- Will remain in database with `currentStage: 'PENDING_FUNDING'`
- After rollback, these items will still display in reports/board
- **To fix**: Manually move them to MANUFACTURING stage via Admin Board

### Items in Other Stages
- **Completely unaffected**
- No data changes needed
- Will continue working normally

---

## Database Safety

**CRITICAL**: Existing data is NOT modified by this feature:
- Items at MANUFACTURING, SHIPPING, DELIVERED, etc. stay unchanged
- No data loss occurs
- No breaking schema changes

The only change is:
- **New items** created after deployment default to PENDING_FUNDING
- Existing items retain their current stage

---

## Verification After Rollback

```bash
# 1. Check backend starts without errors
cd /home/brian/tracking/manufacturing-tracker/api
node src/index.js
# Should see: "API server running at http://0.0.0.0:4000"

# 2. Check frontend builds successfully
cd /home/brian/tracking/manufacturing-tracker/web
rm -rf .next
npm run build
# Should complete with no errors

# 3. Check Admin Board loads
# Visit: http://localhost:3000/admin/board
# Should show all stages except PENDING_FUNDING
```

---

## Support Information

**Feature Branch**: `feature/pending-funding-stage`
**Base Branch**: `feature/invoicing-port`
**Commits**:
- d9970fa - Backend core logic
- a67d65d - Frontend UI

**Files Changed**: 5 files total
- `api/src/state.js`
- `api/prisma/schema.prisma`
- `api/src/helpers/commission.js`
- `api/src/config/stageThresholds.js`
- `web/app/admin/board/page.jsx`

---

## Contact

For issues during rollback, check:
1. PM2 logs: `pm2 logs`
2. Backend console output
3. Browser console for frontend errors

**Date Created**: January 2026
**Status**: READY FOR PRODUCTION
