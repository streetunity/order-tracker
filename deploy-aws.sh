#!/bin/bash
# AWS Deployment Script for Order Tracker - FIXED VERSION
# This script includes all fixes for database permissions and measurements

set -e  # Exit on any error

# Configuration
SERVER_IP="50.19.66.100"
DEPLOY_DIR="/var/www/order-tracker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Order Tracker AWS Deployment ===${NC}"
echo "Server IP: $SERVER_IP"
echo "Deploy Directory: $DEPLOY_DIR"
echo ""

# Function to check and report status
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1"
        exit 1
    fi
}

# 1. Install system dependencies
echo -e "${YELLOW}Installing system dependencies...${NC}"
sudo apt update
sudo apt install -y sqlite3 build-essential
check_status "System dependencies installed"

# Verify SQLite3 is installed
if ! command -v sqlite3 &> /dev/null; then
    echo -e "${RED}ERROR: SQLite3 installation failed!${NC}"
    exit 1
fi
echo "SQLite3 version: $(sqlite3 --version)"

# 2. Setup Backend
echo -e "\n${YELLOW}Setting up backend...${NC}"
cd "$DEPLOY_DIR/api"

# Install dependencies
npm install
check_status "Backend dependencies installed"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating API .env file..."
    cat > .env << EOF
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=jwt-secret-$(openssl rand -hex 32)
PORT=4000
CORS_ORIGIN=http://$SERVER_IP:3000,http://$SERVER_IP
SERVER_IP=$SERVER_IP
EOF
    check_status "API .env file created"
else
    echo "API .env file already exists"
    # Ensure JWT_SECRET is set
    if ! grep -q "JWT_SECRET" .env; then
        echo "JWT_SECRET=jwt-secret-$(openssl rand -hex 32)" >> .env
        echo "Added missing JWT_SECRET"
    fi
fi

# Generate Prisma client
npx prisma generate
check_status "Prisma client generated"

# Create the database directory if it doesn't exist
mkdir -p prisma

# Run migrations
echo "Running database migrations..."
npx prisma migrate deploy || npx prisma db push
check_status "Database migrations completed"

# CRITICAL FIX: Set proper database permissions
echo -e "\n${YELLOW}Setting database permissions...${NC}"
if [ -f prisma/dev.db ]; then
    # Make database writable by the application
    sudo chown ubuntu:ubuntu prisma/dev.db
    sudo chmod 664 prisma/dev.db
    # Also fix directory permissions (SQLite needs write access to directory)
    sudo chown ubuntu:ubuntu prisma/
    sudo chmod 775 prisma/
    check_status "Database permissions fixed"
else
    echo -e "${RED}Warning: Database file not found${NC}"
fi

# Seed the database
echo "Seeding database..."
node prisma/seed.js || echo "Seeding might have already been done"

# 3. Apply measurement fix to API
echo -e "\n${YELLOW}Applying measurement data type fix...${NC}"
# Fix the measurement endpoint to handle string-to-number conversion
if ! grep -q "parseFloat" src/index.js; then
    # Backup original
    cp src/index.js src/index.js.backup.$(date +%Y%m%d)
    
    # Apply fix for measurement endpoint (around line 306-309)
    sed -i 's/height: height !== undefined ? height : item\.height,/height: height !== undefined ? (height === null || height === "" ? null : parseFloat(height)) : item.height,/' src/index.js
    sed -i 's/width: width !== undefined ? width : item\.width,/width: width !== undefined ? (width === null || width === "" ? null : parseFloat(width)) : item.width,/' src/index.js
    sed -i 's/length: length !== undefined ? length : item\.length,/length: length !== undefined ? (length === null || length === "" ? null : parseFloat(length)) : item.length,/' src/index.js
    sed -i 's/weight: weight !== undefined ? weight : item\.weight,/weight: weight !== undefined ? (weight === null || weight === "" ? null : parseFloat(weight)) : item.weight,/' src/index.js
    
    check_status "Measurement fix applied"
else
    echo "Measurement fix already applied"
fi

cd ..

# 4. Setup Frontend
echo -e "\n${YELLOW}Setting up frontend...${NC}"
cd "$DEPLOY_DIR/web"

