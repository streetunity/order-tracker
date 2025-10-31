#!/bin/bash
# Commission Settings Fix - Deployment Script
# This script pulls the latest changes and restarts the services

set -e  # Exit on any error

echo "🔄 Pulling latest changes from GitHub..."
cd /var/www/order-tracker
git pull origin aws-deployment

echo "🛠️ Rebuilding frontend..."
cd web
npm run build

echo "🔄 Restarting services..."
cd /var/www/order-tracker
pm2 restart all

echo "✅ Deployment complete!"
echo ""
echo "Changes applied:"
echo "  - Fixed commission settings API endpoints"
echo "  - Fixed sales reps display on Individual Rates tab"
echo "  - Fixed color scheme for tiered rates info box"
echo "  - Fixed save buttons for Global Settings and Stage Distribution"
echo "  - Added explicit CORS headers for Authorization"
echo "  - Added request logging for debugging"
echo ""
echo "If issues persist, check backend logs with: pm2 logs order-tracker-backend --lines 50"
