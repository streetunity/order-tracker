#!/bin/bash
# Robust AWS Deployment Script with Error Checking
set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_IP="50.19.66.100"

echo -e "${GREEN}Starting Order Tracker Deployment${NC}"

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1 failed${NC}"
        exit 1
    fi
}

# Install system dependencies
echo -e "${YELLOW}Checking system dependencies...${NC}"
if ! command -v sqlite3 &> /dev/null; then
    sudo apt install sqlite3 -y
    check_status "SQLite3 installation"
fi

# Backend Setup
echo -e "${YELLOW}Setting up backend...${NC}"
cd api

# Install dependencies
npm install
check_status "Backend dependencies installation"

# Setup environment
if [ ! -f .env ]; then
    cp .env.production .env 2>/dev/null || cat > .env << EOF
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="change-this-secret-key-in-production-$(openssl rand -hex 32)"
PORT=4000
NODE_ENV=production
SERVER_IP=$SERVER_IP
CORS_ORIGIN=http://$SERVER_IP:3000,http://$SERVER_IP
EOF
    check_status "Environment file creation"
fi

# Database Setup
echo -e "${YELLOW}Setting up database...${NC}"

# Generate Prisma Client
npx prisma generate
check_status "Prisma client generation"

# Check if migrations exist
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations)" ]; then
    echo "Running migrations..."
    npx prisma migrate deploy
    check_status "Database migrations"
else
    echo "No migrations found, pushing schema directly..."
    npx prisma db push --accept-data-loss
    check_status "Database schema push"
fi

# Verify tables exist
TABLE_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
if [ "$TABLE_COUNT" -lt "2" ]; then
    echo -e "${RED}Database tables not created properly!${NC}"
    echo "Attempting to force create..."
    npx prisma db push --force-reset --accept-data-loss
    check_status "Force database creation"
fi

# Create default users
echo -e "${YELLOW}Creating default users...${NC}"

# Check if users exist
USER_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "0")

if [ "$USER_COUNT" -eq "0" ]; then
    echo "Creating default users..."
    
    # Create seed script if it doesn't exist
    if [ ! -f "prisma/seed.js" ]; then
        cat > prisma/seed-users.js << 'SEEDEOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const agentHash = await bcrypt.hash('agent123', 10);
  
  await prisma.user.upsert({
    where: { email: 'admin@stealthmachinetools.com' },
    update: {},
    create: {
      email: 'admin@stealthmachinetools.com',
      name: 'Admin User',
      password: adminHash,
      role: 'ADMIN',
      isActive: true
    }
  });
  
  await prisma.user.upsert({
    where: { email: 'john@stealthmachinetools.com' },
    update: {},
    create: {
      email: 'john@stealthmachinetools.com',
      name: 'John Agent',
      password: agentHash,
      role: 'AGENT',
      isActive: true
    }
  });
  
  console.log('Default users created');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
SEEDEOF
        
        # Ensure bcryptjs is installed
        npm install bcryptjs --save
        
        # Run seed
        node prisma/seed-users.js
        check_status "User creation"
    else
        node prisma/seed.js
        check_status "User seeding"
    fi
    
    # Verify users were created
    USER_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "0")
    if [ "$USER_COUNT" -eq "0" ]; then
        echo -e "${RED}Failed to create users!${NC}"
        exit 1
    fi
    echo -e "${GREEN}Created $USER_COUNT users${NC}"
else
    echo -e "${GREEN}Users already exist ($USER_COUNT found)${NC}"
fi

cd ..

# Frontend Setup
echo -e "${YELLOW}Setting up frontend...${NC}"
cd web

# Install dependencies
npm install
check_status "Frontend dependencies installation"

# Setup environment
if [ ! -f .env.local ]; then
    cp .env.production .env.local 2>/dev/null || echo "NEXT_PUBLIC_API_URL=http://$SERVER_IP:4000" > .env.local
fi

# Build frontend
echo "Building frontend (this may take a few minutes)..."
npm run build
check_status "Frontend build"

cd ..

# Create logs directory
mkdir -p logs

# PM2 Setup
echo -e "${YELLOW}Starting services with PM2...${NC}"

# Stop any existing processes
pm2 delete all 2>/dev/null || true

# Start services
pm2 start ecosystem.config.js
check_status "PM2 startup"

# Save PM2 config
pm2 save
check_status "PM2 configuration save"

# Wait for services to stabilize
echo "Waiting for services to start..."
sleep 5

# Verify services are running
pm2 status

# Test endpoints
echo -e "${YELLOW}Testing endpoints...${NC}"

# Test backend
if curl -f -s -o /dev/null http://localhost:4000/auth/check; then
    echo -e "${GREEN}✓ Backend is responding${NC}"
else
    echo -e "${RED}✗ Backend not responding${NC}"
    pm2 logs order-tracker-backend --nostream --lines 20
fi

# Test frontend
if curl -f -s -o /dev/null http://localhost:3000; then
    echo -e "${GREEN}✓ Frontend is responding${NC}"
else
    echo -e "${RED}✗ Frontend not responding${NC}"
    pm2 logs order-tracker-frontend --nostream --lines 20
fi

# Test login
echo -e "${YELLOW}Testing login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo -e "${GREEN}✓ Login successful${NC}"
else
    echo -e "${RED}✗ Login failed: $LOGIN_RESPONSE${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "Access your application at:"
echo -e "  Frontend: ${GREEN}http://$SERVER_IP:3000${NC}"
echo -e "  Backend:  ${GREEN}http://$SERVER_IP:4000${NC}"
echo ""
echo "Default credentials:"
echo "  Admin: admin@stealthmachinetools.com / admin123"
echo "  Agent: john@stealthmachinetools.com / agent123"
echo ""
echo -e "${YELLOW}⚠️  Remember to change default passwords!${NC}"
echo ""
echo "Useful commands:"
echo "  pm2 status    - Check service status"
echo "  pm2 logs      - View logs"
echo "  pm2 restart all - Restart services"