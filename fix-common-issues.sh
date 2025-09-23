#!/bin/bash
# Common Issue Fixes for Order Tracker
# Run this if you encounter problems after deployment

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Order Tracker Issue Fixer ===${NC}"
echo ""

cd /var/www/order-tracker

# Fix 1: Database Permissions
echo -e "${YELLOW}1. Fixing database permissions...${NC}"
if [ -f api/prisma/dev.db ]; then
    sudo chown ubuntu:ubuntu api/prisma/dev.db
    sudo chmod 664 api/prisma/dev.db
    sudo chown ubuntu:ubuntu api/prisma/
    sudo chmod 775 api/prisma/
    echo -e "${GREEN}✓${NC} Database permissions fixed"
else
    echo -e "${RED}✗${NC} Database not found. Run: cd api && npx prisma db push && node prisma/seed.js"
fi
echo ""

# Fix 2: Environment Variables
echo -e "${YELLOW}2. Checking environment variables...${NC}"
if [ ! -f api/.env ]; then
    echo "Creating API .env file..."
    cat > api/.env << EOF
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=jwt-secret-$(openssl rand -hex 32)
PORT=4000
CORS_ORIGIN=http://50.19.66.100:3000,http://50.19.66.100
SERVER_IP=50.19.66.100
EOF
    echo -e "${GREEN}✓${NC} API .env created"
else
    if ! grep -q "JWT_SECRET" api/.env; then
        echo "JWT_SECRET=jwt-secret-$(openssl rand -hex 32)" >> api/.env
        echo -e "${GREEN}✓${NC} Added missing JWT_SECRET"
    else
        echo -e "${GREEN}✓${NC} API .env exists with JWT_SECRET"
    fi
fi

if [ ! -f web/.env.local ] || ! grep -q "50.19.66.100" web/.env.local; then
    echo "Fixing frontend .env.local..."
    cat > web/.env.local << EOF
NEXT_PUBLIC_API_BASE=http://50.19.66.100:4000
NEXT_PUBLIC_API_URL=http://50.19.66.100:4000
API_BASE=http://localhost:4000
EOF
    echo -e "${GREEN}✓${NC} Frontend .env.local fixed"
else
    echo -e "${GREEN}✓${NC} Frontend .env.local is correct"
fi
echo ""

# Fix 3: Measurement Data Types
echo -e "${YELLOW}3. Checking measurement fix...${NC}"
if ! grep -q "parseFloat" api/src/index.js; then
    echo "Applying measurement data type fix..."
    cd api
    cp src/index.js src/index.js.backup.$(date +%Y%m%d_%H%M%S)
    
    # Apply the measurement fix
    sed -i 's/height: height !== undefined ? height : item\.height,/height: height !== undefined ? (height === null || height === "" ? null : parseFloat(height)) : item.height,/' src/index.js
    sed -i 's/width: width !== undefined ? width : item\.width,/width: width !== undefined ? (width === null || width === "" ? null : parseFloat(width)) : item.width,/' src/index.js
    sed -i 's/length: length !== undefined ? length : item\.length,/length: length !== undefined ? (length === null || length === "" ? null : parseFloat(length)) : item.length,/' src/index.js
    sed -i 's/weight: weight !== undefined ? weight : item\.weight,/weight: weight !== undefined ? (weight === null || weight === "" ? null : parseFloat(weight)) : item.weight,/' src/index.js
    
    cd ..
    echo -e "${GREEN}✓${NC} Measurement fix applied"
else
    echo -e "${GREEN}✓${NC} Measurement fix already in place"
fi
echo ""

# Fix 4: Rebuild Frontend if needed
if [ ! -d web/.next ]; then
    echo -e "${YELLOW}4. Frontend needs building...${NC}"
    cd web
    npm run build
    cd ..
    echo -e "${GREEN}✓${NC} Frontend rebuilt"
else
    echo -e "${GREEN}✓${NC} 4. Frontend build exists"
fi
echo ""

# Fix 5: Restart Services
echo -e "${YELLOW}5. Restarting services...${NC}"
pm2 restart all
sleep 3
pm2 list
echo ""

# Test the fixes
echo -e "${YELLOW}6. Testing...${NC}"
login_response=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}')

if echo "$login_response" | grep -q "token"; then
    echo -e "${GREEN}✓ Login is working!${NC}"
else
    echo -e "${RED}✗ Login still not working${NC}"
    echo "Response: $login_response"
    echo ""
    echo "Manual debugging needed. Check:"
    echo "  1. PM2 logs: pm2 logs order-tracker-backend"
    echo "  2. Database exists: ls -la api/prisma/dev.db"
    echo "  3. JWT_SECRET is set: grep JWT_SECRET api/.env"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|304"; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${RED}✗ Frontend not responding${NC}"
    echo "Check: pm2 logs order-tracker-frontend"
fi

echo ""
echo -e "${GREEN}=== Fix Complete ===${NC}"
echo "Try accessing: http://50.19.66.100:3000"