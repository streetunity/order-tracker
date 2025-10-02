#!/bin/bash

echo "====================================="
echo "FINAL DEPLOYMENT SCRIPT"
echo "====================================="

cd /var/www/order-tracker

# 1. Pull latest changes
echo "1. Pulling latest changes..."
git pull origin aws-deployment

# 2. Run database migration
echo "2. Running database migration..."
cd api
npx prisma generate
npx prisma migrate deploy

# 3. Manual updates required
echo ""
echo "====================================="
echo "MANUAL UPDATES REQUIRED:"
echo "====================================="
echo ""
echo "You need to manually update 3 files:"
echo ""
echo "FILE 1: api/src/index.js"
echo "  - See MANUAL_UPDATE_PRICE_NOTES.md for detailed changes"
echo "  - Update PATCH endpoint for items"
echo "  - Add GET /api/orders/yearly-total endpoint"
echo ""
echo "FILE 2: web/app/admin/orders/[id]/page.jsx"  
echo "  - See web/EDIT_ORDER_CHANGES.md for changes"
echo "  - Update saveItem function signature and body"
echo "  - Update EditableRow onSave prop"
echo "  - Replace EditableRow function with content from web/EditableRow-update.jsx"
echo ""
echo "FILE 3: web/app/admin/board/page.jsx"
echo "  - See web/BOARD_PAGE_CHANGES.md for changes"
echo "  - Add yearlyTotal state"
echo "  - Add loadYearlyTotal function"
echo "  - Update useEffect to call loadYearlyTotal"
echo "  - Add yearly total display in header"
echo ""
echo "All the specific code changes are documented in the .md files"
echo ""
echo "Press Enter when you've completed all manual updates..."
read

# 4. Build and deploy
echo "4. Building frontend..."
cd ../web
npm run build

echo "5. Restarting services..."
pm2 restart all
pm2 status

echo ""
echo "====================================="
echo "DEPLOYMENT COMPLETE!"
echo "====================================="
echo ""
echo "Please test:"
echo "  1. Edit order page - verify second row with price/notes appears for admins"
echo "  2. Board page - verify yearly total shows for admins"
echo "  3. Customer tracking page - verify price/notes are NOT visible"