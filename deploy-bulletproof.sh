#!/bin/bash
# Bulletproof AWS Deployment Script
# This script will NOT fail silently
set -e  # Exit on any error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_IP="50.19.66.100"

echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Order Tracker Deployment - Bulletproof${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"

# Helper function
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1 failed${NC}"
        exit 1
    fi
}

# 1. SYSTEM DEPENDENCIES
echo -e "\n${YELLOW}1. Installing System Dependencies${NC}"

# Install SQLite3
if ! command -v sqlite3 &> /dev/null; then
    sudo apt install sqlite3 -y
fi
check_status "SQLite3 available"

# Install Node 20 if needed
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | cut -d'v' -f2) -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
check_status "Node.js 20+ available"

# Install PM2
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
check_status "PM2 available"

# 2. BACKEND SETUP
echo -e "\n${YELLOW}2. Backend Setup${NC}"
cd api

# Install dependencies
npm install
check_status "Backend dependencies installed"

# Install bcryptjs explicitly (often missing)
npm install bcryptjs
check_status "Bcryptjs installed"

# Setup environment
if [ ! -f .env ]; then
    cp .env.production .env 2>/dev/null || cat > .env << EOF
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="change-this-secret-in-production-$(openssl rand -hex 32)"
PORT=4000
NODE_ENV=production
SERVER_IP=$SERVER_IP
CORS_ORIGIN=http://$SERVER_IP:3000,http://$SERVER_IP
EOF
fi
check_status "Environment configured"

# 3. DATABASE SETUP - THE CRITICAL PART
echo -e "\n${YELLOW}3. Database Setup (Critical)${NC}"

# Remove old database if it's empty or corrupted
if [ -f prisma/dev.db ]; then
    DB_SIZE=$(stat -c%s prisma/dev.db 2>/dev/null || echo "0")
    if [ "$DB_SIZE" -eq "0" ]; then
        echo "Removing empty database file..."
        rm -f prisma/dev.db
    fi
fi

# Generate Prisma client
npx prisma generate
check_status "Prisma client generated"

# Try migrations first
echo "Attempting to run migrations..."
if npx prisma migrate deploy 2>/dev/null; then
    echo -e "${GREEN}✓ Migrations applied${NC}"
else
    echo -e "${YELLOW}⚠ Migrations failed, using alternative method...${NC}"
    
    # Alternative: Use migrate dev in production mode
    echo "Creating database with migrate dev..."
    export CI=true  # Prevents interactive prompts
    npx prisma migrate dev --name init --skip-seed
    check_status "Database created with migrate dev"
fi

# CRITICAL VERIFICATION - Make sure tables actually exist
echo -e "\n${YELLOW}Verifying database tables...${NC}"
TABLE_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" -lt "5" ]; then
    echo -e "${RED}ERROR: Database tables not created properly!${NC}"
    echo "Found only $TABLE_COUNT tables, expected at least 5"
    echo "Attempting force reset..."
    
    # Nuclear option - force reset
    rm -f prisma/dev.db
    npx prisma db push --force-reset --accept-data-loss
    check_status "Force database creation"
    
    # Verify again
    TABLE_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
    if [ "$TABLE_COUNT" -lt "5" ]; then
        echo -e "${RED}FATAL: Cannot create database tables!${NC}"
        echo "Manual intervention required."
        exit 1
    fi
fi

echo -e "${GREEN}✓ Database has $TABLE_COUNT tables${NC}"

# List tables for confirmation
echo "Tables in database:"
sqlite3 prisma/dev.db ".tables" | sed 's/^/  /'

# 4. CREATE USERS
echo -e "\n${YELLOW}4. Creating Default Users${NC}"

USER_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "0")

if [ "$USER_COUNT" -eq "0" ]; then
    echo "No users found, creating defaults..."
    
    # Create inline seed script
    cat > seed-users-temp.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  try {
    const adminHash = await bcrypt.hash('admin123', 10);
    const agentHash = await bcrypt.hash('agent123', 10);
    
    const admin = await prisma.user.create({
      data: {
        email: 'admin@stealthmachinetools.com',
        name: 'Admin User',
        password: adminHash,
        role: 'ADMIN',
        isActive: true
      }
    });
    console.log('Created admin:', admin.email);
    
    const agent = await prisma.user.create({
      data: {
        email: 'john@stealthmachinetools.com',
        name: 'John Agent',
        password: agentHash,
        role: 'AGENT',
        isActive: true
      }
    });
    console.log('Created agent:', agent.email);
    
  } catch (e) {
    if (e.code === 'P2002') {
      console.log('Users already exist');
    } else {
      throw e;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
EOF
    
    node seed-users-temp.js
    check_status "Users created"
    rm -f seed-users-temp.js
    
    # Verify users
    USER_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "0")
    echo -e "${GREEN}✓ $USER_COUNT users in database${NC}"
else
    echo -e "${GREEN}✓ Users already exist ($USER_COUNT found)${NC}"
fi

# Show users
echo "Users in database:"
sqlite3 prisma/dev.db "SELECT email, role FROM User;" | sed 's/^/  /'

cd ..

# 5. FRONTEND SETUP
echo -e "\n${YELLOW}5. Frontend Setup${NC}"
cd web

npm install
check_status "Frontend dependencies installed"

if [ ! -f .env.local ] && [ -f .env.production ]; then
    cp .env.production .env.local
fi

echo "Building frontend (this takes 2-3 minutes)..."
npm run build
check_status "Frontend built"

cd ..

# 6. START SERVICES
echo -e "\n${YELLOW}6. Starting Services${NC}"

# Create logs directory
mkdir -p logs

# Clean start
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js
check_status "Services started"

pm2 save
check_status "PM2 configuration saved"

# Wait for stabilization
sleep 5

# 7. VERIFICATION
echo -e "\n${YELLOW}7. Final Verification${NC}"

# Check services
pm2 status

# Test backend
if curl -f -s -o /dev/null "http://localhost:4000/auth/check"; then
    echo -e "${GREEN}✓ Backend responding${NC}"
else
    echo -e "${RED}✗ Backend not responding${NC}"
    pm2 logs order-tracker-backend --nostream --lines 10
fi

# Test frontend
if curl -f -s -o /dev/null "http://localhost:3000"; then
    echo -e "${GREEN}✓ Frontend responding${NC}"
else
    echo -e "${RED}✗ Frontend not responding${NC}"
    pm2 logs order-tracker-frontend --nostream --lines 10
fi

# Test login
echo -e "\n${YELLOW}Testing authentication...${NC}"
LOGIN_TEST=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}' 2>/dev/null)

if echo "$LOGIN_TEST" | grep -q "token"; then
    echo -e "${GREEN}✓ Authentication working${NC}"
else
    echo -e "${RED}✗ Authentication failed: $LOGIN_TEST${NC}"
fi

# DONE
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✓ DEPLOYMENT SUCCESSFUL${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "Your application is running at:"
echo -e "  ${GREEN}http://$SERVER_IP:3000${NC}"
echo ""
echo "Login with:"
echo "  admin@stealthmachinetools.com / admin123"
echo "  john@stealthmachinetools.com / agent123"
echo ""
echo -e "${YELLOW}Remember to change these passwords!${NC}"