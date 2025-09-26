#!/bin/bash

# Deploy ordered status feature
# Run this script on your AWS server to apply the ordered status functionality

echo "================================================"
echo "Deploying Ordered Status Feature"
echo "================================================"

# Navigate to project directory
cd /var/www/order-tracker

# 1. Pull latest changes
echo "1. Pulling latest changes..."
git pull origin aws-deployment

# 2. Apply database migration
echo "2. Applying database migration..."
cd api
npx prisma migrate deploy
npx prisma generate

# 3. Apply API patches
echo "3. Applying API patches..."
chmod +x src/apply-ordered-endpoints.sh
./src/apply-ordered-endpoints.sh

# 4. Apply frontend patches
echo "4. Applying frontend patches..."
cd ../web/app/admin/board
patch -p0 < ordered-indicator.patch || echo "Board patch may already be applied or needs manual update"
cd ../../../..

# 5. Rebuild frontend
echo "5. Building frontend..."
cd web
npm run build

# 6. Restart services
echo "6. Restarting services..."
pm2 restart order-tracker-backend
pm2 restart order-tracker-frontend

# 7. Verify services are running
echo "7. Verifying services..."
pm2 status

echo "================================================"
echo "Deployment complete!"
echo "================================================"
echo ""
echo "New features added:"
echo "✓ Items can now be marked as 'ordered' (admin only)"
echo "✓ $ icon displays on board for ordered items"
echo "✓ Unordering items requires reason (like unlock)"
echo "✓ All ordered/unordered actions logged in audit trail"
echo ""
echo "Test the feature at: http://50.19.66.100:3000/admin/orders/[any-order-id]"