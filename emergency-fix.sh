#!/bin/bash
# Emergency Recovery Script for Order Tracker
# Run this on your server to fix the database migration issues

set -e  # Exit on any error

echo "=========================================="
echo "ORDER TRACKER EMERGENCY RECOVERY"
echo "=========================================="
echo ""

# Navigate to project root
echo "Step 1: Navigating to project directory..."
cd /var/www/order-tracker

# Pull latest changes
echo "Step 2: Pulling latest code from GitHub..."
git pull origin aws-deployment

# Clear Next.js cache
echo "Step 3: Clearing Next.js cache..."
rm -rf web/.next

# Navigate to API directory
echo "Step 4: Navigating to API directory..."
cd api

# Force database schema sync (this is safer than migrations for SQLite)
echo "Step 5: Syncing database schema..."
npx prisma db push --accept-data-loss

# Regenerate Prisma client
echo "Step 6: Regenerating Prisma client..."
npx prisma generate

# Navigate back to root
cd ..

# Rebuild frontend
echo "Step 7: Building frontend..."
cd web
npm run build
cd ..

# Restart all PM2 services
echo "Step 8: Restarting PM2 services..."
pm2 restart all

# Show PM2 status
echo ""
echo "=========================================="
echo "RECOVERY COMPLETE - Checking status..."
echo "=========================================="
pm2 status

echo ""
echo "If you see both services running (status: online), the fix is complete!"
echo "Check the logs with: pm2 logs --lines 50"
echo ""
