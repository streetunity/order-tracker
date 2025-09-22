#!/bin/bash
# Fix for Next.js slug name conflict error

echo "Fixing Next.js slug naming conflict..."

# Clear Next.js cache and build artifacts
echo "Clearing Next.js cache..."
cd /var/www/order-tracker/web
rm -rf .next
rm -rf node_modules/.cache

# Remove the old kiosk directory that might be causing conflicts
if [ -d "app/admin/kiosk/old" ]; then
  echo "Removing old kiosk directory..."
  rm -rf app/admin/kiosk/old
fi

# Clean install dependencies
echo "Clean installing dependencies..."
rm -rf node_modules
npm cache clean --force
npm install

# Rebuild the application
echo "Rebuilding application..."
npm run build

# Restart PM2 services
echo "Restarting services..."
cd /var/www/order-tracker
pm2 restart all

echo "Fix complete! Check if the error is resolved."
pm2 status