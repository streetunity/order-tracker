#!/bin/bash

# Order Tracker Complete Deployment Script
# This script ensures all changes from Git are properly deployed to the server

set -e  # Exit on error

echo "=========================================="
echo "Order Tracker Complete Deployment Script"
echo "=========================================="
echo ""

# Configuration
PROJECT_DIR="/var/www/order-tracker"
WEB_DIR="${PROJECT_DIR}/web"
API_DIR="${PROJECT_DIR}/api"
BRANCH="aws-deployment"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Step 1: Navigate to project
echo "Step 1: Navigating to project directory..."
cd $PROJECT_DIR || exit 1
print_success "Changed to project directory"

# Step 2: Git sync
echo "Step 2: Syncing with GitHub..."
git fetch origin $BRANCH
git reset --hard origin/$BRANCH
COMMIT=$(git rev-parse HEAD)
print_success "Updated to commit: ${COMMIT:0:7}"

# Step 3: Install dependencies
echo "Step 3: Installing dependencies..."
cd $API_DIR && npm install
cd $WEB_DIR && npm install
print_success "Dependencies installed"

# Step 4: Database setup
echo "Step 4: Database setup..."
cd $API_DIR
npx prisma generate
npx prisma db push --skip-generate
print_success "Database updated"

# Step 5: Clean and build
echo "Step 5: Building Next.js..."
cd $WEB_DIR
rm -rf .next
npm run build || exit 1
BUILD_ID=$(cat .next/BUILD_ID 2>/dev/null || echo "unknown")
print_success "Build completed (ID: $BUILD_ID)"

# Step 6: Restart services
echo "Step 6: Restarting services..."
pm2 restart order-tracker-frontend
pm2 restart order-tracker-backend
pm2 save
print_success "Services restarted"

# Step 7: Wait for services
echo "Step 7: Waiting for services to start..."
sleep 10

# Step 8: Verify changes
echo "Step 8: Verifying deployment..."
echo ""

# Check 1: customerDocsLink in Edit Order page
if grep -q "order.customerDocsLink &&" "$WEB_DIR/app/admin/orders/[id]/page.jsx"; then
    print_success "Edit Order: customerDocsLink display code present"
else
    print_error "Edit Order: customerDocsLink display code missing"
fi

# Check 2: Helper text in New Order page
if grep -q "Enter the full URL including http://" "$WEB_DIR/app/admin/orders/new/page.jsx"; then
    print_success "New Order: Correct helper text present"
else
    print_error "New Order: Helper text needs updating"
fi

# Check 3: Audit log metadata parsing
if grep -q "JSON.parse(log.metadata)" "$WEB_DIR/app/admin/orders/[id]/page.jsx"; then
    print_success "Edit Order: Audit log metadata parsing present"
else
    print_error "Edit Order: Audit log metadata parsing missing"
fi

# Check 4: Backend customerDocsLink handling
if grep -q "customerDocsLink" "$API_DIR/src/index.js"; then
    print_success "Backend: customerDocsLink handling present"
else
    print_error "Backend: customerDocsLink handling missing"
fi

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Git Commit: ${COMMIT:0:7}"
echo "Build ID: $BUILD_ID"
echo ""
echo "IMPORTANT NEXT STEPS:"
echo "1. Clear your browser cache (Ctrl+Shift+R)"
echo "2. Test at http://50.19.66.100:3000"
echo ""
echo "TEST CHECKLIST:"
echo "---------------"
echo "1. NEW ORDER PAGE:"
echo "   - Customer Documents Link helper text should say:"
echo "     'Enter the full URL including http:// or https://...'"
echo ""
echo "2. EDIT ORDER PAGE:"
echo "   - Documents link shows in header if present"
echo "   - Editable Customer Documents Link field below lock section"
echo ""
echo "3. UNLOCK REASON:"
echo "   - Unlock an order with a reason"
echo "   - Check Lock/Unlock History shows the reason"
echo ""
echo "Login: admin@stealthmachinetools.com / admin123"
