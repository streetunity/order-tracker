# Notification System Deployment Commands

## Complete Deployment (Run these commands on the server)

### Step 1: Pull Latest Changes
```bash
cd /var/www/order-tracker
git pull origin aws-deployment
```

### Step 2: Run Database Migration
```bash
cd api
npx prisma db push
```

**Expected Output:**
```
Datasource "db": SQLite database "dev.db"

Your database is now in sync with your Prisma schema.

✔ Generated Prisma Client
```

### Step 3: Regenerate Prisma Client
```bash
npx prisma generate
```

**Expected Output:**
```
✔ Generated Prisma Client to ./node_modules/@prisma/client
```

### Step 4: Restart Backend
```bash
cd /var/www/order-tracker
pm2 restart order-tracker-backend
```

### Step 5: Verify Backend is Running
```bash
pm2 logs order-tracker-backend --lines 20
```

**Look for:**
```
✅ All modules loaded successfully
✅ Notifications API loaded
API server running at http://0.0.0.0:4000
```

### Step 6: Test the API
```bash
# Test health check
curl http://localhost:4000/health

# Test notifications endpoint (requires auth token)
curl http://localhost:4000/notifications \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Quick One-Liner Deployment

If everything is already configured and you just need to deploy:

```bash
cd /var/www/order-tracker && git pull origin aws-deployment && cd api && npx prisma db push && npx prisma generate && cd .. && pm2 restart order-tracker-backend && pm2 logs --lines 20
```

## Troubleshooting

### If migration fails with "already exists" error:
```bash
cd /var/www/order-tracker/api
npx prisma migrate resolve --applied <migration-name>
npx prisma db push
npx prisma generate
```

### If backend won't start:
```bash
pm2 logs order-tracker-backend --lines 50
# Look for error messages
```

### If you see "Unknown field" errors:
```bash
cd /var/www/order-tracker/api
npx prisma generate
pm2 restart order-tracker-backend
```

### To completely reset (CAUTION - loses data):
```bash
cd /var/www/order-tracker/api
rm -f prisma/dev.db
npx prisma db push
npx prisma generate
pm2 restart order-tracker-backend
```

## Testing After Deployment

### 1. Check API is responding
```bash
curl http://localhost:4000/health
```

**Expected:** `{"status":"OK","timestamp":"...","environment":"production"}`

### 2. Test notifications endpoint (as admin)
```bash
# You'll need a valid admin token - get it by logging in first
curl http://localhost:4000/notifications \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected:** `{"notifications":[],"total":0,"unreadCount":0}` (if no notifications yet)

### 3. Generate test notifications (admin only)
```bash
curl -X POST http://localhost:4000/notifications/generate-operational \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected:** `{"message":"Generated X operational notifications","count":X,...}`

### 4. Verify role filtering (as agent)
```bash
# Login as agent and get their token
curl http://localhost:4000/notifications \
  -H "Authorization: Bearer AGENT_TOKEN"
```

**Expected:** Only notifications for that agent's orders

## Post-Deployment Checklist

- [ ] Database migration successful (`npx prisma db push`)
- [ ] Prisma client regenerated (`npx prisma generate`)
- [ ] Backend restarted successfully (`pm2 restart`)
- [ ] Health check passes (`curl /health`)
- [ ] Notifications endpoint accessible (`curl /notifications`)
- [ ] Generate operational notifications works (admin)
- [ ] Role filtering works correctly (test with agent account)
- [ ] No errors in logs (`pm2 logs`)

## Next Steps

1. **Set up scheduled job** for auto-generating notifications
2. **Build frontend components** for displaying notifications
3. **Test notification creation** when orders change status
4. **Configure notification preferences** (future feature)
5. **Implement commission notification triggers** when commission system is ready

## Rollback (If Needed)

If the deployment causes issues:

```bash
cd /var/www/order-tracker
git log --oneline -5  # Find the previous commit
git reset --hard <previous-commit-sha>
cd api
npx prisma db push
npx prisma generate
pm2 restart order-tracker-backend
```

## Monitoring

### Check notification count growth:
```bash
# In the Prisma console or via SQL
sqlite3 /var/www/order-tracker/api/prisma/dev.db
SELECT COUNT(*) FROM Notification;
```

### Check recent notifications:
```bash
sqlite3 /var/www/order-tracker/api/prisma/dev.db
SELECT type, priority, title, createdAt FROM Notification ORDER BY createdAt DESC LIMIT 10;
```

### Check unread notifications by user:
```bash
sqlite3 /var/www/order-tracker/api/prisma/dev.db
SELECT u.name, COUNT(*) as unread 
FROM Notification n 
JOIN User u ON n.userId = u.id 
WHERE n.isRead = 0 
GROUP BY u.name;
```

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs order-tracker-backend`
2. Verify database connection: `cd api && npx prisma studio`
3. Review documentation: `/docs/NOTIFICATIONS.md`
4. Check Prisma schema: `/api/prisma/schema.prisma`

---

**Deployment should take less than 2 minutes!**
