# Database Migration Instructions for FOLLOW_UP Stage

## Overview
The FOLLOW_UP stage has been added as the final stage in the workflow pipeline.

## Database Changes Required
**Good news!** Since the Prisma schema uses `String` types for stage fields (not enums), no database migration is required. SQLite will automatically accept the new "FOLLOW_UP" value.

## What Was Updated

### Backend (api/src/state.js)
- Added `'FOLLOW_UP'` to the STAGES array
- Updated `isTerminalStage()` to recognize FOLLOW_UP as the new terminal stage
- The validation logic now accepts FOLLOW_UP as a valid stage

### Frontend
- **Board page** (web/app/admin/board/page.jsx): Added FOLLOW_UP column
- **Kiosk page** (web/app/admin/kiosk/page.jsx): Added FOLLOW_UP column
- Both pages now display 10 stages total

## Testing the New Stage

1. **Restart the API server** to load the updated validation:
   ```bash
   cd api
   npm run dev
   ```

2. **Test moving items to Follow Up**:
   - Items in "Completed" stage can now move forward to "Follow Up"
   - Items in "Follow Up" cannot move forward (it's the terminal stage)
   - Items can move backward from "Follow Up" to "Completed"

3. **Verify in the database** (optional):
   ```bash
   cd api
   npx prisma studio
   ```
   - Check OrderItem records can have currentStage = "FOLLOW_UP"
   - Check OrderStatusEvent records can have stage = "FOLLOW_UP"

## No Prisma Migration Needed

Since we're using string fields for stages (not database enums), no migration is needed. The database will accept the new value immediately.

If you want to generate a migration for documentation purposes:
```bash
cd api
npx prisma migrate dev --name add-follow-up-stage
```

But this will create an empty migration since no schema changes are required.

## Rollback Instructions

If you need to rollback:
1. Remove FOLLOW_UP from api/src/state.js
2. Remove FOLLOW_UP from frontend files
3. Any items already in FOLLOW_UP stage will need to be manually moved back to COMPLETED

## Summary

✅ Backend validation updated  
✅ Frontend displays updated  
✅ Database compatible (no migration needed)  
✅ Ready to use immediately
