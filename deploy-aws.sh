#!/bin/bash
# AWS Deployment Script for Order Tracker
# Pre-configured for your server

# Configuration
SERVER_IP="50.19.66.100"

echo "Deploying Order Tracker to AWS Server: $SERVER_IP"

# Copy production env files
echo "Setting up environment files..."
cp api/.env.production api/.env
cp web/.env.production web/.env.local

# Backend setup
echo "Setting up backend..."
cd api
npm install
npx prisma generate
npx prisma migrate deploy
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

echo "\nDeployment complete!"
echo "Frontend: http://$SERVER_IP:3000"
echo "Backend: http://$SERVER_IP:4000"
echo "\nDefault credentials:"
echo "Admin: admin@stealthmachinetools.com / admin123"
echo "Agent: john@stealthmachinetools.com / agent123"
echo "\nIMPORTANT: Change these default passwords immediately!"
echo "\nUse 'pm2 status' to check service status"
echo "Use 'pm2 logs' to view logs"