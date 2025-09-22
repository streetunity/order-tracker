#!/bin/bash
# Test script to verify deployment is working correctly

echo "================================"
echo "Order Tracker Deployment Test"
echo "Server: 50.19.66.100"
echo "================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Test backend health
echo "Testing Backend API (Port 4000)..."
if curl -f -s -o /dev/null http://localhost:4000; then
    echo -e "${GREEN}✓ Backend is running${NC}"
else
    echo -e "${RED}✗ Backend is not responding${NC}"
    echo "  Try: pm2 logs order-tracker-backend"
fi

# Test frontend
echo ""
echo "Testing Frontend (Port 3000)..."
if curl -f -s -o /dev/null http://localhost:3000; then
    echo -e "${GREEN}✓ Frontend is running${NC}"
else
    echo -e "${RED}✗ Frontend is not responding${NC}"
    echo "  Try: pm2 logs order-tracker-frontend"
fi

# Test database
echo ""
echo "Testing Database..."
if [ -f "api/prisma/dev.db" ]; then
    echo -e "${GREEN}✓ Database file exists${NC}"
    SIZE=$(du -h api/prisma/dev.db | cut -f1)
    echo "  Database size: $SIZE"
else
    echo -e "${RED}✗ Database file not found${NC}"
    echo "  Try: cd api && npx prisma migrate deploy"
fi

# Check PM2 status
echo ""
echo "PM2 Process Status:"
pm2 list

# Test external connectivity
echo ""
echo "Testing External Access..."
echo "You should be able to access:"
echo "  Frontend: http://50.19.66.100:3000"
echo "  Backend:  http://50.19.66.100:4000"
echo ""
echo "From your local machine, try:"
echo "  curl http://50.19.66.100:3000"
echo "  curl http://50.19.66.100:4000"

# Check for common issues
echo ""
echo "Checking for Common Issues..."

# Check if ports are listening
if netstat -tuln | grep -q ":3000 "; then
    echo -e "${GREEN}✓ Port 3000 is listening${NC}"
else
    echo -e "${RED}✗ Port 3000 is not listening${NC}"
fi

if netstat -tuln | grep -q ":4000 "; then
    echo -e "${GREEN}✓ Port 4000 is listening${NC}"
else
    echo -e "${RED}✗ Port 4000 is not listening${NC}"
fi

# Check Node version
echo ""
NODE_VERSION=$(node -v)
echo "Node.js version: $NODE_VERSION"
if [[ $NODE_VERSION == v20* ]] || [[ $NODE_VERSION == v18* ]]; then
    echo -e "${GREEN}✓ Node.js version is compatible${NC}"
else
    echo -e "${RED}✗ Node.js version may be incompatible${NC}"
fi

echo ""
echo "================================"
echo "Test Complete"
echo "================================"
echo ""
echo "If all tests passed, your deployment is successful!"
echo "If any tests failed, check the logs with: pm2 logs"