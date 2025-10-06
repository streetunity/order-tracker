# Order Tracker Deployment Guide - DO NOT DELETE

## Critical Information
- **Repository**: https://github.com/streetunity/order-tracker/
- **Branch**: aws-deployment (ALWAYS use this branch)
- **Server Path**: /var/www/order-tracker/
- **Server Access**: SSH via PuTTY

## PM2 Services
- `order-tracker-backend` (id: 0) - Backend API service
- `order-tracker-frontend` (id: 1) - Frontend Next.js service

## Golden Rules
1. **NEVER edit files directly on the server** - Always use GitHub
2. **NEVER edit api/src/index.js via GitHub API** - File is 2500+ lines and gets truncated
3. **ALWAYS use aws-deployment branch** - Never use master or main
4. **ALWAYS run migrations when schema changes** - Or the app will break

## Quick Commands

### Complete Rebuild (Fixes Most Issues)
```bash
cd /var/www/order-tracker && \
git pull origin aws-deployment && \
rm -rf web/.next && \
cd web && npm run build && \
cd ../api && npx prisma generate && \
cd .. && pm2 restart all && \
pm2 logs --lines 30
```

### Backend Only Update
```bash
cd /var/www/order-tracker && \
git pull origin aws-deployment && \
cd api && npx prisma generate && \
cd .. && pm2 restart order-tracker-backend && \
pm2 logs order-tracker-backend --lines 20
```

### Frontend Only Update
```bash
cd /var/www/order-tracker && \
git pull origin aws-deployment && \
cd web && npm run build && \
cd .. && pm2 restart order-tracker-frontend && \
pm2 logs order-tracker-frontend --lines 20
```

## Database Operations

### When Changing Schema (CRITICAL)
```bash
cd /var/www/order-tracker/api
npx prisma migrate deploy  # Run migrations
# If migration fails:
npx prisma db push
npx prisma migrate resolve --applied <migration-name>
npx prisma generate
cd .. && pm2 restart order-tracker-backend
```

### Check Migration Status
```bash
cd /var/www/order-tracker/api
npx prisma migrate status
```

## Current Features

### Order Management
- Create, edit, delete orders
- Item-level tracking with multiple statuses
- Customer tracking via unique tokens
- Order locking mechanism
- Archive/restore functionality

### Admin-Only Fields (Editable on Locked Orders)
- `itemPrice` - Item pricing
- `privateItemNote` - Internal notes
- `height`, `width`, `length`, `weight`, `units` - Measurements
- `archivedAt` - Archive status
- `customerDocsLink` - Documentation links
- `laserWattage` - Laser settings

### Reporting System
- Daily/weekly/monthly/yearly revenue reports
- Average ticket calculations
- Status distribution analytics
- Time-based filtering

### Board Views
- Real-time order status board
- Kiosk display mode
- Automatic status progression
- Visual status indicators

## Troubleshooting

### Blank Board/Kiosk Display
Usually database sync issue:
```bash
cd /var/www/order-tracker/api
npx prisma db push
npx prisma generate
cd .. && pm2 restart all
```

### Next.js Cache Issues
```bash
cd /var/www/order-tracker
rm -rf web/.next
cd web && npm run build
cd .. && pm2 restart order-tracker-frontend
```

### Check Service Status
```bash
pm2 status
pm2 logs --lines 50
```

### Reset to GitHub State
```bash
cd /var/www/order-tracker
git stash
git reset --hard origin/aws-deployment
```

## File Editing Protocol

### For Most Files
1. Edit on GitHub (aws-deployment branch)
2. Pull to server: `git pull origin aws-deployment`
3. Rebuild if needed
4. Restart appropriate service

### For api/src/index.js (Special Case)
Due to file size (2500+ lines), GitHub truncates this file. Instead:
1. SSH to server
2. Edit directly: `nano /var/www/order-tracker/api/src/index.js`
3. Commit changes:
```bash
git add api/src/index.js
git commit -m "Update index.js: [description]"
git push origin aws-deployment
```

## Environment Variables
Located in respective directories:
- `/var/www/order-tracker/api/.env` - Backend environment
- `/var/www/order-tracker/web/.env.local` - Frontend environment

## Port Configuration
- Backend API: Port 3001
- Frontend: Port 3000
- Access via domain configured in DNS

## Monitoring
```bash
# View real-time logs
pm2 logs

# View specific service
pm2 logs order-tracker-backend --lines 100
pm2 logs order-tracker-frontend --lines 100

# Monitor resources
pm2 monit
```

## Emergency Recovery
If everything is broken:
```bash
cd /var/www/order-tracker
git stash
git reset --hard origin/aws-deployment
rm -rf web/.next
rm -rf api/node_modules web/node_modules
cd api && npm install
cd ../web && npm install && npm run build
cd ../api && npx prisma db push && npx prisma generate
cd .. && pm2 restart all
```

## Important Notes
- Database: SQLite file at `/var/www/order-tracker/api/prisma/dev.db`
- Backups: Create before major changes: `cp api/prisma/dev.db api/prisma/dev.db.backup`
- Logs: PM2 logs are in `~/.pm2/logs/`
- Build artifacts: `.next` folder can always be deleted and rebuilt

## Contact for Issues
This is the master deployment guide. If you encounter issues not covered here, the problem likely needs debugging rather than documentation.

Last Updated: October 2025
Version: 2.0 - Consolidated Edition
