#!/bin/bash

# Fix database migration issues script
# Run this on the server to reset and properly migrate the database

set -e

echo "==========================================="
echo "Fixing Database Migration Issues"
echo "==========================================="

APP_DIR="/var/www/order-tracker"

# Stop services
echo "Stopping services..."
pm2 stop all || true

# Navigate to API directory
cd $APP_DIR/api

# Backup existing database if it exists
if [ -f "prisma/dev.db" ]; then
    echo "Backing up existing database..."
    cp prisma/dev.db prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)
fi

# Remove old database and migrations
echo "Removing old database..."
rm -f prisma/dev.db
rm -f prisma/dev.db-journal
rm -rf prisma/migrations

# Generate Prisma Client
echo "Generating Prisma Client..."
npx prisma generate

# Create new migration and apply it
echo "Creating fresh migration..."
npx prisma migrate dev --name init --skip-seed

# Alternative approach if migrate doesn't work
if [ $? -ne 0 ]; then
    echo "Using db push instead..."
    npx prisma db push --accept-data-loss
fi

# Seed the database
echo "Seeding database..."
node prisma/seed.js

# Verify the database structure
echo "Verifying database structure..."
sqlite3 prisma/dev.db ".schema OrderItem" | grep -i measurement || echo "WARNING: Measurement fields might be missing!"

# Restart services
echo "Restarting services..."
cd $APP_DIR
pm2 restart all

echo "==========================================="
echo "Database migration fix complete!"
echo "==========================================="
echo ""
echo "The database has been reset with the proper schema."
echo "Default users have been recreated:"
echo "  Admin: admin@stealthmachinetools.com / admin123"
echo "  Agent: john@stealthmachinetools.com / agent123"
echo ""
echo "Please test order creation now."
