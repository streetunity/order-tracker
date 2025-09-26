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
print_success "Build completed"

# Step 6: Restart services
echo "Step 6: Restarting services..."
pm2 restart order-tracker-frontend
pm2 restart order-tracker-backend
pm2 save
print_success "Services restarted"

# Step 7: Verify
echo ""
echo "Deployment complete! Please:"
echo "1. Clear browser cache (Ctrl+Shift+R)"
echo "2. Test at http://50.19.66.100:3000"
echo "3. Verify all 3 features work"
