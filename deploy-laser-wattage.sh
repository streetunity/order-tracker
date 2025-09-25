#!/bin/bash

# Master deployment script for adding Laser Source Wattage field
# Run this script from the project root on your AWS server

echo "=========================================="
echo "Adding Laser Source Wattage Field"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "api" ] || [ ! -d "web" ]; then
    echo "Error: Please run this script from the project root directory"
    echo "Expected structure: /var/www/order-tracker/"
    exit 1
fi

echo "Step 1: Pulling latest changes from Git..."
git pull origin aws-deployment

echo ""
echo "Step 2: Updating database schema..."
cd api

# Apply the migration
echo "Running database migration..."
npx prisma migrate deploy

# Generate Prisma client
echo "Regenerating Prisma client..."
npx prisma generate

echo ""
echo "Step 3: Updating API backend..."
# Run the API update script
node update-api-laser-wattage.js

echo ""
echo "Step 4: Updating frontend..."
cd ../web

# Run the frontend update script
node update-frontend-laser-wattage.js

echo ""
echo "Step 5: Building frontend..."
npm run build

echo ""
echo "Step 6: Restarting services..."
pm2 restart order-tracker-backend
pm2 restart order-tracker-frontend

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "The Laser Source Wattage field has been added to:"
echo "- Database schema (OrderItem table)"
echo "- API endpoints (create, update, read)"
echo "- Edit Order page (item table and forms)"
echo "- New Order page (item creation)"
echo ""
echo "The field is:"
echo "- Optional (can be left blank)"
echo "- Text-based (like voltage field)"
echo "- Displayed in the item table"
echo "- Included in tooltips on the board"
echo ""
echo "Please test the following:"
echo "1. Add a new order with items including laser wattage"
echo "2. Edit existing items to add laser wattage"
echo "3. Verify the field appears in the table"
echo "4. Check that it saves and loads correctly"