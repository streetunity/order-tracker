# Deployment Instructions

## Files Modified - All Verified Safe:

### New Pages:
- web/app/admin/profile/page.jsx (1.4KB)
- web/app/admin/change-password/page.jsx (6.7KB)
- web/app/admin/commissions/page.jsx (1.4KB)
- web/app/admin/notifications/page.jsx (1.4KB)

### Updated Pages:
- web/app/admin/customers/page.jsx (19KB) - TopNav added, buttons removed
- web/app/admin/orders/page.jsx (5.3KB) - TopNav added, buttons removed
- web/app/admin/reports/page.jsx (6.1KB) - TopNav added

### Backend:
- api/src/routes/auth.js (4.3KB) - change-password endpoint
- api/src/index.js (10.5KB) - auth routing updated

## Manual Updates Needed (Files Too Large for GitHub API):

### 1. Users Page (33.9KB)
**File:** `/var/www/order-tracker/web/app/admin/users/page.jsx`

**Changes:**
1. Add import at top (after other imports):
```javascript
import TopNav from "@/components/TopNav";
```

2. Replace the return statement wrapper from:
```javascript
return (
  <div style={{ maxWidth: "1400px", ...}}>
```

To:
```javascript
return (
  <>
    <TopNav />
    <div style={{ maxWidth: "1400px", ...}}>
```

And add closing `</>` at the very end before the final `);`

3. Remove the "Back to Board" button - find and delete:
```javascript
<Link href="/admin/board" className="btn" style={{ marginLeft: 8 }}>
  Back to Board
</Link>
```

---

### 2. History/Audit Page (34KB)
**File:** `/var/www/order-tracker/web/app/history/page.jsx`

**Changes:**
1. Add import at top (after other imports):
```javascript
import TopNav from "@/components/TopNav";
```

2. Replace the return statement wrapper from:
```javascript
return (
  <div style={{ maxWidth: "1400px", ...}}>
```

To:
```javascript
return (
  <>
    <TopNav />
    <div style={{ maxWidth: "1400px", ...}}>
```

And add closing `</>` at the very end before the final `);`

3. Remove navigation buttons - find and delete these lines:
```javascript
<Link href="/admin/board" className="btn">Back to Board</Link>
<Link href="/admin/customers" className="btn" style={{ marginLeft: 8 }}>Manage Customers</Link>
<Link href="/admin/orders" className="btn" style={{ marginLeft: 8 }}>Manage Orders</Link>
```

---

## Deploy Command:

```bash
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && pm2 restart all && pm2 logs --lines 30
```

---

## After Deployment:

1. Pull changes with command above
2. Manually edit the two large files (users page and history page)
3. Run rebuild command:
```bash
cd /var/www/order-tracker && rm -rf web/.next && cd web && npm run build && pm2 restart order-tracker-frontend && pm2 logs --lines 20
```
