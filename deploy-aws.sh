#!/bin/bash
# AWS Deployment Script for Order Tracker

# Configuration
SERVER_IP="$1"

if [ -z "$SERVER_IP" ]; then
  echo "Usage: ./deploy-aws.sh YOUR_SERVER_IP"
  exit 1
fi

echo "Deploying Order Tracker to AWS Server: $SERVER_IP"

# Update all configuration files with actual IP
echo "Updating configuration files..."

# Update backend .env
if [ -f "api/.env.production" ]; then
  sed -i "s/YOUR_SERVER_IP/$SERVER_IP/g" api/.env.production
  cp api/.env.production api/.env
fi

# Update frontend .env
if [ -f "web/.env.production" ]; then
  sed -i "s/YOUR_SERVER_IP/$SERVER_IP/g" web/.env.production
fi

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
echo "\nUse 'pm2 status' to check service status"
echo "Use 'pm2 logs' to view logs"