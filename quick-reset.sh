#!/bin/bash
# Quick Database Reset - No confirmation, for development use
# WARNING: This immediately deletes all data!

cd /var/www/order-tracker

echo "Quick resetting database..."

# Stop backend
pm2 stop order-tracker-backend 2>/dev/null || true

# Backup
cp api/prisma/dev.db api/prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Reset
cd api
rm -f prisma/dev.db prisma/dev.db-journal
npx prisma db push --force-reset >/dev/null 2>&1
sudo chown ubuntu:ubuntu prisma/dev.db 2>/dev/null || chown ubuntu:ubuntu prisma/dev.db
sudo chmod 664 prisma/dev.db 2>/dev/null || chmod 664 prisma/dev.db
node prisma/seed.js >/dev/null 2>&1

# Restart
pm2 restart order-tracker-backend >/dev/null 2>&1

echo "✓ Database reset complete"
echo "  Admin: admin@stealthmachinetools.com / admin123"
echo "  Agent: john@stealthmachinetools.com / agent123"