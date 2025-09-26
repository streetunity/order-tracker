#!/bin/bash
# EC2 Deployment Script for Order Tracker
# Project: order-tracker on branch aws-deployment
# Server: ubuntu@50.19.66.100

set -e

# Configuration - We know these from our weeks of work
EC2_HOST="50.19.66.100"
EC2_USER="ubuntu"
PROJECT_DIR="/home/ubuntu/order-tracker"
BRANCH="aws-deployment"

echo "================================================"
echo "ORDER TRACKER DEPLOYMENT - aws-deployment branch"
echo "================================================"
echo ""
echo "Deploying to: $EC2_HOST"
echo "Branch: $BRANCH"
echo ""

# SSH into EC2 and execute deployment
ssh -o StrictHostKeyChecking=no $EC2_USER@$EC2_HOST << 'ENDSSH'
#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo_step() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $1"
}

echo_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $1"
}

cd /home/ubuntu/order-tracker

# Step 1: Stop all services
echo_step "Stopping all services..."
sudo systemctl stop order-tracker-web || true
sudo systemctl stop order-tracker-api || true
sleep 2
echo_success "Services stopped"

# Step 2: Save current commit for rollback if needed
CURRENT_COMMIT=$(git rev-parse HEAD)
echo_step "Current commit: $CURRENT_COMMIT"

# Step 3: Clean git repository and pull latest
echo_step "Cleaning repository and pulling latest code..."
git reset --hard HEAD
git clean -fd
git checkout aws-deployment
git fetch origin aws-deployment
git reset --hard origin/aws-deployment
git pull origin aws-deployment --force

NEW_COMMIT=$(git rev-parse HEAD)
echo_success "Updated to commit: $NEW_COMMIT"

# Step 4: Show what changed
echo ""
echo_step "Changes in this deployment:"
git log --oneline $CURRENT_COMMIT..$NEW_COMMIT 2>/dev/null || echo "First deployment or force push detected"
echo ""

# Step 5: CRITICAL - Clear ALL Next.js caches
echo_step "Clearing ALL Next.js build caches..."
cd web
rm -rf .next
rm -rf node_modules/.cache
rm -rf .next-*
# Also clear any Next.js cache directories
find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name ".cache" -exec rm -rf {} + 2>/dev/null || true
echo_success "All caches cleared"

# Step 6: Reinstall dependencies (in case package.json changed)
echo_step "Installing frontend dependencies..."
npm ci --prefer-offline --no-audit
echo_success "Frontend dependencies installed"

# Step 7: Build frontend with production optimizations
echo_step "Building frontend (this may take a minute)..."
NODE_ENV=production npm run build

# Verify build succeeded
if [ ! -d ".next" ]; then
    echo_error "Build failed - .next directory not created"
    exit 1
fi

# Check build output
PAGES_COUNT=$(find .next -name "*.html" 2>/dev/null | wc -l)
echo_success "Frontend built successfully with $PAGES_COUNT pages"

# Step 8: Update backend
cd ../api
echo_step "Installing backend dependencies..."
npm ci --prefer-offline --no-audit
echo_success "Backend dependencies installed"

# Step 9: Verify critical features are present in the code
cd ..
echo ""
echo_step "Verifying deployment integrity..."

# Check 1: customerDocsLink in Edit Order
if grep -q "order.customerDocsLink &&" web/app/admin/orders/[id]/page.jsx; then
    echo_success "Edit Order: customerDocsLink display ✓"
else
    echo_error "Edit Order: customerDocsLink display missing!"
fi

# Check 2: Metadata parsing for unlock reason
if grep -q "JSON.parse(log.metadata)" web/app/admin/orders/[id]/page.jsx; then
    echo_success "Edit Order: Unlock reason parsing ✓"
else
    echo_error "Edit Order: Unlock reason parsing missing!"
fi

