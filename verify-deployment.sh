#!/bin/bash
# Deployment Verification Script
# Run this after deployment to ensure everything is working

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Order Tracker Health Check ===${NC}"
echo ""

# Check database
echo "1. Database Status:"
if [ -f /var/www/order-tracker/api/prisma/dev.db ]; then
    echo -e "   ${GREEN}✓${NC} Database exists"
    perms=$(stat -c %a /var/www/order-tracker/api/prisma/dev.db)
    if [ "$perms" = "664" ] || [ "$perms" = "666" ]; then
        echo -e "   ${GREEN}✓${NC} Database is writable (permissions: $perms)"
    else
        echo -e "   ${RED}✗${NC} Database permissions incorrect: $perms (should be 664)"
        echo "   Fix with: sudo chmod 664 /var/www/order-tracker/api/prisma/dev.db"
    fi
    size=$(du -h /var/www/order-tracker/api/prisma/dev.db | cut -f1)
    echo "   Size: $size"
else
    echo -e "   ${RED}✗${NC} Database not found!"
fi
echo ""

# Check environment files
echo "2. Configuration Files:"
if [ -f /var/www/order-tracker/api/.env ]; then
    echo -e "   ${GREEN}✓${NC} API .env exists"
    if grep -q "JWT_SECRET" /var/www/order-tracker/api/.env; then
        echo -e "   ${GREEN}✓${NC} JWT_SECRET is set"
    else
        echo -e "   ${RED}✗${NC} JWT_SECRET is missing!"
    fi
else
    echo -e "   ${RED}✗${NC} API .env missing!"
fi

if [ -f /var/www/order-tracker/web/.env.local ]; then
    echo -e "   ${GREEN}✓${NC} Frontend .env.local exists"
    if grep -q "50.19.66.100:4000" /var/www/order-tracker/web/.env.local; then
        echo -e "   ${GREEN}✓${NC} API URL correctly configured"
    else
        echo -e "   ${YELLOW}!${NC} API URL might be incorrect"
    fi
else
    echo -e "   ${RED}✗${NC} Frontend .env.local missing!"
fi
echo ""

# Check PM2 processes
echo "3. PM2 Services:"
backend_status=$(pm2 describe order-tracker-backend 2>/dev/null | grep "status" | grep -o "online\|stopped\|errored")
frontend_status=$(pm2 describe order-tracker-frontend 2>/dev/null | grep "status" | grep -o "online\|stopped\|errored")

if [ "$backend_status" = "online" ]; then
    echo -e "   ${GREEN}✓${NC} Backend: online"
else
    echo -e "   ${RED}✗${NC} Backend: $backend_status"
fi

if [ "$frontend_status" = "online" ]; then
    echo -e "   ${GREEN}✓${NC} Frontend: online"
else
    echo -e "   ${RED}✗${NC} Frontend: $frontend_status"
fi
echo ""

# Test API endpoints
echo "4. API Endpoints:"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/auth/check | grep -q "200"; then
    echo -e "   ${GREEN}✓${NC} Health check endpoint working"
else
    echo -e "   ${RED}✗${NC} API not responding"
fi

# Test login
login_response=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}')

if echo "$login_response" | grep -q "token"; then
    echo -e "   ${GREEN}✓${NC} Login endpoint working"
else
    echo -e "   ${RED}✗${NC} Login not working"
    echo "   Response: $login_response"
fi
echo ""

# Test external access
echo "5. External Access:"
if curl -s -o /dev/null -w "%{http_code}" http://50.19.66.100:3000 2>/dev/null | grep -q "200\|304"; then
    echo -e "   ${GREEN}✓${NC} Frontend accessible from: http://50.19.66.100:3000"
else
    echo -e "   ${YELLOW}!${NC} Frontend might not be accessible externally"
fi

if curl -s -o /dev/null -w "%{http_code}" http://50.19.66.100:4000/auth/check 2>/dev/null | grep -q "200"; then
    echo -e "   ${GREEN}✓${NC} API accessible from: http://50.19.66.100:4000"
else
    echo -e "   ${YELLOW}!${NC} API might not be accessible externally"
fi
echo ""

# Summary
echo -e "${GREEN}=== Summary ===${NC}"
if [ "$backend_status" = "online" ] && [ "$frontend_status" = "online" ] && echo "$login_response" | grep -q "token"; then
    echo -e "${GREEN}✓ System is fully operational!${NC}"
    echo ""
    echo "Access your application at: http://50.19.66.100:3000"
    echo "Login with: admin@stealthmachinetools.com / admin123"
else
    echo -e "${YELLOW}⚠ Some issues detected. Review the output above.${NC}"
    echo ""
    echo "Common fixes:"
    echo "  • Database permissions: sudo chmod 664 /var/www/order-tracker/api/prisma/dev.db"
    echo "  • Restart services: pm2 restart all"
    echo "  • Check logs: pm2 logs"
fi