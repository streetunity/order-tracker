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

## Manual Update Needed:

### Users Page (33.9KB - too large for API):
File: web/app/admin/users/page.jsx

1. Add import at top (after other imports):
```javascript
import TopNav from "@/components/TopNav";
```

2. Replace the return statement wrapper:
Change:
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

And add closing `</>` at the end before the final `);
`

3. Remove "Back to Board" button:
Find and remove this line:
```javascript
<Link href="/admin/board" className="btn" style={{ marginLeft: 8 }}>
  Back to Board
</Link>
```

## Deploy Command:
```bash
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && pm2 restart all && pm2 logs --lines 30
```
