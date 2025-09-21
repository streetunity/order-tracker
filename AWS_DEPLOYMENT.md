# AWS Deployment Instructions for Order Tracker

## Prerequisites
- AWS account with EC2 access
- Local machine with Git and SSH client
- GitHub access to this repository

## Step 1: Launch EC2 Instance

1. Go to AWS EC2 Dashboard
2. Click **Launch Instance**
3. Configure:
   - **Name:** `order-tracker-server`
   - **OS:** Ubuntu Server 22.04 LTS (64-bit)
   - **Instance Type:** `t3.medium` (minimum) or `t3.large` (recommended)
   - **Key Pair:** Create new or use existing (download .pem file)
   - **Network Settings:**
     - Allow SSH (port 22) from your IP
     - Allow HTTP (port 80) from anywhere
     - Allow HTTPS (port 443) from anywhere
     - Allow Custom TCP (port 3000) from anywhere - Frontend
     - Allow Custom TCP (port 4000) from anywhere - Backend API
   - **Storage:** 20-30 GB gp3 SSD

4. Launch the instance and note the public IP address

## Step 2: Configure Elastic IP (Recommended)

1. Go to EC2 → Elastic IPs
2. Click **Allocate Elastic IP**
3. Click **Associate Elastic IP address**
4. Select your instance and associate
5. Note your Elastic IP (e.g., `54.123.45.67`)

## Step 3: Connect to Server

```bash
# Make key file secure
chmod 400 your-key.pem

# Connect via SSH
ssh -i your-key.pem ubuntu@YOUR_SERVER_IP
```

## Step 4: Server Setup

Run these commands on the server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install required packages
sudo apt install -y build-essential git

# Install PM2 globally
sudo npm install -g pm2

# Create app directory
sudo mkdir -p /var/www/order-tracker
sudo chown -R ubuntu:ubuntu /var/www/order-tracker
cd /var/www/order-tracker
```

## Step 5: Clone and Configure Application

```bash
# Clone the repository
git clone https://github.com/streetunity/order-tracker.git .

# Checkout AWS deployment branch
git checkout aws-deployment

# Make deployment script executable
chmod +x deploy-aws.sh
chmod +x update-api-routes.sh

# Update API routes to use environment variable
./update-api-routes.sh

# Replace YOUR_SERVER_IP with actual IP in all config files
export SERVER_IP="YOUR_ACTUAL_IP_HERE"  # Replace with your IP
find . -type f \( -name "*.env*" -o -name "*.js" -o -name "*.sh" \) \
  -exec sed -i "s/YOUR_SERVER_IP/$SERVER_IP/g" {} +
```

## Step 6: Deploy Application

```bash
# Run deployment script with your server IP
./deploy-aws.sh YOUR_ACTUAL_IP_HERE
```

This script will:
- Install all dependencies
- Set up the database
- Build the frontend
- Start services with PM2

## Step 7: Setup PM2 Auto-start

```bash
# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd
# Copy and run the command it outputs
```

## Step 8: Verify Deployment

1. Check service status:
```bash
pm2 status
pm2 logs
```

2. Test endpoints:
- Frontend: `http://YOUR_SERVER_IP:3000`
- Backend API: `http://YOUR_SERVER_IP:4000`

3. Default login credentials:
- Admin: `admin@stealthmachinetools.com` / `admin123`
- Agent: `john@stealthmachinetools.com` / `agent123`

## Step 9: Security Hardening (Recommended)

```bash
# Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 4000/tcp
sudo ufw --force enable

# Change default passwords immediately!
```

## Maintenance Commands

### View logs:
```bash
pm2 logs order-tracker-backend
pm2 logs order-tracker-frontend
```

### Restart services:
```bash
pm2 restart all
```

### Update application:
```bash
git pull origin aws-deployment
./update-api-routes.sh
npm install --prefix api
npm install --prefix web
npm run build --prefix web
pm2 restart all
```

### Database backup:
```bash
cp api/prisma/dev.db api/prisma/backup-$(date +%Y%m%d).db
```

## Troubleshooting

### Services not starting:
```bash
pm2 delete all
pm2 start ecosystem.config.js
```

### Port already in use:
```bash
sudo lsof -i :3000
sudo lsof -i :4000
# Kill the process if needed
```

### Database locked:
```bash
pm2 stop order-tracker-backend
rm api/prisma/dev.db-journal
pm2 start order-tracker-backend
```

## Next Steps

1. **Set up domain name** - Point your domain to the Elastic IP
2. **Configure SSL** - Use Let's Encrypt with Nginx
3. **Set up Nginx** as reverse proxy (optional but recommended)
4. **Configure backups** - Automated database backups
5. **Set up monitoring** - CloudWatch or external monitoring
6. **Secure the application**:
   - Change all default passwords
   - Update JWT_SECRET in api/.env
   - Restrict SSH access to specific IPs

## Support

For issues specific to AWS deployment, check:
- PM2 logs: `pm2 logs`
- Application logs: `tail -f logs/*.log`
- System logs: `sudo journalctl -xe`