#!/bin/bash

# Order Tracker Fix Deployment Script
# This script fixes all 3 issues and ensures Next.js is properly rebuilt

echo "====================================="
echo "Order Tracker Comprehensive Fix Script"
echo "====================================="
echo ""

# Check if running as ubuntu user or has sudo
if [[ $EUID -ne 0 ]] && [[ $(whoami) != "ubuntu" ]]; then
   echo "This script must be run as root or ubuntu user" 
   exit 1
fi

PROJECT_DIR="/var/www/order-tracker"
WEB_DIR="${PROJECT_DIR}/web"
API_DIR="${PROJECT_DIR}/api"

echo "Step 1: Navigating to project directory..."
cd $PROJECT_DIR || exit 1

echo "Step 2: Pulling latest changes from Git..."
git fetch origin aws-deployment
git checkout aws-deployment
git pull origin aws-deployment

echo "Step 3: Fixing New Order page helper text..."
# Fix the helper text in new order page
sed -i 's/Required: Dropbox or document link for customer files/Enter the full URL including http:\/\/ or https:\/\/ (e.g., https:\/\/www.dropbox.com\/your-folder)/' $WEB_DIR/app/admin/orders/new/page.jsx

echo "Step 4: Verifying Edit Order page has customerDocsLink sections..."
# Check if customerDocsLink is in the Edit Order page
EDIT_PAGE="$WEB_DIR/app/admin/orders/[id]/page.jsx"

# Count occurrences
DOCS_COUNT=$(grep -c "customerDocsLink" $EDIT_PAGE)
echo "Found $DOCS_COUNT occurrences of customerDocsLink in Edit Order page"

# Verify the audit log section has the metadata parsing
AUDIT_COUNT=$(grep -c "metadata.message" $EDIT_PAGE)
echo "Found $AUDIT_COUNT occurrences of metadata.message in audit log section"

echo "Step 5: Removing Next.js cache and build directories..."
# Clean Next.js build cache
rm -rf $WEB_DIR/.next
rm -rf $WEB_DIR/node_modules/.cache
rm -rf $WEB_DIR/.cache

echo "Step 6: Installing dependencies..."
cd $WEB_DIR
npm install

echo "Step 7: Building Next.js application..."
# Build with production settings
NODE_ENV=production npm run build

if [ $? -ne 0 ]; then
    echo "ERROR: Build failed! Please check the error messages above."
    exit 1
fi

echo "Step 8: Checking PM2 processes..."
pm2 list

echo "Step 9: Restarting PM2 processes..."
# Restart both frontend and backend
pm2 restart order-tracker-frontend
pm2 restart order-tracker-backend

echo "Step 10: Saving PM2 configuration..."
pm2 save

echo "Step 11: Verifying the build..."
# Check if .next directory was created
if [ -d "$WEB_DIR/.next" ]; then
    echo "✓ Next.js build directory exists"
    BUILD_ID=$(cat $WEB_DIR/.next/BUILD_ID 2>/dev/null)
    echo "✓ Build ID: $BUILD_ID"
else
    echo "✗ ERROR: Next.js build directory not found!"
    exit 1
fi

echo ""
echo "Step 12: Quick verification of changes..."
echo "----------------------------------------"

# Verify New Order page has correct helper text
if grep -q "Enter the full URL including http://" $WEB_DIR/app/admin/orders/new/page.jsx; then
    echo "✓ New Order page: Helper text is correct"
else
    echo "✗ New Order page: Helper text needs fixing"
fi

# Verify Edit Order page has customerDocsLink display
if grep -q "order.customerDocsLink &&" $EDIT_PAGE; then
    echo "✓ Edit Order page: customerDocsLink display found"
else
    echo "✗ Edit Order page: customerDocsLink display missing"
fi

# Verify Edit Order page has customerDocsLink input section
if grep -q "Customer Documents Link Section" $EDIT_PAGE; then
    echo "✓ Edit Order page: customerDocsLink input section found"
else
    echo "✗ Edit Order page: customerDocsLink input section missing"
fi

# Verify audit log has metadata parsing
if grep -q "JSON.parse(log.metadata)" $EDIT_PAGE; then
    echo "✓ Edit Order page: Audit log metadata parsing found"
else
    echo "✗ Edit Order page: Audit log metadata parsing missing"
fi

echo ""
echo "Step 13: Creating test script for manual verification..."
cat > /tmp/test_order_tracker.sh << 'EOF'
#!/bin/bash
echo "Testing Order Tracker Application"
echo "=================================="
echo ""
echo "1. Open browser and navigate to: http://50.19.66.100:3000"
echo "2. Login with: admin@stealthmachinetools.com / admin123"
echo ""
echo "Test 1: New Order Page"
echo "----------------------"
echo "- Go to Create New Order"
echo "- Check Customer Documents Link field"
echo "- Helper text should say: 'Enter the full URL including http:// or https:// (e.g., https://www.dropbox.com/your-folder)'"
echo ""
echo "Test 2: Edit Order Page - customerDocsLink"
echo "-------------------------------------------"
echo "- Go to any existing order"
echo "- Look in the header after 'Created by:'"
echo "- If order has customerDocsLink, should show: 'Documents: View Files ↗'"
echo "- Below the lock/unlock section, should see 'Customer Documents Link' input field"
echo ""
echo "Test 3: Edit Order Page - Unlock Reason"
echo "----------------------------------------"
echo "- Find a locked order (or lock one)"
echo "- Click 'Unlock Order' button"
echo "- Enter a reason and unlock"
echo "- Check the 'Lock/Unlock History' section at bottom"
echo "- The reason should be displayed under the UNLOCKED action"
echo ""
echo "Database Check Commands:"
echo "------------------------"
echo "Check if customerDocsLink exists in orders:"
echo "sqlite3 /var/www/order-tracker/api/prisma/dev.db \"SELECT id, customerDocsLink FROM Order WHERE customerDocsLink IS NOT NULL LIMIT 5;\""
echo ""
echo "Check audit logs for unlock reasons:"
echo "sqlite3 /var/www/order-tracker/api/prisma/dev.db \"SELECT id, action, metadata FROM AuditLog WHERE action='UNLOCKED' LIMIT 5;\""
EOF

chmod +x /tmp/test_order_tracker.sh

echo ""
echo "====================================="
echo "DEPLOYMENT COMPLETE!"
echo "====================================="
echo ""
echo "Summary:"
echo "- Git repository updated to latest"
echo "- Next.js application rebuilt"
echo "- PM2 processes restarted"
echo "- Build ID: $BUILD_ID"
echo ""
echo "Next Steps:"
echo "1. Clear your browser cache (Ctrl+Shift+R or Cmd+Shift+R)"
echo "2. Run manual tests: /tmp/test_order_tracker.sh"
echo "3. If issues persist, check PM2 logs: pm2 logs order-tracker-frontend"
echo ""
echo "IMPORTANT: The application needs 10-15 seconds to fully start."
echo "Please wait before testing."
