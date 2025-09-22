#!/bin/bash

# Diagnostic script to troubleshoot login issues

echo "==========================================="
echo "Login Issue Diagnostic"
echo "==========================================="

APP_DIR="/var/www/order-tracker"

echo ""
echo "1. Checking if database exists..."
if [ -f "$APP_DIR/api/prisma/dev.db" ]; then
    echo "✓ Database file exists"
    ls -lh $APP_DIR/api/prisma/dev.db
else
    echo "✗ Database file NOT found!"
fi

echo ""
echo "2. Checking database tables..."
cd $APP_DIR/api
sqlite3 prisma/dev.db ".tables" 2>/dev/null || echo "✗ Could not read database"

echo ""
echo "3. Checking User table schema..."
sqlite3 prisma/dev.db ".schema User" 2>/dev/null || echo "✗ Could not read User schema"

echo ""
echo "4. Listing users in database..."
sqlite3 prisma/dev.db "SELECT id, email, role, isActive FROM User;" 2>/dev/null || echo "✗ No users found"

echo ""
echo "5. Checking if bcryptjs is installed..."
cd $APP_DIR/api
if npm list bcryptjs &>/dev/null; then
    echo "✓ bcryptjs is installed"
else
    echo "✗ bcryptjs NOT installed - Installing now..."
    npm install bcryptjs
fi

echo ""
echo "6. Testing password hash..."
node -e "
const bcrypt = require('bcryptjs');
const testPassword = 'admin123';
const hash = bcrypt.hashSync(testPassword, 10);
console.log('Test password hash:', hash);
console.log('Hash valid:', bcrypt.compareSync(testPassword, hash));
" 2>/dev/null || echo "✗ bcryptjs test failed"

echo ""
echo "7. Checking backend service..."
pm2 status order-tracker-backend

echo ""
echo "8. Checking recent backend logs for login errors..."
pm2 logs order-tracker-backend --lines 20 --nostream | grep -E "login|auth|error" || echo "No auth-related logs found"

echo ""
echo "9. Testing backend login endpoint..."
echo "Testing with: admin@stealthmachinetools.com / admin123"
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}' \
  -w "\nHTTP Status: %{http_code}\n" \
  2>/dev/null || echo "✗ Could not reach backend"

echo ""
echo "10. Resetting admin user password..."
cd $APP_DIR/api
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function resetPassword() {
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const user = await prisma.user.upsert({
      where: { email: 'admin@stealthmachinetools.com' },
      update: { 
        password: hashedPassword,
        isActive: true
      },
      create: {
        email: 'admin@stealthmachinetools.com',
        password: hashedPassword,
        name: 'Admin User',
        role: 'ADMIN',
        isActive: true
      }
    });
    console.log('✓ Admin user reset successfully:', user.email);
    
    // Also create agent user
    const agentPassword = await bcrypt.hash('agent123', 10);
    const agent = await prisma.user.upsert({
      where: { email: 'john@stealthmachinetools.com' },
      update: { 
        password: agentPassword,
        isActive: true
      },
      create: {
        email: 'john@stealthmachinetools.com',
        password: agentPassword,
        name: 'John Doe',
        role: 'AGENT',
        isActive: true
      }
    });
    console.log('✓ Agent user reset successfully:', agent.email);
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Error resetting password:', error.message);
    process.exit(1);
  }
}

resetPassword();
" 2>&1

echo ""
echo "11. Testing login again after reset..."
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}' \
  -w "\nHTTP Status: %{http_code}\n" \
  2>/dev/null || echo "✗ Could not reach backend"

echo ""
echo "12. Checking environment variables..."
cd $APP_DIR/api
if [ -f .env ]; then
    echo "API .env file:"
    grep -E "JWT_SECRET|DATABASE_URL" .env | sed 's/JWT_SECRET=.*/JWT_SECRET=<hidden>/'
else
    echo "✗ No .env file found"
fi

echo ""
echo "==========================================="
echo "Diagnostic Complete"
echo "==========================================="
echo ""
echo "If login still fails, try:"
echo "1. Restart backend: pm2 restart order-tracker-backend"
echo "2. Check full logs: pm2 logs order-tracker-backend"
echo "3. Test from browser: http://YOUR_IP:3000"
echo ""
