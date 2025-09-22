# Quick Deployment Guide - Your Server

Your server details:
- **Public IP (Elastic IP):** 50.19.66.100
- **Private IP:** 172.31.42.14

## Quick Start (On Your AWS Server)

1. **Connect to your server:**
```bash
ssh -i your-key.pem ubuntu@50.19.66.100
```

2. **Run these commands:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential git

# Install PM2
sudo npm install -g pm2

# Create and enter app directory
sudo mkdir -p /var/www/order-tracker
sudo chown -R ubuntu:ubuntu /var/www/order-tracker
cd /var/www/order-tracker

# Clone repository
git clone https://github.com/streetunity/order-tracker.git .
git checkout aws-deployment

# Run quick start
chmod +x quick-start.sh
./quick-start.sh
```

## Access Your Application

Once deployment is complete:
- **Frontend:** http://50.19.66.100:3000
- **Backend API:** http://50.19.66.100:4000

## Default Credentials

- **Admin:** admin@stealthmachinetools.com / admin123
- **Agent:** john@stealthmachinetools.com / agent123

⚠️ **IMPORTANT:** Change these passwords immediately after first login!

## Essential Commands

**Check status:**
```bash
pm2 status
pm2 logs
```

**Restart services:**
```bash
pm2 restart all
```

**Stop services:**
```bash
pm2 stop all
```

**View real-time logs:**
```bash
pm2 logs --lines 100
```

## Setup Auto-start on Reboot

```bash
pm2 save
pm2 startup systemd
# Copy and run the command it outputs
```

## Firewall Configuration

Make sure these ports are open in your AWS Security Group:
- Port 22 (SSH)
- Port 3000 (Frontend)
- Port 4000 (Backend API)
- Port 80 (HTTP - optional)
- Port 443 (HTTPS - optional)

## Troubleshooting

If services don't start:
```bash
cd /var/www/order-tracker
pm2 delete all
pm2 start ecosystem.config.js
```

If you see CORS errors:
- Check that both services are running: `pm2 status`
- Verify the backend is accessible: `curl http://localhost:4000`

## Next Steps

1. **Change default passwords** in the application
2. **Update JWT_SECRET** in `/var/www/order-tracker/api/.env`
3. Consider setting up:
   - Domain name pointing to 50.19.66.100
   - SSL certificate with Let's Encrypt
   - Nginx as reverse proxy
   - Automated backups