# Create proper .env.local file
echo "Creating frontend .env.local file..."
cat > .env.local << EOF
NEXT_PUBLIC_API_BASE=http://$SERVER_IP:4000
NEXT_PUBLIC_API_URL=http://$SERVER_IP:4000
API_BASE=http://localhost:4000
EOF
check_status "Frontend .env.local created"

# Install dependencies
npm install
check_status "Frontend dependencies installed"

# Build frontend
echo "Building frontend (this may take a few minutes)..."
npm run build
check_status "Frontend built successfully"

cd ..

# 5. Create logs directory
mkdir -p logs

# 6. Setup PM2
echo -e "\n${YELLOW}Starting services with PM2...${NC}"

# Stop any existing processes
pm2 delete all 2>/dev/null || true

# Start backend
cd api
pm2 start npm --name order-tracker-backend -- run dev
check_status "Backend started"

cd ../web
pm2 start npm --name order-tracker-frontend -- start
check_status "Frontend started"

cd ..

# Save PM2 configuration
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

# 7. Verify everything is working
echo -e "\n${YELLOW}Verifying deployment...${NC}"
sleep 5  # Give services time to start

# Check PM2 status
pm2 list

# Test API endpoint
if curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/auth/check | grep -q "200"; then
    echo -e "${GREEN}✓${NC} API is responding"
else
    echo -e "${RED}✗${NC} API is not responding"
    echo "Check logs with: pm2 logs order-tracker-backend"
fi

# Test login endpoint
echo -e "\n${YELLOW}Testing login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo -e "${GREEN}✓${NC} Login is working!"
else
    echo -e "${RED}✗${NC} Login failed. Response: $LOGIN_RESPONSE"
    echo "Attempting to fix..."
    
    # Try to fix database permissions again
    cd api
    sudo chown ubuntu:ubuntu prisma/dev.db
    sudo chmod 664 prisma/dev.db
    pm2 restart order-tracker-backend
    cd ..
fi

# Final status report
echo ""
echo -e "${GREEN}=================================="
echo "       DEPLOYMENT COMPLETE!        "
echo "==================================${NC}"
echo ""
echo "Frontend: http://$SERVER_IP:3000"
echo "Backend: http://$SERVER_IP:4000"
echo ""
echo "Default credentials:"
echo "  Admin: admin@stealthmachinetools.com / admin123"
echo ""
echo -e "${YELLOW}IMPORTANT: Change the default password immediately!${NC}"
echo ""
echo "Useful commands:"
echo "  pm2 status         - Check service status"
echo "  pm2 logs           - View all logs"
echo "  pm2 logs order-tracker-backend   - View API logs"
echo "  pm2 logs order-tracker-frontend  - View frontend logs"
echo "  pm2 restart all    - Restart all services"
echo ""
echo "Database:"
echo "  sqlite3 api/prisma/dev.db  - Access database"
echo ""

# Create a post-deployment verification script
cat > verify-deployment.sh << 'VERIFY_EOF'
#!/bin/bash
echo "=== Deployment Verification ==="
echo ""
echo "1. Database Permissions:"
ls -la /var/www/order-tracker/api/prisma/dev.db
echo ""
echo "2. Environment Files:"
echo "   API .env: $([ -f /var/www/order-tracker/api/.env ] && echo '✓ Exists' || echo '✗ Missing')"
echo "   JWT_SECRET: $(grep -q JWT_SECRET /var/www/order-tracker/api/.env 2>/dev/null && echo '✓ Set' || echo '✗ Not set')"
echo "   Frontend .env.local: $([ -f /var/www/order-tracker/web/.env.local ] && echo '✓ Exists' || echo '✗ Missing')"
echo ""
echo "3. PM2 Status:"
pm2 status
echo ""
echo "4. API Test:"
curl -s http://localhost:4000/auth/check
echo ""
echo ""
echo "5. Login Test:"
curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}' | \
  (grep -q "token" && echo "✓ Login working" || echo "✗ Login failed")
VERIFY_EOF

chmod +x verify-deployment.sh

echo -e "\n${GREEN}Run './verify-deployment.sh' anytime to check system health${NC}"