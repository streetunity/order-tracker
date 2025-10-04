# Manual Implementation Steps for Reporting Suite

## What's Been Done Automatically

All files have been created and pushed to the `aws-deployment` branch:

### Backend Files Created ✅
- ✅ `api/src/utils/reportHelpers.js` - Utility functions
- ✅ `api/src/routes/reports.js` - Sales & Revenue endpoints
- ✅ `api/src/routes/reportsCycleTime.js` - Cycle Time endpoints  
- ✅ `api/src/routes/reportsComplete.js` - Router module

### Frontend Files Created ✅
- ✅ `web/app/admin/reports/page.jsx` - Main reports dashboard
- ✅ `web/app/admin/reports/reports.css` - Styling (red/white/black/grey theme)
- ✅ `web/app/admin/reports/sales-by-rep/page.jsx` - Sales by rep report
- ✅ `web/app/admin/reports/cycle-times/page.jsx` - Cycle times report
- ✅ `web/app/admin/reports/on-time/page.jsx` - On-time delivery report
- ✅ `web/app/admin/reports/chokepoints/page.jsx` - Chokepoints report
- ✅ `web/app/admin/reports/first-pass-yield/page.jsx` - First-pass yield report

### Documentation Created ✅
- ✅ `REPORTS_README.md` - Quick start guide
- ✅ `REPORTING_IMPLEMENTATION_GUIDE.md` - Detailed technical guide
- ✅ `REPORT_RESPONSE_EXAMPLES.md` - API response examples
- ✅ `MANUAL_IMPLEMENTATION_STEPS.md` - This file

---

## What YOU Need to Do Manually

### Step 1: Pull Latest Changes from GitHub

```bash
cd /var/www/order-tracker
git pull origin aws-deployment
```

Verify files were pulled:
```bash
ls api/src/routes/reports.js
ls web/app/admin/reports/page.jsx
```

---

### Step 2: Integrate Reports Router into Backend

**File to Edit:** `api/src/index.js`

#### A. Add Import Statement

Find the imports section at the top of the file (around line 14, after the existing imports). Add:

```javascript
import { createReportsRouter } from './routes/reports.js';
```

Should look like:
```javascript
import { addAuditEndpoint } from './audit-endpoint-fix.js';
import { createReportsRouter } from './routes/reports.js';  // ← ADD THIS LINE
```

#### B. Mount Reports Router

Find where `app.use(cookieParser());` is called (around line 65). After that line, add:

```javascript
app.use(cookieParser());

// Reports Module
const reportsRouter = createReportsRouter(prisma);
app.use('/reports', authGuard, reportsRouter);
console.log('✅ Reports module loaded');
```

**Important Notes:**
- The reports router MUST be mounted AFTER `app.use(cookieParser())` 
- The reports router MUST be mounted BEFORE any other route definitions
- Don't forget the `authGuard` middleware - reports require authentication

---

### Step 3: Add Link to Reports from Board Page

**File to Edit:** `web/app/admin/board/page.jsx`

Find the navigation section in the header (around line 550-580, inside the `<nav className="headerNav">` section).

Add the Reports link:

```javascript
<Link href="/admin/orders" className="btn">
  Manage Orders
</Link>
<Link href="/admin/reports" className="btn">  {/* ← ADD THIS */}
  Reports
</Link>
{/* User menu */}
```

This will add a "Reports" button to the main board navigation.

---

### Step 4: Restart Backend

```bash
cd /var/www/order-tracker/api
pm2 restart order-tracker-backend
```

Wait a few seconds, then check logs:
```bash
pm2 logs order-tracker-backend --lines 50
```

**You should see:** `✅ Reports module loaded` in the logs.

If you see an error instead, check:
1. Did you add the import correctly?
2. Did you place the router mounting in the right location?
3. Are there any syntax errors (missing commas, brackets)?

---

### Step 5: Rebuild Frontend

```bash
cd /var/www/order-tracker/web
npm run build
pm2 restart order-tracker-frontend
```

Wait for the build to complete, then check:
```bash
pm2 logs order-tracker-frontend --lines 20
```

---

### Step 6: Test the Implementation

#### A. Test Backend Endpoints

Get your auth token from the browser:
1. Open browser developer tools (F12)
2. Go to Application > Local Storage
3. Find your JWT token
4. Copy it

Test the summary endpoint:
```bash
export TOKEN="your-jwt-token-here"

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/reports/summary
```

You should see JSON with:
```json
{
  "kpis": {
    "activeOrders": ...,
    "completedOrders": ...,
    "totalRevenue": "...",
    "ordersByStage": [...]
  },
  ...
}
```

#### B. Test Frontend

1. Open browser and go to your Order Tracker
2. Log in if needed
3. Click the new **"Reports"** button in the navigation
4. You should see the reports dashboard with:
   - KPI cards (Active Orders, Completed Orders, Revenue if admin)
   - Orders by Stage grid
   - Links to individual reports

5. Click on a report (e.g., "Cycle Times")
6. You should see:
   - Date filters
   - KPI cards
   - Data table with results

---

## Troubleshooting

### Issue: "Cannot find module './routes/reports.js'"

**Solution:**
1. Verify file exists: `ls api/src/routes/reports.js`
2. If not, re-run: `git pull origin aws-deployment`
3. Check import path has `.js` extension
4. Restart: `pm2 restart order-tracker-backend`

---

### Issue: "404 Not Found" on /reports endpoints

**Solution:**
1. Check PM2 logs: `pm2 logs order-tracker-backend`
2. Verify you see "✅ Reports module loaded"
3. If not, check that you mounted the router correctly
4. Make sure router is mounted AFTER cookieParser and BEFORE other routes
5. Verify `authGuard` middleware is imported at the top

