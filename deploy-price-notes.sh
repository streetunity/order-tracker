#!/bin/bash

echo "====================================="
echo "Deploying Price and Private Notes Update"
echo "====================================="

# Navigate to project directory
cd /var/www/order-tracker

# First, commit any local changes on the server
echo "1. Saving any local changes on server..."
git add -A
git commit -m "Save local changes before pulling updates" || true

# Pull latest changes
echo "2. Pulling latest changes from GitHub..."
git pull origin aws-deployment

# If there are conflicts, we need to resolve them
if [ $? -ne 0 ]; then
    echo "WARNING: Git pull failed. There may be conflicts."
    echo "Please resolve conflicts manually and re-run this script."
    exit 1
fi

# Run database migration
echo "3. Running database migration..."
cd api

# First, generate the Prisma client with the new schema
npx prisma generate

# Then run the migration
npx prisma migrate deploy

# Check if migration was successful
if [ $? -ne 0 ]; then
    echo "ERROR: Database migration failed."
    echo "You may need to run the migration manually:"
    echo "  cd api"
    echo "  npx prisma migrate deploy"
    exit 1
fi

# Update API with new endpoints
echo "4. Updating API with new endpoints..."
if [ -f "add-price-private-notes.sh" ]; then
    chmod +x add-price-private-notes.sh
    ./add-price-private-notes.sh
else
    echo "WARNING: add-price-private-notes.sh not found"
    echo "API updates may need to be applied manually"
fi

# Update frontend
echo "5. Updating frontend components..."
cd ../web

if [ -f "update-frontend-price-notes.js" ]; then
    node update-frontend-price-notes.js
else
    echo "WARNING: update-frontend-price-notes.js not found"
    echo "Frontend updates may need to be applied manually"
fi

# Rebuild frontend
echo "6. Building frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed."
    echo "Please check for errors and rebuild manually."
    exit 1
fi

# Restart services
echo "7. Restarting services..."
pm2 restart all

# Check status
echo "8. Checking service status..."
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
echo ""
echo "If you see any warnings above, you may need to:"
echo "  1. Manually apply the changes"
echo "  2. Or push local server changes to GitHub first, then re-run"