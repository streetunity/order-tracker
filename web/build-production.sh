#!/bin/bash

# Build script for AWS deployment
# This ensures the correct API URL is used

echo "Building for production with API at http://50.19.66.100:4000"

# Export the environment variables for this build
export NEXT_PUBLIC_API_BASE=http://50.19.66.100:4000
export NEXT_PUBLIC_API_URL=http://50.19.66.100:4000
export NODE_ENV=production

# Clean old builds
echo "Cleaning old builds..."
rm -rf .next
rm -rf node_modules/.cache

# Run the build
echo "Building application..."
npm run build

echo "Build complete! Now restart with: pm2 restart order-tracker-frontend"