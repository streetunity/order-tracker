#!/bin/bash

# This script will create the updated versions of the frontend files
# with the price and private notes functionality

echo "Creating updated frontend files with price and private notes feature..."

# Navigate to web directory
cd /var/www/order-tracker/web

# Backup existing files
echo "1. Creating backups..."
cp app/admin/orders/[id]/page.jsx app/admin/orders/[id]/page.jsx.backup
cp app/admin/board/page.jsx app/admin/board/page.jsx.backup

echo "2. Downloading updated files from GitHub..."

# Download the updated Edit Order page
curl -o app/admin/orders/[id]/page.jsx.new https://raw.githubusercontent.com/streetunity/order-tracker/aws-deployment/web/app/admin/orders/[id]/page-with-price-notes.jsx

# Download the updated Board page  
curl -o app/admin/board/page.jsx.new https://raw.githubusercontent.com/streetunity/order-tracker/aws-deployment/web/app/admin/board/page-with-yearly-total.jsx

echo "3. Applying updates..."

# Replace the files
mv app/admin/orders/[id]/page.jsx.new app/admin/orders/[id]/page.jsx
mv app/admin/board/page.jsx.new app/admin/board/page.jsx

echo "Frontend files updated successfully!"
echo ""
echo "Files updated:"
echo "  - app/admin/orders/[id]/page.jsx (added price and private notes fields)"
echo "  - app/admin/board/page.jsx (added yearly total display)"
echo ""
echo "Backups created with .backup extension"