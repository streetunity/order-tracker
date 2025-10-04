# 🎯 QUICK VISUAL GUIDE - Copy & Paste These Exact Changes

## Step 1: Pull Latest Code

```bash
cd /var/www/order-tracker
git pull origin aws-deployment
```

---

## Step 2: Edit `api/src/index.js`

### Change #1: Add Import (Line ~14)

**FIND THIS:**
```javascript
import { addAuditEndpoint } from './audit-endpoint-fix.js';


const prisma = new PrismaClient();
```

**CHANGE TO THIS:**
```javascript
import { addAuditEndpoint } from './audit-endpoint-fix.js';
import { createReportsRouter } from './routes/reports.js';

const prisma = new PrismaClient();
```

---

### Change #2: Mount Router (Line ~65)

**FIND THIS:**
```javascript
app.use(cookieParser());

// -----------------------------
// Helpers
// -----------------------------
```

**CHANGE TO THIS:**
```javascript
app.use(cookieParser());

// Reports Module
const reportsRouter = createReportsRouter(prisma);
app.use('/reports', authGuard, reportsRouter);
console.log('✅ Reports module loaded');

// -----------------------------
// Helpers
// -----------------------------
```

---

## Step 3: Edit `web/app/admin/board/page.jsx`

### Change #3: Add Navigation Link (Line ~570)

**FIND THIS:**
```javascript
          <Link href="/admin/orders" className="btn">
            Manage Orders
          </Link>
          {/* User menu */}
```

**CHANGE TO THIS:**
```javascript
          <Link href="/admin/orders" className="btn">
            Manage Orders
          </Link>
          <Link href="/admin/reports" className="btn">
            Reports
          </Link>
          {/* User menu */}
```

---

## Step 4: Clear Cache & Restart Services

```bash
# IMPORTANT: Always clear .next cache first!
cd /var/www/order-tracker/web
rm -rf .next

# Restart backend
cd /var/www/order-tracker
pm2 restart order-tracker-backend

# Check logs for success message
pm2 logs order-tracker-backend --lines 20
# Look for: "✅ Reports module loaded"

# Rebuild and restart frontend
cd web
npm run build
pm2 restart order-tracker-frontend
```

---

## Step 5: Test It!

### Backend Test (using curl):

```bash
# Get your token from browser localStorage
# Then test:
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:4000/reports/summary
```

**Expected Response:**
```json
{
  "kpis": {
    "activeOrders": 85,
    "completedOrders": 45,
    "totalRevenue": "$2,500,000",
    "ordersByStage": [...]
  },
  "meta": {...}
}
```

### Frontend Test (in browser):

1. Open your Order Tracker in browser
2. Log in if needed
3. Look for new **"Reports"** button in the top navigation
4. Click it → Should see dashboard with KPI cards
5. Click any report → Should load data

---

## ✅ Success Checklist

After completing the steps above, verify:

- [ ] Cleared .next cache before building
- [ ] No errors when restarting backend
- [ ] See "✅ Reports module loaded" in PM2 logs
- [ ] "Reports" button appears in navigation
- [ ] Reports dashboard loads when clicked
- [ ] KPI cards show data
- [ ] Individual reports work
- [ ] Colors are red/grey/black (no blue!)
- [ ] Date filters work
- [ ] Data tables display properly

---

## 🚨 Troubleshooting

**If backend won't start:**
1. Check syntax - did you copy exactly?
2. Missing comma? Extra bracket?
3. Check PM2 logs: `pm2 logs order-tracker-backend`

**If "Reports" button doesn't appear:**
1. **ALWAYS clear .next cache first!** `rm -rf web/.next`
2. Did you rebuild frontend? `cd web && npm run build`
3. Hard refresh browser (Ctrl+Shift+R)
4. Check browser console for errors (F12)

**If endpoints return 404:**
1. Verify "✅ Reports module loaded" in logs
2. Check router is mounted AFTER cookieParser
3. Verify authGuard is imported

**If old styling shows or pages don't update:**
1. **Clear .next cache:** `rm -rf web/.next`
2. Rebuild: `npm run build`
3. Restart: `pm2 restart order-tracker-frontend`
4. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

---

## 📂 File Locations

**Backend files to edit:**
- `api/src/index.js` (2 changes)

**Frontend files to edit:**
- `web/app/admin/board/page.jsx` (1 change)

**Files created automatically (don't edit):**
- `api/src/utils/reportHelpers.js`
- `api/src/routes/reports.js`
- `api/src/routes/reportsCycleTime.js`
- `web/app/admin/reports/page.jsx`
- `web/app/admin/reports/reports.css`
- `web/app/admin/reports/*/page.jsx` (5 report pages)

---

## 🎉 That's It!

**Total manual changes: 3 code additions**
**Estimated time: 10-15 minutes**

**IMPORTANT:** Always remember to clear .next cache before rebuilding!

```bash
# The golden rule:
rm -rf web/.next
npm run build
pm2 restart order-tracker-frontend
```

Everything else is done and ready to use! 🚀
