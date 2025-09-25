#!/bin/bash

# Master deployment script for Customer Documents Link feature
# This adds a required customerDocsLink field to orders
# FULLY AUTOMATED VERSION

echo "========================================="
echo "Deploying Customer Documents Link Feature"
echo "========================================="

# Navigate to project directory
cd /var/www/order-tracker

# Pull latest changes from GitHub
echo "Pulling latest changes from GitHub..."
git pull origin aws-deployment

# Make scripts executable
chmod +x scripts/auto-update-edit-order-page.sh

# Run the automated Edit Order page update
echo "Updating Edit Order page..."
./scripts/auto-update-edit-order-page.sh

# Navigate to API directory
cd api

# Run database migration
echo "Running database migration..."
npx prisma migrate dev --name add_customer_docs_link --create-only
npx prisma migrate deploy
npx prisma generate

# Restart API server
echo "Restarting API server..."
pm2 restart api

# Navigate to web directory
cd ../web

# Build the frontend
echo "Building frontend application..."
npm run build

# Restart web server
echo "Restarting web server..."
pm2 restart all

echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "The Customer Documents Link field has been fully deployed:"
echo "✅ Database schema updated with customerDocsLink field"
echo "✅ New Order page now requires Customer Documents Link"
echo "✅ Edit Order page can modify the Customer Documents Link"
echo "✅ Public tracking page displays the link to customers"
echo ""
echo "Test the feature at:"
echo "- New Order: http://50.19.66.100:3000/admin/orders/new"
echo "- Edit Order: http://50.19.66.100:3000/admin/orders/[order-id]"
echo "- Public View: http://50.19.66.100:3000/t/[tracking-token]"
echo ""
echo "The Customer Documents Link is now:"
echo "• Required when creating new orders"
echo "• Editable on the Edit Order page"
echo "• Visible to customers on the tracking page as a clickable link"
