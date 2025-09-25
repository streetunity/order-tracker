#!/bin/bash

# Script to add customerDocsLink field to Order model
# This field stores Dropbox or other document links for customer orders

echo "Adding customerDocsLink field to orders..."

cd /var/www/order-tracker/api

# Create a new migration
echo "Creating Prisma migration..."
npx prisma migrate dev --name add_customer_docs_link --create-only

# Apply the migration
echo "Applying migration to database..."
npx prisma migrate deploy

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Restart the API server
echo "Restarting API server..."
pm2 restart api

echo "Database migration complete! customerDocsLink field has been added to orders."
echo "Note: This field is optional in the database but will be required in the frontend forms."