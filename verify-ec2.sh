#!/bin/bash
# Direct EC2 verification and emergency fix script
# Run this ON the EC2 instance if deployment isn't working

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}ORDER TRACKER - VERIFICATION & EMERGENCY FIX${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

cd /home/ubuntu/order-tracker

# Function to check a feature
check_feature() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $description"
        return 0
    else
        echo -e "${RED}✗${NC} $description"
        return 1
    fi
}

# 1. Check current branch and commit
echo -e "${YELLOW}Current Git Status:${NC}"
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git rev-parse --short HEAD)"
echo "Message: $(git log -1 --pretty=%B | head -1)"
echo ""

# 2. Verify all features are in the code
echo -e "${YELLOW}Code Verification:${NC}"
ISSUES=0

check_feature "web/app/admin/orders/[id]/page.jsx" "order.customerDocsLink &&" "Edit Order: Document link display" || ((ISSUES++))
check_feature "web/app/admin/orders/[id]/page.jsx" "JSON.parse(log.metadata)" "Edit Order: Unlock reason parsing" || ((ISSUES++))
check_feature "web/app/admin/orders/new/page.jsx" "Enter the full URL including http://" "New Order: Correct helper text" || ((ISSUES++))
check_feature "api/src/index.js" "customerDocsLink" "Backend: customerDocsLink support" || ((ISSUES++))

echo ""

# 3. If issues found, offer to fix
if [ $ISSUES -gt 0 ]; then
    echo -e "${RED}Found $ISSUES issues!${NC}"
    echo ""
    read -p "Do you want to apply emergency fixes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Applying emergency fixes...${NC}"
        
        # Stop services
        sudo systemctl stop order-tracker-web order-tracker-api
        
        # Force pull latest from aws-deployment
        git fetch origin aws-deployment
        git reset --hard origin/aws-deployment
        
        # NUCLEAR OPTION: Complete cache clear
        echo -e "${YELLOW}Performing complete cache clear...${NC}"
        cd web
        rm -rf .next
        rm -rf node_modules/.cache
        rm -rf .next-*
        find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
        find . -type d -name ".cache" -exec rm -rf {} + 2>/dev/null || true
        
        # Clear npm cache too
        npm cache clean --force
        
        # Reinstall and rebuild
        echo -e "${YELLOW}Reinstalling dependencies...${NC}"
        npm ci
        
        echo -e "${YELLOW}Building frontend...${NC}"
        NODE_ENV=production npm run build
        
        # Start services
        cd ..
        sudo systemctl start order-tracker-api
        sleep 2
        sudo systemctl start order-tracker-web
        
        echo -e "${GREEN}Emergency fixes applied!${NC}"
    fi
else
    echo -e "${GREEN}All features present in code!${NC}"
fi

# 4. Check if services are running
echo ""
echo -e "${YELLOW}Service Status:${NC}"
if systemctl is-active --quiet order-tracker-api; then
    echo -e "${GREEN}✓${NC} API service is running"
else
    echo -e "${RED}✗${NC} API service is NOT running"
    echo "  Last error:"
    sudo journalctl -u order-tracker-api -n 5 --no-pager | tail -4
fi

if systemctl is-active --quiet order-tracker-web; then
    echo -e "${GREEN}✓${NC} Web service is running"
else
    echo -e "${RED}✗${NC} Web service is NOT running"
    echo "  Last error:"
    sudo journalctl -u order-tracker-web -n 5 --no-pager | tail -4
fi

# 5. Check if build exists and is recent
echo ""
echo -e "${YELLOW}Build Status:${NC}"
if [ -d "web/.next" ]; then
    BUILD_TIME=$(stat -c %y web/.next | cut -d' ' -f1,2)
    echo -e "${GREEN}✓${NC} Build exists (created: $BUILD_TIME)"
    
    # Check if build is older than git pull
    GIT_PULL_TIME=$(stat -c %y .git/FETCH_HEAD 2>/dev/null | cut -d' ' -f1,2)
    if [ ! -z "$GIT_PULL_TIME" ]; then
        if [[ "$BUILD_TIME" < "$GIT_PULL_TIME" ]]; then
            echo -e "${RED}✗${NC} Build is older than last git pull!"
            echo "  Consider rebuilding with: cd web && rm -rf .next && npm run build"
        fi
    fi
else
    echo -e "${RED}✗${NC} No build found!"
    echo "  Run: cd web && npm run build"
fi

# 6. Test endpoints
echo ""
echo -e "${YELLOW}Endpoint Tests:${NC}"
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null || echo "000")
if [ "$API_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} API responding (HTTP $API_STATUS)"
else
    echo -e "${RED}✗${NC} API not responding (HTTP $API_STATUS)"
fi

WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "$WEB_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Frontend responding (HTTP $WEB_STATUS)"
else
    echo -e "${RED}✗${NC} Frontend not responding (HTTP $WEB_STATUS)"
fi

# 7. Show what's actually being served
echo ""
echo -e "${YELLOW}Quick Content Check:${NC}"
echo "Checking what's actually in the built files..."

# Check if the built files contain our expected strings
if [ -d "web/.next/server/app/admin/orders" ]; then
    if grep -r "Enter the full URL including http://" web/.next/server/app/admin/orders 2>/dev/null | head -1 > /dev/null; then
        echo -e "${GREEN}✓${NC} New Order helper text found in build"
    else
        echo -e "${RED}✗${NC} New Order helper text NOT in build - rebuild needed!"
    fi
    
    if grep -r "JSON.parse(log.metadata)" web/.next/server/app/admin/orders 2>/dev/null | head -1 > /dev/null; then
        echo -e "${GREEN}✓${NC} Unlock reason parsing found in build"
    else
        echo -e "${RED}✗${NC} Unlock reason parsing NOT in build - rebuild needed!"
    fi
else
    echo -e "${RED}✗${NC} Build directory structure not found"
fi

# 8. Final recommendations
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}RECOMMENDATIONS:${NC}"
echo -e "${BLUE}================================================${NC}"

if [ $ISSUES -eq 0 ] && [ "$API_STATUS" = "200" ] && [ "$WEB_STATUS" = "200" ]; then
    echo -e "${GREEN}Everything looks good!${NC}"
    echo ""
    echo "If you're still seeing old content in the browser:"
    echo "1. Clear browser cache (Ctrl+Shift+R)"
    echo "2. Try incognito/private mode"
    echo "3. Try a different browser"
    echo "4. Check DevTools > Network > Disable cache"
else
    echo "Issues detected. Try these commands:"
    echo ""
    echo "1. Full rebuild:"
    echo "   cd /home/ubuntu/order-tracker/web"
    echo "   sudo systemctl stop order-tracker-web"
    echo "   rm -rf .next node_modules/.cache"
    echo "   npm run build"
    echo "   sudo systemctl start order-tracker-web"
    echo ""
    echo "2. Check logs:"
    echo "   sudo journalctl -u order-tracker-web -f"
    echo "   sudo journalctl -u order-tracker-api -f"
    echo ""
    echo "3. Force latest code:"
    echo "   git fetch origin aws-deployment"
    echo "   git reset --hard origin/aws-deployment"
fi

echo ""
echo "Test URL: http://50.19.66.100:3000"
echo "Login: admin@stealthmachinetools.com / admin123"
