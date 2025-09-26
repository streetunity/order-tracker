#!/bin/bash

# Quick fix script for Order Tracker issues
# Run this on the server to immediately fix all 3 issues

echo "Quick Fix for Order Tracker Issues"
echo "===================================="

# Navigate to project
cd /var/www/order-tracker || exit 1

# 1. Fix the helper text in New Order page
echo "Fixing New Order page helper text..."
sed -i '/<div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>/ {
    N
    s/Required: Dropbox or document link for customer files/Enter the full URL including http:\/\/ or https:\/\/ (e.g., https:\/\/www.dropbox.com\/your-folder)/
}' web/app/admin/orders/new/page.jsx

# 2. Verify customerDocsLink display in Edit Order (should already be there)
echo "Verifying Edit Order page has customerDocsLink..."
if ! grep -q "order.customerDocsLink &&" web/app/admin/orders/\[id\]/page.jsx; then
    echo "WARNING: customerDocsLink display not found in Edit Order page!"
fi

# 3. Verify audit log metadata parsing (should already be there)
echo "Verifying audit log shows unlock reasons..."
if ! grep -q "JSON.parse(log.metadata)" web/app/admin/orders/\[id\]/page.jsx; then
    echo "WARNING: Audit log metadata parsing not found!"
fi

# 4. CRITICAL: Rebuild Next.js
echo "Rebuilding Next.js application..."
cd web
rm -rf .next
npm run build

# 5. Restart PM2
echo "Restarting PM2 processes..."
pm2 restart order-tracker-frontend
pm2 restart order-tracker-backend

echo ""
echo "Fix applied! Please wait 10 seconds and then:"
echo "1. Clear browser cache (Ctrl+Shift+R)"
echo "2. Test the application"
echo ""
echo "If issues persist, run the full fix: ./fix_deployment.sh"
