# Manufacturing Tracker - AWS Deployment Guide

## 1. AWS EC2 Instance Selection

### Recommended Instance Type
- **Development/Testing**: `t3.medium` (2 vCPU, 4 GB RAM)
- **Production**: `t3.large` (2 vCPU, 8 GB RAM) or `t3.xlarge` (4 vCPU, 16 GB RAM)
- **OS**: Ubuntu 22.04 LTS (Long Term Support)
- **Storage**: 20-30 GB SSD (gp3)

### Why These Choices
- t3 instances are cost-effective with burstable performance
- Ubuntu 22.04 LTS provides stability and long-term support
- These specs handle both Node.js processes + SQLite database comfortably

---

## 2. Initial AWS Setup

### Step 1: Launch EC2 Instance
1. Go to AWS EC2 Dashboard
2. Click "Launch Instance"
3. Name: `manufacturing-tracker-server`
4. Select Ubuntu Server 22.04 LTS
5. Instance type: `t3.medium` (or your choice)
6. Create new key pair (save the .pem file securely)
7. Network settings:
   - Allow SSH (port 22)
   - Allow HTTP (port 80)
   - Allow HTTPS (port 443)
   - Allow Custom TCP (port 3000) - Frontend
   - Allow Custom TCP (port 4000) - Backend API

### Step 2: Elastic IP (Recommended)
1. Go to EC2 → Elastic IPs
2. Allocate Elastic IP
3. Associate with your instance
4. Note your IP address (e.g., `54.123.45.67`)

---

## 3. Server Initial Setup

### Connect to Server
```bash
# From your local machine
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_SERVER_IP
```

### Update System & Install Dependencies
```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build essentials (for native modules)
sudo apt install -y build-essential

# Install Git
sudo apt install -y git

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install nginx (reverse proxy)
sudo apt install -y nginx

# Create app directory
sudo mkdir -p /var/www/manufacturing-tracker
sudo chown -R ubuntu:ubuntu /var/www/manufacturing-tracker
```

---

## 4. Application Deployment

### Clone or Upload Your Code
```bash
cd /var/www/manufacturing-tracker

# Option 1: Clone from Git repository
git clone YOUR_REPOSITORY_URL .

# Option 2: Upload via SCP from local machine
# From your LOCAL machine:
scp -i your-key.pem -r /path/to/manufacturing-tracker/* ubuntu@YOUR_SERVER_IP:/var/www/manufacturing-tracker/
```

---

## 5. Code Changes for Production Deployment

### Backend Changes (`/api/src/index.js`)

```javascript
// CHANGE FROM:
const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// CHANGE TO:
const cors = require('cors');
const allowedOrigins = [
  'http://YOUR_SERVER_IP:3000',
  'http://YOUR_SERVER_IP',
  'http://localhost:3000', // Keep for local development
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Also update the port binding
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0'; // Listen on all interfaces
app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});
```

### Frontend Environment Configuration

Create `/web/.env.production`:
```env
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:4000
```

### Frontend API Route Updates (`/web/app/api/*/route.js`)

Update all API route files to use environment variable:

```javascript
// CHANGE FROM:
const backendUrl = 'http://localhost:4000';

// CHANGE TO:
const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
```

### Authentication Context Update (`/web/contexts/AuthContext.jsx`)

```javascript
// CHANGE FROM:
const API_BASE = 'http://localhost:3000/api';

// CHANGE TO:
const API_BASE = process.env.NODE_ENV === 'production' 
  ? `http://${window.location.hostname}:3000/api`
  : 'http://localhost:3000/api';
```

### Next.js Configuration (`/web/next.config.js`)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true
  },
  // Add public runtime config
  publicRuntimeConfig: {
    API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  }
}

module.exports = nextConfig
```

---

## 6. Backend Setup & Deployment

```bash
cd /var/www/manufacturing-tracker/api

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=4000
NODE_ENV=production
EOF

# Setup database
npx prisma generate
npx prisma migrate deploy

# Seed the database with initial users
node prisma/seed.js

# Test the backend
npm run dev
# Press Ctrl+C to stop after confirming it works
```

---

## 7. Frontend Setup & Build

```bash
cd /var/www/manufacturing-tracker/web

# Install dependencies
npm install

# Build for production
npm run build

# Test the frontend
npm run start
# Press Ctrl+C to stop after confirming it works
```

---

## 8. Process Management with PM2

### Create PM2 Ecosystem File

Create `/var/www/manufacturing-tracker/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'manufacturing-backend',
      cwd: '/var/www/manufacturing-tracker/api',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: '/var/www/manufacturing-tracker/logs/backend-error.log',
      out_file: '/var/www/manufacturing-tracker/logs/backend-out.log',
      time: true
    },
    {
      name: 'manufacturing-frontend',
      cwd: '/var/www/manufacturing-tracker/web',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/www/manufacturing-tracker/logs/frontend-error.log',
      out_file: '/var/www/manufacturing-tracker/logs/frontend-out.log',
      time: true
    }
  ]
};
```

