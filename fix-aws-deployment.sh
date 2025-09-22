#!/bin/bash
# Quick fix script for AWS deployment issues

echo "Quick Fix Script for Order Tracker AWS Deployment"
echo "=================================================="

# 1. Install SQLite3 if not installed
if ! command -v sqlite3 &> /dev/null; then
    echo "Installing SQLite3..."
    sudo apt update
    sudo apt install -y sqlite3 build-essential
fi

# 2. Pull latest changes from aws-deployment branch
echo "Pulling latest changes..."
git pull origin aws-deployment

# 3. Ensure environment files are set up correctly
echo "Setting up environment files..."
if [ -f web/.env.production ]; then
    cp web/.env.production web/.env.local
fi

if [ -f api/.env.production ]; then
    cp api/.env.production api/.env
fi

# 4. Clean and reinstall dependencies
echo "Cleaning and reinstalling dependencies..."

# Backend
cd api
rm -rf node_modules package-lock.json
npm install
npx prisma generate

# Check if database exists, if not run migrations
if [ ! -f prisma/dev.db ]; then
    echo "Database not found, running migrations..."
    npx prisma migrate deploy
    node prisma/seed.js
else
    echo "Database exists, ensuring schema is up to date..."
    npx prisma migrate deploy
fi

cd ..

# Frontend
cd web
rm -rf node_modules package-lock.json .next
npm install
npm run build
cd ..

# 5. Restart PM2 processes
echo "Restarting PM2 processes..."
pm2 stop all
pm2 delete all
pm2 start ecosystem.config.js
pm2 save

# 6. Verify services are running
echo ""
echo "Checking service status..."
pm2 status

echo ""
echo "=================================================="
echo "Fix script completed!"
echo ""
echo "Test the application:"
echo "- Frontend: http://50.19.66.100:3000"
echo "- Backend: http://50.19.66.100:4000"
echo ""
echo "If you still have issues, check logs with:"
echo "- pm2 logs order-tracker-backend"
echo "- pm2 logs order-tracker-frontend"
echo ""
echo "To test delete user functionality:"
echo "1. Login as admin (admin@stealthmachinetools.com / admin123)"
echo "2. Go to Admin → Users Management"
echo "3. Try deleting a non-admin user"