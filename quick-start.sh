#!/bin/bash
# Quick start script for AWS deployment
# Run this after cloning the repository on your AWS server

echo "Starting Order Tracker deployment..."
echo "Server IP: 50.19.66.100"

# Ensure we're in the aws-deployment branch
git checkout aws-deployment

# Make scripts executable
chmod +x deploy-aws.sh
chmod +x update-api-routes.sh

# Run the deployment
./deploy-aws.sh

echo "\nSetup complete! Your application should be running at:"
echo "Frontend: http://50.19.66.100:3000"
echo "Backend API: http://50.19.66.100:4000"