# Order Tracker - Quick Reference Card

## Essential Information
- **Repository:** streetunity/order-tracker
- **Branch:** aws-deployment (ALWAYS!)
- **Server Path:** /var/www/order-tracker/
- **GitHub Edit Only:** NEVER edit files on server

## PM2 Services
- **Backend:** order-tracker-backend (id: 0)
- **Frontend:** order-tracker-frontend (id: 1)

## Most Used Commands

### Standard Deployment
```bash
# 1. Make changes on GitHub (aws-deployment branch)
# 2. SSH to server, then:
cd /var/www/order-tracker
git pull origin aws-deployment

# If backend changed:
pm2 restart order-tracker-backend

# If frontend changed:
cd web && npm run build
pm2 restart order-tracker-frontend
```

### Quick Backend Update
```bash
cd /var/www/order-tracker && git pull origin aws-deployment && cd api && npx prisma generate && cd .. && pm2 restart order-tracker-backend
```

### Complete Rebuild (Fixes Most Issues)
```bash
cd /var/www/order-tracker && git pull origin aws-deployment && rm -rf web/.next && cd web && npm run build && cd .. && cd api && npx prisma generate && cd .. && pm2 restart all && pm2 logs --lines 30
```

### Database Schema Update
```bash
# After updating schema.prisma on GitHub:
cd /var/www/order-tracker
git pull origin aws-deployment
cd api
npx prisma migrate deploy
npx prisma generate
cd ..
pm2 restart order-tracker-backend
```

### If Migration Fails
```bash
cd api
npx prisma db push
npx prisma migrate resolve --applied <migration-name>
npx prisma generate
```

## Troubleshooting

### Display Issues / Blank Pages
```bash
# Clear Next.js cache and rebuild
rm -rf web/.next
cd web && npm run build
pm2 restart order-tracker-frontend
```

### Check Logs
```bash
pm2 logs --lines 50                    # All logs
pm2 logs order-tracker-backend         # Backend only
pm2 logs order-tracker-frontend        # Frontend only
```

### Reset Local Changes
```bash
git status                              # Check changes
git stash                               # Save changes temporarily
git reset --hard origin/aws-deployment  # Reset to remote
```

### Check PM2 Status
```bash
pm2 status
pm2 restart all
```

## File Locations

### Backend Structure
```
/api/src/
├── index.js                 # Main entry (keep < 500 lines)
├── routes/                  # ALL endpoints here
│   ├── orders.js           # Order endpoints
│   ├── items.js            # Item endpoints
│   ├── reports.js          # Reports
│   ├── auth.js             # Authentication
│   ├── manufacturers.js    # Manufacturers
│   ├── notifications.js    # Notifications
│   └── [other modules]
└── middleware/auth.js       # Auth guards
```

### Frontend Pages
```
/web/app/
├── admin/
│   ├── orders/[id]/        # Edit order
│   ├── orders/new/         # New order
│   ├── board/              # Admin board
│   ├── kiosk/              # Kiosk view
│   ├── reports/            # Reports
│   └── settings/           # Settings
└── t/[token]/              # Customer tracking
```

## User Roles

- **SUPER_ADMIN** - Full access
- **ACCOUNTANT** - Financial access
- **ADMIN** - Administrative
- **AGENT** - Order management
- **MANUFACTURER** - Limited item access

## Important Fields

- **sku** → Sales person name
- **orderDate** → Actual order date (for reports)
- **itemPrice** → Total price per item
- **privateItemNote** → Internal notes
- **customerDocsLink** → Document URLs

## Adding New Features

### New Endpoint
```javascript
// Add to appropriate file in /api/src/routes/
router.get('/new-endpoint', authGuard, async (req, res) => {
  // Implementation
});
```

### New Module
```javascript
// 1. Create /api/src/routes/newfeature.js
// 2. Add to index.js:
import { createNewFeatureRouter } from './routes/newfeature.js';
const newFeatureRouter = createNewFeatureRouter(prisma);
app.use('/newfeature', authGuard, newFeatureRouter);
```

## Common Database Queries

### Check Migration Status
```bash
cd api && npx prisma migrate status
```

### Force Sync Database
```bash
cd api && npx prisma db push
```

### Open Prisma Studio
```bash
cd api && npx prisma studio
```

## Git Commands

### Check Branch
```bash
git branch
# Should show: * aws-deployment
```

### Pull Latest
```bash
git pull origin aws-deployment
```

### Stash Changes
```bash
git stash                    # Save changes
git stash pop                # Restore changes
git stash drop               # Delete stashed changes
```

## Environment Check

### API Health
```
http://[server-ip]:4000/health
```

### Frontend
```
http://[server-ip]:3000
```

### Default Logins
- Admin: admin@stealthmachinetools.com / admin123
- Agent: john@stealthmachinetools.com / agent123

## Emergency Procedures

### Complete Reset
```bash
cd /var/www/order-tracker
git reset --hard origin/aws-deployment
rm -rf web/.next
cd web && npm run build
cd ../api
npx prisma generate
npx prisma db push
cd ..
pm2 restart all
```

### Backup Database
```bash
cd api
cp prisma/dev.db prisma/dev.db.backup.$(date +%Y%m%d)
```

### Restore Database
```bash
cd api
cp prisma/dev.db.backup.YYYYMMDD prisma/dev.db
pm2 restart order-tracker-backend
```

## Golden Rules

1. ✅ ALWAYS edit through GitHub
2. ✅ ALWAYS use aws-deployment branch
3. ✅ ALWAYS run migrations after schema changes
4. ✅ ALWAYS check logs after deployment
5. ❌ NEVER edit files on server directly
6. ❌ NEVER add code to index.js (use modules)
7. ❌ NEVER skip database migrations

## Support Contacts

- Repository: github.com/streetunity/order-tracker
- Branch: aws-deployment
- SSH: Via PuTTY

---
*Keep this card handy for quick reference*
*Last Updated: November 2025*