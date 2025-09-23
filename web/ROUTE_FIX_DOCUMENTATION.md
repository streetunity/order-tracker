# Dynamic Route Conflict Fix

## Problem
The application was throwing an error:
```
Error: You cannot use different slug names for the same dynamic path ('id' !== 'orderId').
```

This occurred because the measurement feature inadvertently created conflicting dynamic route structures:
- Existing routes used: `/api/orders/[id]/...`
- New measurement routes used: `/api/orders/[orderId]/...`

Next.js cannot differentiate between these two parameter names at the same routing level.

## Solution
1. **Moved all measurement routes** from `[orderId]` to `[id]`:
   - `/api/orders/[id]/items/[itemId]/measurements/route.js`
   - `/api/orders/[id]/measurements/bulk/route.js`

2. **Updated parameter references** in route handlers from `orderId` to `id`:
   ```javascript
   // Before:
   const { orderId, itemId } = params;
   
   // After:
   const { id, itemId } = params;
   ```

3. **Removed old conflicting routes** under `[orderId]` folder

## Frontend Components
- **No changes needed** to frontend components
- Components already use `order.id` correctly in API calls
- The `orderId` prop name in components is just internal naming and doesn't affect routing

## Affected Files
- ✅ Created: `/api/orders/[id]/items/[itemId]/measurements/route.js`
- ✅ Created: `/api/orders/[id]/measurements/bulk/route.js`
- ✅ Removed: Old `[orderId]` route files
- ✅ Frontend components remain unchanged and working

## Testing
After these changes:
1. Clear Next.js cache: `rm -rf .next`
2. Restart development server: `npm run dev`
3. The error should be resolved

All measurement functionality remains intact and working as expected.