# Check 3: Helper text in New Order
if grep -q "Enter the full URL including http://" web/app/admin/orders/new/page.jsx; then
    echo_success "New Order: Helper text correct ✓"
else
    echo_error "New Order: Helper text incorrect!"
fi

# Check 4: Backend support
if grep -q "customerDocsLink" api/src/index.js; then
    echo_success "Backend: customerDocsLink support ✓"
else
    echo_error "Backend: customerDocsLink support missing!"
fi

# Step 10: Start services
echo ""
echo_step "Starting services..."
sudo systemctl start order-tracker-api
sleep 3

if systemctl is-active --quiet order-tracker-api; then
    echo_success "API service started"
else
    echo_error "API service failed to start"
    sudo journalctl -u order-tracker-api -n 20 --no-pager
fi

sudo systemctl start order-tracker-web
sleep 3

if systemctl is-active --quiet order-tracker-web; then
    echo_success "Web service started"
else
    echo_error "Web service failed to start"
    sudo journalctl -u order-tracker-web -n 20 --no-pager
fi

# Step 11: Health check
echo ""
echo_step "Running health checks..."

# API health check
if curl -f -s -o /dev/null -w "%{http_code}" http://localhost:3001/health | grep -q "200"; then
    echo_success "API endpoint responding (200 OK)"
else
    echo_error "API endpoint not healthy"
fi

# Frontend health check
if curl -f -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo_success "Frontend responding (200 OK)"
else
    echo_error "Frontend not healthy"
fi

# Step 12: Clear any CDN/proxy caches (if using nginx)
if command -v nginx &> /dev/null; then
    echo_step "Reloading nginx..."
    sudo nginx -s reload
    echo_success "Nginx reloaded"
fi

# Create deployment record
echo "Deployment completed at $(date)" > deployment.log
echo "From commit: $CURRENT_COMMIT" >> deployment.log
echo "To commit: $NEW_COMMIT" >> deployment.log
echo "Branch: aws-deployment" >> deployment.log

echo ""
echo "================================================"
echo -e "${GREEN}DEPLOYMENT COMPLETED SUCCESSFULLY${NC}"
echo "================================================"
echo ""
echo "Deployed commit: $NEW_COMMIT"
echo "Previous commit: $CURRENT_COMMIT"
echo ""
echo "FEATURES TO VERIFY:"
echo "-------------------"
echo "1. NEW ORDER PAGE (/admin/orders/new):"
echo "   ✓ Customer Documents Link with helper text:"
echo "     'Enter the full URL including http:// or https://...'"
echo ""
echo "2. EDIT ORDER PAGE (/admin/orders/[id]):"
echo "   ✓ Documents link in header (if set)"
echo "   ✓ Editable Customer Documents Link field"
echo "   ✓ Lock/Unlock with reason in audit log"
echo ""
echo "3. CRITICAL: Clear browser cache!"
echo "   - Press Ctrl+Shift+R multiple times"
echo "   - Or use incognito mode for testing"
echo ""
echo "URL: http://50.19.66.100:3000"
echo "Login: admin@stealthmachinetools.com / admin123"
echo ""

# Show service status
echo "SERVICE STATUS:"
echo "---------------"
systemctl status order-tracker-api --no-pager | head -n 3
systemctl status order-tracker-web --no-pager | head -n 3

ENDSSH

echo ""
echo "================================================"
echo "LOCAL DEPLOYMENT SCRIPT COMPLETED"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Visit http://50.19.66.100:3000 in incognito mode"
echo "2. Login with admin@stealthmachinetools.com / admin123"
echo "3. Verify all three features are working:"
echo "   - New Order: Customer Docs Link helper text"
echo "   - Edit Order: Docs link display and editing"
echo "   - Edit Order: Unlock reason in audit log"
echo ""
echo "If you still see old content:"
echo "- Use a different browser"
echo "- Clear all browsing data for the site"
echo "- Check browser DevTools > Network tab > Disable cache"
