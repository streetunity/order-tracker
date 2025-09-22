#!/bin/bash
# Complete AWS Setup Script - Installs ALL required dependencies

echo "Installing all required dependencies for Order Tracker..."

# Core system packages
echo "Installing system packages..."
sudo apt update
sudo apt install -y \
    build-essential \
    git \
    curl \
    sqlite3 \
    openssl

# Install Node.js 20.x if not present
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | cut -d'v' -f2) -lt 20 ]; then
    echo "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

echo "All dependencies installed!"
echo ""
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "SQLite3 installed: $(sqlite3 --version)"
echo ""
echo "You can now run ./deploy-aws.sh or ./quick-start.sh"