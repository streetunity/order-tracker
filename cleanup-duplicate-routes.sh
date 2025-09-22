#!/bin/bash
# Clean up duplicate [orderId] directories that shouldn't exist

echo "Cleaning up duplicate [orderId] directories..."

cd /var/www/order-tracker

# Stop services
echo "Stopping services..."
pm2 stop all

# Remove the duplicate [orderId] directories
echo "Removing duplicate [orderId] directories..."
rm -rf web/app/api/orders/[orderId]
rm -rf web/app/api/orders/[id]/items/[itemId]

# Also check for any other duplicates
if [ -d "web/app/api/orders/[id]/items/[itemId]" ]; then
  echo "Removing [itemId] from items..."
  rm -rf web/app/api/orders/[id]/items/[itemId]
fi

# Clear Next.js cache
echo "Clearing Next.js cache..."
cd web
rm -rf .next
rm -rf node_modules/.cache

# Rebuild
echo "Rebuilding application..."
npm run build

# If build succeeds, restart services
if [ $? -eq 0 ]; then
  echo "Build successful, restarting services..."
  cd /var/www/order-tracker
  pm2 restart all
  pm2 status
  echo "Cleanup complete! Application should be running."
else
  echo "Build failed. Please check the errors above."
  exit 1
fi

# Also update git to prevent this from coming back
echo ""
echo "Updating git to ignore these directories..."
cd /var/www/order-tracker
git rm -rf web/app/api/orders/[orderId] 2>/dev/null || true
git rm -rf web/app/api/orders/[id]/items/[itemId] 2>/dev/null || true

echo ""
echo "Done! The duplicate directories have been removed."