#!/bin/bash

echo "====================================="
echo "SIMPLIFIED DEPLOYMENT FOR PRICE/NOTES"
echo "====================================="

# Navigate to project directory
cd /var/www/order-tracker

# Pull latest changes
echo "1. Pulling latest changes from GitHub..."
git pull origin aws-deployment

# Run database migration
echo "2. Running database migration..."
cd api
npx prisma generate
npx prisma migrate deploy

echo "3. Now you need to manually update the API"
echo "   Edit: api/src/index.js"
echo "   Instructions are in MANUAL_UPDATE_PRICE_NOTES.md"
echo ""
echo "   Main changes needed:"
echo "   - Update PATCH endpoint for items to handle itemPrice and privateItemNote"
echo "   - Add new GET /api/orders/yearly-total endpoint"
echo ""
echo "Press Enter when you've completed the API updates..."
read

echo "4. Manually update the frontend files"
echo "   Edit: web/app/admin/orders/[id]/page.jsx"
echo "   Instructions are in web/EDIT_ORDER_CHANGES.md"
echo ""
echo "   Edit: web/app/admin/board/page.jsx"  
echo "   Instructions are in web/BOARD_PAGE_CHANGES.md"
echo ""
echo "Press Enter when you've completed the frontend updates..."
read

# Build frontend
echo "5. Building frontend..."
cd ../web
npm run build

# Restart services
echo "6. Restarting services..."
pm2 restart all

# Check status
echo "7. Checking service status..."
pm2 status

echo "====================================="
echo "Deployment Complete!"
echo "====================================="
echo ""
echo "Test checklist:"
echo "  1. Edit an order as admin - verify second row appears under each item"
echo "  2. Add price and private notes to an item"
echo "  3. Save and verify data persists"
echo "  4. Lock order and verify admins can still edit price/notes"
echo "  5. Check Board page for yearly total (admin only)"
echo "  6. Check customer tracking page - verify price/notes are NOT visible"