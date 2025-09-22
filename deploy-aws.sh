#!/bin/bash
# AWS Deployment Script for Order Tracker
# Pre-configured for your server with SQLite3 support

# Configuration
SERVER_IP="50.19.66.100"

echo "Deploying Order Tracker to AWS Server: $SERVER_IP"

# Install system dependencies first
echo "Installing system dependencies..."
sudo apt update
sudo apt install -y sqlite3 build-essential

# Verify SQLite3 is installed
if ! command -v sqlite3 &> /dev/null; then
    echo "ERROR: SQLite3 installation failed!"
    exit 1
fi
echo "SQLite3 installed: $(sqlite3 --version)"

# Copy production env files
echo "Setting up environment files..."
cp api/.env.production api/.env
cp web/.env.production web/.env.local

# Backend setup
echo "Setting up backend..."
cd api

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create the database directory if it doesn't exist
mkdir -p prisma

# Run migrations (this creates the database and tables)
echo "Running database migrations..."
npx prisma migrate deploy

# Seed the database
echo "Seeding database..."
node prisma/seed.js

cd ..

# Frontend setup
echo "Building frontend..."
cd web
npm install
npm run build
cd ..

# Create logs directory
mkdir -p logs

# Start with PM2
echo "Starting services with PM2..."
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=================================="
echo "Deployment complete!"
echo "=================================="
echo "Frontend: http://$SERVER_IP:3000"
echo "Backend: http://$SERVER_IP:4000"
echo ""
echo "Default credentials:"
echo "Admin: admin@stealthmachinetools.com / admin123"
echo "Agent: john@stealthmachinetools.com / agent123"
echo ""
echo "IMPORTANT: Change these default passwords immediately!"
echo ""
echo "Use 'pm2 status' to check service status"
echo "Use 'pm2 logs' to view logs"
echo "Use 'sqlite3 api/prisma/dev.db' to access database"