---

### Issue: Frontend shows blank page or errors

**Solution:**
1. Check browser console for errors (F12)
2. Verify the build completed: `cd web && npm run build`
3. Check if AuthContext is working: `console.log` in the component
4. Verify the API URL is correct (should be `/api/reports/...`)
5. Check network tab - are API calls returning 401? (auth issue)

---

### Issue: "Reports" button doesn't appear

**Solution:**
1. Verify you edited the correct file: `web/app/admin/board/page.jsx`
2. Check you added the Link in the right location (inside `<nav>`)
3. Rebuild frontend: `cd web && npm run build`
4. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
5. Clear browser cache if needed

---

### Issue: Data not loading in reports

**Solution:**
1. Check browser Network tab (F12) - is the API call successful?
2. If 401: Token expired, log out and back in
3. If 500: Check PM2 backend logs for errors
4. If empty results: Check date filters - may be filtering out all data
5. Verify data exists: Check orders have `createdByUserId`, `itemPrice`, etc.

---

### Issue: Colors are blue instead of red/grey

**Solution:**
1. Hard refresh browser to clear CSS cache
2. Check `web/app/admin/reports/reports.css` was created
3. Verify it's using `var(--accent)` for red, not blue colors
4. Rebuild: `cd web && npm run build && pm2 restart order-tracker-frontend`

---

## Verification Checklist

After completing all steps, verify:

- [ ] Backend starts without errors (`pm2 logs order-tracker-backend`)
- [ ] You see "✅ Reports module loaded" in logs
- [ ] Frontend builds without errors
- [ ] "Reports" button appears in board navigation
- [ ] Reports dashboard loads when clicked
- [ ] Can see KPI cards with data
- [ ] Individual reports load (try at least 2)
- [ ] Date filters work correctly
- [ ] Data tables display properly
- [ ] Pagination works on tables with many results
- [ ] No blue colors anywhere (only red, white, black, greys)
- [ ] Admin-only reports require admin login
- [ ] All reports use red accent color for important metrics

---

## Code Changes Summary

### File: `api/src/index.js`

**Add this import (after line 13):**
```javascript
import { createReportsRouter } from './routes/reports.js';
```

**Add this code (after line 65, after `app.use(cookieParser());`):**
```javascript
// Reports Module
const reportsRouter = createReportsRouter(prisma);
app.use('/reports', authGuard, reportsRouter);
console.log('✅ Reports module loaded');
```

### File: `web/app/admin/board/page.jsx`

**Add this link in the nav section (around line 570):**
```javascript
<Link href="/admin/reports" className="btn">
  Reports
</Link>
```

---

## Available Reports

After implementation, these reports will be accessible:

### Sales & Revenue (Admin Only)
- `/admin/reports/sales-by-rep` - Revenue by sales representative
- `/admin/reports/sales-by-month` - Monthly sales trends
- `/admin/reports/sales-by-item` - Top products by revenue
- `/admin/reports/ovar` - Order Value at Risk

### Operations (All Users)
- `/admin/reports/cycle-times` - Order completion metrics
- `/admin/reports/throughput` - Weekly stage throughput
- `/admin/reports/stage-durations` - Time in each stage
- `/admin/reports/on-time` - On-time delivery tracking
- `/admin/reports/first-pass-yield` - First-pass success rate
- `/admin/reports/rework` - Rework analysis
- `/admin/reports/chokepoints` - Bottleneck identification

### Dashboard
- `/admin/reports` - Main reports landing page

---

## Additional Reports to Create (Optional)

The following reports were designed but not yet implemented as pages. You can create them following the same pattern:

1. **Sales by Month** - `web/app/admin/reports/sales-by-month/page.jsx`
2. **Sales by Item** - `web/app/admin/reports/sales-by-item/page.jsx`
3. **Order Value at Risk** - `web/app/admin/reports/ovar/page.jsx`
4. **Throughput** - `web/app/admin/reports/throughput/page.jsx`
5. **Stage Durations** - `web/app/admin/reports/stage-durations/page.jsx`
6. **Rework Hotlist** - `web/app/admin/reports/rework/page.jsx`

**To create these:**
1. Copy an existing report page (e.g., `cycle-times/page.jsx`)
2. Update the API endpoint to match (e.g., `/api/reports/sales-by-month`)
3. Adjust the KPIs and table columns to match the data structure
4. See `REPORT_RESPONSE_EXAMPLES.md` for the data format

---

## Performance Optimization (Future)

For better performance with large datasets:

1. **Add Database Indexes** (see `REPORTING_IMPLEMENTATION_GUIDE.md`)
2. **Implement Redis Caching** for frequently accessed reports
3. **Create Materialized Views** for complex aggregations
4. **Add Background Jobs** to pre-compute daily/weekly reports
5. **Implement CSV Export** for large datasets

---

## Support & Documentation

- **Quick Start:** `REPORTS_README.md`
- **Technical Guide:** `REPORTING_IMPLEMENTATION_GUIDE.md`
- **API Examples:** `REPORT_RESPONSE_EXAMPLES.md`
- **This Guide:** `MANUAL_IMPLEMENTATION_STEPS.md`

---

## Final Notes

- All reports use the same color scheme as the board (red, white, black, greys)
- Reports require authentication - users must be logged in
- Financial reports (sales, revenue) require admin role
- The reports module is completely independent - it won't break existing functionality
- You can test endpoints individually before building frontend pages

**Estimated Implementation Time:** 15-20 minutes

**Questions?** Check the troubleshooting section above or review the backend logs for specific errors.

---

**Good luck with the implementation! 🚀**
