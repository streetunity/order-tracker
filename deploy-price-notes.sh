#!/bin/bash

echo "====================================="
echo "Deploying Price and Private Notes Update"
echo "====================================="

# Navigate to project directory
cd /var/www/order-tracker

# Pull latest changes
echo "1. Pulling latest changes from GitHub..."
git pull origin aws-deployment

# Run database migration
echo "2. Running database migration..."
cd api
npx prisma migrate deploy

# Update API with new endpoints
echo "3. Updating API with new endpoints..."
chmod +x add-price-private-notes.sh
./add-price-private-notes.sh

# Update frontend
echo "4. Updating frontend components..."
cd ../web
node update-frontend-price-notes.js

# Rebuild frontend
echo "5. Building frontend..."
npm run build

# Restart services
echo "6. Restarting services..."
pm2 restart all

# Check status
echo "7. Checking service status..."
pm2 status

echo "====================================="
echo "Deployment Complete!"
echo "====================================="
echo ""
echo "New features added:"
echo "  - Item Price field (admin only, editable even when locked)"
echo "  - Private Item Notes field (admin only, editable even when locked)"
echo "  - Yearly total display on Board page (admin only)"
echo ""
echo "Please test the following:"
echo "  1. Edit an order and verify the second row appears under each item"
echo "  2. Add price and private notes to an item"
echo "  3. Lock the order and verify admins can still edit price/notes"
echo "  4. Check the Board page for the yearly total display"