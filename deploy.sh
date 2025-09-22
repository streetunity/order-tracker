#!/bin/bash

# Manufacturing Tracker - AWS Deployment Script
# This script automates the deployment process on AWS EC2

set -e  # Exit on any error

echo "==========================================="
echo "Manufacturing Tracker - AWS Deployment"
echo "==========================================="

# Configuration
APP_DIR="/var/www/order-tracker"
REPO_URL="https://github.com/streetunity/order-tracker.git"
BRANCH="aws-deployment"

# Get server IP
SERVER_IP=$(curl -s http://checkip.amazonaws.com)
echo "Server IP detected: $SERVER_IP"

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install essential dependencies
echo "Installing build essentials and SQLite3..."
sudo apt install -y build-essential git sqlite3 libsqlite3-dev

# Install PM2 globally
echo "Installing PM2..."
sudo npm install -g pm2

# Install nginx
echo "Installing nginx..."
sudo apt install -y nginx

# Create application directory
echo "Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown -R ubuntu:ubuntu $APP_DIR

# Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repository..."
    cd $APP_DIR
    git fetch origin
    git checkout $BRANCH
    git pull origin $BRANCH
else
    echo "Cloning repository..."
    git clone -b $BRANCH $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# Backend setup
echo "Setting up backend..."
cd $APP_DIR/api

# Install dependencies
npm install

# Create .env file with production settings
cat > .env << EOF
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="$(openssl rand -base64 32)"
PORT=4000
NODE_ENV=production
EOF

# Setup Prisma and database
echo "Setting up database..."
npx prisma generate
npx prisma migrate deploy || npx prisma db push

# Seed the database (only if it's empty)
if [ ! -s "prisma/dev.db" ] || [ $(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM User;" 2>/dev/null || echo 0) -eq 0 ]; then
    echo "Seeding database with initial users..."
    node prisma/seed.js
fi

# Frontend setup
echo "Setting up frontend..."
cd $APP_DIR/web

# Install dependencies
npm install

# Create production environment file
cat > .env.production << EOF
NEXT_PUBLIC_API_BASE=http://$SERVER_IP:4000
API_BASE=http://$SERVER_IP:4000
NEXT_PUBLIC_API_URL=http://$SERVER_IP:4000
EOF

# Build frontend
echo "Building frontend..."
npm run build

# Create logs directory
mkdir -p $APP_DIR/logs

# Create PM2 ecosystem file
cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'order-tracker-backend',
      cwd: '$APP_DIR/api',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: '$APP_DIR/logs/backend-error.log',
      out_file: '$APP_DIR/logs/backend-out.log',
      time: true,
      max_memory_restart: '1G'
    },
    {
      name: 'order-tracker-frontend',
      cwd: '$APP_DIR/web',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '$APP_DIR/logs/frontend-error.log',
      out_file: '$APP_DIR/logs/frontend-out.log',
      time: true,
      max_memory_restart: '1G'
    }
  ]
};
EOF

# Stop any existing PM2 processes
echo "Stopping existing processes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Start services with PM2
echo "Starting services with PM2..."
cd $APP_DIR
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save

# Configure nginx (optional)
echo "Configuring nginx..."
sudo tee /etc/nginx/sites-available/order-tracker > /dev/null << EOF
server {
    listen 80;
    server_name $SERVER_IP;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Backend API
    location /backend/ {
        rewrite ^/backend(/.*)$ \$1 break;
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable nginx configuration
sudo ln -sf /etc/nginx/sites-available/order-tracker /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# Setup firewall
echo "Configuring firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 4000/tcp  # Backend
sudo ufw --force enable

# Create backup script
cat > $APP_DIR/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/www/order-tracker/backups"
DB_FILE="/var/www/order-tracker/api/prisma/dev.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
cp $DB_FILE $BACKUP_DIR/backup_$TIMESTAMP.db
# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.db" -mtime +7 -delete
EOF
chmod +x $APP_DIR/backup.sh

# Add backup to crontab (daily at 2 AM)
(crontab -l 2>/dev/null | grep -v "$APP_DIR/backup.sh"; echo "0 2 * * * $APP_DIR/backup.sh") | crontab -

echo "==========================================="
echo "Deployment Complete!"
echo "==========================================="
echo ""
echo "Frontend: http://$SERVER_IP:3000"
echo "Backend API: http://$SERVER_IP:4000"
echo ""
echo "Default Admin Credentials:"
echo "Email: admin@stealthmachinetools.com"
echo "Password: admin123"
echo ""
echo "Default Agent Credentials:"
echo "Email: john@stealthmachinetools.com"
echo "Password: agent123"
echo ""
echo "To view logs: pm2 logs"
echo "To monitor: pm2 monit"
echo "To restart: pm2 restart all"
echo ""
echo "IMPORTANT: Change the default passwords immediately!"
