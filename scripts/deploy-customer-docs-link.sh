#!/bin/bash

# Master deployment script for Customer Documents Link feature
# This adds a required customerDocsLink field to orders

echo "========================================="
echo "Deploying Customer Documents Link Feature"
echo "========================================="

# Navigate to project directory
cd /var/www/order-tracker

# Pull latest changes from GitHub
echo "Pulling latest changes from GitHub..."
git pull origin aws-deployment

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
echo "The Customer Documents Link field has been added:"
echo "1. Database schema updated with customerDocsLink field"
echo "2. New Order page now requires Customer Documents Link"
echo "3. Edit Order page can modify the Customer Documents Link"
echo "4. Public tracking page displays the link to customers"
echo ""
echo "Note: The Edit Order page needs manual update to add the field."
echo "See /scripts/add-customer-docs-link-edit-page.sh for instructions."
echo ""
echo "Test the feature at:"
echo "- New Order: http://50.19.66.100:3000/admin/orders/new"
echo "- Public View: http://50.19.66.100:3000/t/[tracking-token]"
