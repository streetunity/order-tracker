#!/bin/bash
# Reset Database Script - Clears all data and reseeds with default users
# WARNING: This will DELETE ALL DATA in the database!

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}=== DATABASE RESET SCRIPT ===${NC}"
echo -e "${RED}WARNING: This will DELETE ALL DATA in the database!${NC}"
echo ""
echo "This script will:"
echo "  1. Delete all orders, items, and accounts"
echo "  2. Delete all users"
echo "  3. Re-create default admin user"
echo "  4. Leave a completely clean database"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "Reset cancelled."
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting database reset...${NC}"

cd /var/www/order-tracker

# Stop the backend to prevent conflicts
echo "Stopping backend service..."
pm2 stop order-tracker-backend 2>/dev/null || true

# Backup current database just in case
if [ -f api/prisma/dev.db ]; then
    backup_file="api/prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Creating backup at: $backup_file"
    cp api/prisma/dev.db "$backup_file"
    echo -e "${GREEN}✓${NC} Backup created"
fi

cd api

# Method 1: Complete reset using Prisma
echo ""
echo -e "${YELLOW}Resetting database schema...${NC}"

# Remove the database file
rm -f prisma/dev.db
rm -f prisma/dev.db-journal

# Recreate database with schema
echo "Creating fresh database..."
npx prisma db push --force-reset

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create database. Trying alternative method...${NC}"
    npx prisma migrate reset --force --skip-seed
fi

# Set proper permissions
echo "Setting database permissions..."
sudo chown ubuntu:ubuntu prisma/dev.db 2>/dev/null || chown ubuntu:ubuntu prisma/dev.db
sudo chmod 664 prisma/dev.db 2>/dev/null || chmod 664 prisma/dev.db
echo -e "${GREEN}✓${NC} Database permissions set"

# Run the seed script to create default users
echo ""
echo -e "${YELLOW}Creating default users...${NC}"
node prisma/seed.js

if [ $? -ne 0 ]; then
    echo -e "${RED}Seed script failed. Creating users manually...${NC}"
    
    # Manual user creation as fallback
    cat > temp-seed.js << 'EOF'
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: 'admin@stealthmachinetools.com',
        password: adminPassword,
        name: 'Admin User',
        role: 'ADMIN',
        isActive: true
      }
    });
    console.log('✓ Admin user created');
    
    // Optional: Create an agent user for testing
    const agentPassword = await bcrypt.hash('agent123', 10);
    await prisma.user.create({
      data: {
        email: 'john@stealthmachinetools.com',
        password: agentPassword,
        name: 'John Agent',
        role: 'AGENT',
        isActive: true
      }
    });
    console.log('✓ Agent user created');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
EOF
    
    node temp-seed.js
    rm temp-seed.js
fi

# Verify the reset worked
echo ""
echo -e "${YELLOW}Verifying database reset...${NC}"

# Check if database exists and has correct size
if [ -f prisma/dev.db ]; then
    db_size=$(du -h prisma/dev.db | cut -f1)
    echo -e "${GREEN}✓${NC} Database exists (size: $db_size)"
    
    # Count records
    user_count=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "0")
    order_count=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM \"Order\";" 2>/dev/null || echo "0")
    account_count=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Account;" 2>/dev/null || echo "0")
    
    echo -e "${GREEN}✓${NC} Users in database: $user_count"
    echo -e "${GREEN}✓${NC} Orders in database: $order_count"
    echo -e "${GREEN}✓${NC} Accounts in database: $account_count"
    
    # List users
    echo ""
    echo "Users in database:"
    sqlite3 prisma/dev.db "SELECT email, name, role FROM User;" 2>/dev/null || echo "Could not query users"
else
    echo -e "${RED}✗${NC} Database file not found!"
    exit 1
fi

# Restart the backend
echo ""
echo "Restarting backend service..."
pm2 restart order-tracker-backend

# Test login
echo ""
echo -e "${YELLOW}Testing login...${NC}"
sleep 3  # Give the backend time to start

login_response=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}')

if echo "$login_response" | grep -q "token"; then
    echo -e "${GREEN}✓${NC} Login test successful!"
else
    echo -e "${YELLOW}!${NC} Login test failed. You may need to wait a moment for the backend to fully start."
    echo "   Response: $login_response"
fi

echo ""
echo -e "${GREEN}=== DATABASE RESET COMPLETE ===${NC}"
echo ""
echo "The database has been reset to a clean state with:"
echo "  • Admin user: admin@stealthmachinetools.com / admin123"
echo "  • Agent user: john@stealthmachinetools.com / agent123"
echo ""
echo "All other data has been removed:"
echo "  • All orders deleted"
echo "  • All items deleted"
echo "  • All accounts deleted"
echo "  • All audit logs cleared"
echo ""
echo -e "${YELLOW}Remember to change the default passwords in production!${NC}"
echo ""
echo "Backup saved at: $backup_file"
echo "To restore the backup if needed:"
echo "  cp $backup_file api/prisma/dev.db"
echo "  pm2 restart order-tracker-backend"