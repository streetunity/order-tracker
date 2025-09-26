#!/bin/bash
# Ultimate Fix and Deploy Script for Order Tracker
# This script ensures all changes are properly deployed and working

set -e

# Configuration
EC2_HOST="50.19.66.100"
PROJECT_DIR="/home/ubuntu/order-tracker"
WEB_DIR="$PROJECT_DIR/web"
API_DIR="$PROJECT_DIR/api"
BRANCH="aws-deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_status() {
    echo -e "${YELLOW}[STATUS]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "=========================================="
echo "ORDER TRACKER DEPLOYMENT & FIX SCRIPT"
echo "=========================================="
echo ""

# Step 1: SSH into EC2 and run the deployment
print_status "Connecting to EC2 and running deployment..."

ssh -o StrictHostKeyChecking=no ubuntu@$EC2_HOST << 'ENDSSH'
#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} ✓ $1"
}

print_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')]${NC} ✗ $1"
}

cd /home/ubuntu/order-tracker

# Stop services
print_status "Stopping services..."
sudo systemctl stop order-tracker-web || true
sudo systemctl stop order-tracker-api || true
sleep 2

# Backup current state
print_status "Creating backup..."
if [ -d web.backup ]; then
    rm -rf web.backup.old
    mv web.backup web.backup.old
fi
if [ -d api.backup ]; then
    rm -rf api.backup.old
    mv api.backup api.backup.old
fi
cp -r web web.backup
cp -r api api.backup

# Clean git state
print_status "Cleaning git repository..."
git reset --hard
git clean -fd

# Fetch latest changes
print_status "Fetching latest code..."
git fetch origin aws-deployment
git checkout aws-deployment
git reset --hard origin/aws-deployment
git pull origin aws-deployment --force

# Show latest commit
echo ""
print_status "Latest commit:"
git log -1 --oneline
echo ""

# Verify critical files
print_status "Verifying critical files..."

# Check 1: Edit Order page - customerDocsLink display
if grep -q "order.customerDocsLink &&" web/app/admin/orders/[id]/page.jsx; then
    print_success "Edit Order: customerDocsLink display code present"
else
    print_error "Edit Order: customerDocsLink display code missing"
fi

# Check 2: Edit Order page - metadata parsing for unlock reason
if grep -q "JSON.parse(log.metadata)" web/app/admin/orders/[id]/page.jsx; then
    print_success "Edit Order: Unlock reason parsing present"
else
    print_error "Edit Order: Unlock reason parsing missing"
fi

# Check 3: New Order page - helper text
if grep -q "Enter the full URL including http://" web/app/admin/orders/new/page.jsx; then
    print_success "New Order: Correct helper text present"
else
    print_error "New Order: Helper text needs updating"
    # Fix it directly
    print_status "Fixing New Order helper text..."
    sed -i 's/Dropbox or other document link for customer files/Enter the full URL including http:\/\/ or https:\/\/ (e.g., Dropbox link)/g' web/app/admin/orders/new/page.jsx
fi

# Check 4: Backend customerDocsLink handling
if grep -q "customerDocsLink" api/src/index.js; then
    print_success "Backend: customerDocsLink handling present"
else
    print_error "Backend: customerDocsLink handling missing"
fi

# Clean and rebuild frontend
print_status "Cleaning frontend build..."
cd web
rm -rf .next node_modules/.cache
npm cache clean --force || true

print_status "Installing frontend dependencies..."
npm install

print_status "Building frontend..."
NODE_ENV=production npm run build

if [ ! -d .next ]; then
    print_error "Frontend build failed - .next directory not created"
    exit 1
fi

print_success "Frontend build complete"

# Rebuild backend
cd ../api
print_status "Installing backend dependencies..."
npm install

# Create a verification file to track deployment
cd ..
echo "Deployed at: $(date)" > deployment.log
echo "Commit: $(git rev-parse HEAD)" >> deployment.log
echo "Branch: aws-deployment" >> deployment.log

# Start services
print_status "Starting services..."
sudo systemctl start order-tracker-api
sleep 3
sudo systemctl start order-tracker-web
sleep 5

# Verify services are running
print_status "Verifying services..."
if systemctl is-active --quiet order-tracker-api; then
    print_success "API service is running"
else
    print_error "API service is not running"
    sudo journalctl -u order-tracker-api -n 20
fi

if systemctl is-active --quiet order-tracker-web; then
    print_success "Web service is running"
else
    print_error "Web service is not running"
    sudo journalctl -u order-tracker-web -n 20
fi

# Test endpoints
print_status "Testing endpoints..."
if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
    print_success "API endpoint responding"
else
    print_error "API endpoint not responding"
fi

if curl -f -s http://localhost:3000 > /dev/null 2>&1; then
    print_success "Web endpoint responding"
else
    print_error "Web endpoint not responding"
fi

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "CRITICAL CHECKS:"
echo "----------------"

# Final verification of deployed files
echo ""
print_status "Final file verification:"

# Directly check the actual deployed files
if grep -q '"Enter the full URL including http://"' web/app/admin/orders/new/page.jsx; then
    print_success "✓ New Order: Helper text is correct"
else
    print_error "✗ New Order: Helper text is incorrect"
    echo "  Current text:"
    grep -A1 -B1 "customerDocsLink" web/app/admin/orders/new/page.jsx | grep "fontSize.*12" || true
fi

if grep -q 'JSON.parse(log.metadata)' web/app/admin/orders/[id]/page.jsx; then
    print_success "✓ Edit Order: Unlock reason parsing is present"
else
    print_error "✗ Edit Order: Unlock reason parsing is missing"
fi

if grep -q 'order.customerDocsLink &&' web/app/admin/orders/[id]/page.jsx; then
    print_success "✓ Edit Order: Document link display is present"
else
    print_error "✗ Edit Order: Document link display is missing"
fi

echo ""
echo "TEST INSTRUCTIONS:"
echo "------------------"
echo "1. Visit: http://50.19.66.100:3000"
echo "2. Login: admin@stealthmachinetools.com / admin123"
echo "3. Clear browser cache: Ctrl+Shift+R"
echo ""
echo "VERIFY THESE FEATURES:"
echo "----------------------"
echo "1. NEW ORDER PAGE:"
echo "   - Customer Documents Link field helper text should say:"
echo "     'Enter the full URL including http:// or https://...'"
echo ""
echo "2. EDIT ORDER PAGE:"
echo "   - Documents link shows in header if present"
echo "   - Customer Documents Link field is editable below lock section"
echo ""
echo "3. UNLOCK REASON:"
echo "   - Unlock an order with a reason"
echo "   - Check Lock/Unlock History shows the reason"
echo ""

# Show recent git commits
echo "RECENT COMMITS:"
echo "---------------"
git log --oneline -5

ENDSSH

print_success "Deployment script completed!"

echo ""
echo "=========================================="
echo "POST-DEPLOYMENT ACTIONS"
echo "=========================================="
echo ""
echo "1. Clear your browser cache completely (Ctrl+Shift+R)"
echo "2. Visit: http://50.19.66.100:3000"
echo "3. Login with: admin@stealthmachinetools.com / admin123"
echo ""
echo "If issues persist:"
echo "- Try incognito/private browsing mode"
echo "- Clear all site data in browser settings"
echo "- Check browser console for errors (F12)"