### Start Services with PM2

```bash
# Create logs directory
mkdir -p /var/www/manufacturing-tracker/logs

# Start all services
cd /var/www/manufacturing-tracker
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd
# Follow the command it outputs

# View status
pm2 status

# View logs
pm2 logs

# Monitor in real-time
pm2 monit
```

---

## 9. Nginx Configuration (Optional but Recommended)

### Configure Nginx as Reverse Proxy

Create `/etc/nginx/sites-available/manufacturing-tracker`:

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /backend/ {
        rewrite ^/backend(/.*)$ $1 break;
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Enable Nginx Configuration

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/manufacturing-tracker /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

If using Nginx, update your frontend to use `/backend` prefix for API calls.

---

## 10. Security Hardening

### Setup UFW Firewall

```bash
# Enable UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Frontend (if not using Nginx)
sudo ufw allow 4000/tcp  # Backend (if not using Nginx)
sudo ufw --force enable

# Check status
sudo ufw status
```

### Secure the Database

```bash
# Backup database regularly
mkdir -p /var/www/manufacturing-tracker/backups

# Create backup script
cat > /var/www/manufacturing-tracker/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/www/manufacturing-tracker/backups"
DB_FILE="/var/www/manufacturing-tracker/api/prisma/dev.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp $DB_FILE $BACKUP_DIR/backup_$TIMESTAMP.db
# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.db" -mtime +7 -delete
EOF

chmod +x /var/www/manufacturing-tracker/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/manufacturing-tracker/backup.sh") | crontab -
```

---

## 11. Monitoring & Maintenance

### PM2 Commands Reference

```bash
# View all processes
pm2 list

# View specific app logs
pm2 logs manufacturing-backend
pm2 logs manufacturing-frontend

# Restart services
pm2 restart manufacturing-backend
pm2 restart manufacturing-frontend
pm2 restart all

# Stop services
pm2 stop all

# Delete from PM2
pm2 delete all

# Monitor resources
pm2 monit

# View detailed info
pm2 info manufacturing-backend
```

### System Monitoring

```bash
# Check disk space
df -h

# Check memory usage
free -m

# Check running processes
htop  # Install with: sudo apt install htop

# Check application logs
tail -f /var/www/manufacturing-tracker/logs/backend-out.log
tail -f /var/www/manufacturing-tracker/logs/frontend-out.log
```

---

## 12. Updating the Application

### Deploy Updates

```bash
# Stop services
pm2 stop all

# Pull latest code (if using Git)
cd /var/www/manufacturing-tracker
git pull origin main

# Update backend
cd api
npm install
npx prisma migrate deploy

# Update frontend
cd ../web
npm install
npm run build

# Restart services
pm2 restart all
```

---

## 13. Troubleshooting

### Common Issues & Solutions

**Frontend can't connect to backend:**
- Check CORS settings in backend
- Verify API_URL in frontend environment
- Check firewall rules
- Verify backend is running: `pm2 status`

**Database locked errors:**
- SQLite limitation with concurrent writes
- Consider upgrading to PostgreSQL for production

**High memory usage:**
- Set PM2 memory limits in ecosystem.config.js
- Add `max_memory_restart: '1G'` to app config

**502 Bad Gateway (if using Nginx):**
- Check if Node processes are running
- Verify proxy_pass URLs in Nginx config
- Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`

---

## 14. Production Checklist

- [ ] Change JWT_SECRET to strong random value
- [ ] Enable HTTPS with SSL certificate (Let's Encrypt)
- [ ] Set up domain name instead of IP address
- [ ] Configure automated backups
- [ ] Set up monitoring (PM2 Plus, New Relic, or Datadog)
- [ ] Implement log rotation
- [ ] Set up alerts for downtime
- [ ] Document all custom configurations
- [ ] Create staging environment for testing updates
- [ ] Consider migrating from SQLite to PostgreSQL
- [ ] Implement rate limiting on API
- [ ] Set up CDN for static assets

---

## 15. Quick Reference

### Access Your Application
- Frontend: `http://YOUR_SERVER_IP:3000` (or `http://YOUR_SERVER_IP` if using Nginx)
- Backend API: `http://YOUR_SERVER_IP:4000`
- Default Admin: `admin@stealthmachinetools.com` / `admin123`
- Default Agent: `john@stealthmachinetools.com` / `agent123`

### Important File Locations
- Application: `/var/www/manufacturing-tracker/`
- Database: `/var/www/manufacturing-tracker/api/prisma/dev.db`
- Logs: `/var/www/manufacturing-tracker/logs/`
- PM2 Config: `/var/www/manufacturing-tracker/ecosystem.config.js`
- Nginx Config: `/etc/nginx/sites-available/manufacturing-tracker`

### Emergency Commands
```bash
# Restart everything
pm2 restart all

# View real-time logs
pm2 logs --lines 100

# Emergency stop
pm2 kill

# Manual start
cd /var/www/manufacturing-tracker
pm2 start ecosystem.config.js
```