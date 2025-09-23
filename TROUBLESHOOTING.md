# Order Tracker - Troubleshooting Guide

## Quick Fixes

If something isn't working, run this first:
```bash
cd /var/www/order-tracker
./fix-common-issues.sh
```

This script automatically fixes:
- Database permissions
- Missing environment variables
- Measurement data type issues
- Frontend build problems
- Service restarts

## Common Issues and Solutions

### 1. "Invalid credentials" Error When Logging In

#### Symptoms
- Login fails with "Invalid credentials"
- You're sure the password is correct
- User exists in database

#### Root Cause
Database file is read-only, preventing the API from updating the lastLogin field.

#### Solution
```bash
# Fix database permissions
sudo chown ubuntu:ubuntu /var/www/order-tracker/api/prisma/dev.db
sudo chmod 664 /var/www/order-tracker/api/prisma/dev.db
sudo chown ubuntu:ubuntu /var/www/order-tracker/api/prisma/
sudo chmod 775 /var/www/order-tracker/api/prisma/

# Restart API
pm2 restart order-tracker-backend

# Test login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}'
```

### 2. "Failed to save measurements" Error

#### Symptoms
- Measurements won't save
- Error: "Failed to update measurements"
- API logs show "Expected Float, provided String"

#### Root Cause
Frontend sends measurements as strings ("100") but database expects Float numbers.

#### Solution
The fix is already in the deployment script, but if needed:
```bash
cd /var/www/order-tracker/api

# Check if fix is applied
if ! grep -q "parseFloat" src/index.js; then
  echo "Applying measurement fix..."
  
  # Backup
  cp src/index.js src/index.js.backup
  
  # Apply fix (converts strings to numbers)
  sed -i 's/height: height !== undefined ? height : item\.height,/height: height !== undefined ? (height === null || height === "" ? null : parseFloat(height)) : item.height,/' src/index.js
  sed -i 's/width: width !== undefined ? width : item\.width,/width: width !== undefined ? (width === null || width === "" ? null : parseFloat(width)) : item.width,/' src/index.js
  sed -i 's/length: length !== undefined ? length : item\.length,/length: length !== undefined ? (length === null || length === "" ? null : parseFloat(length)) : item.length,/' src/index.js
  sed -i 's/weight: weight !== undefined ? weight : item\.weight,/weight: weight !== undefined ? (weight === null || weight === "" ? null : parseFloat(weight)) : item.weight,/' src/index.js
  
  pm2 restart order-tracker-backend
fi
```

### 3. Frontend Shows "Network Error" or Can't Connect to API

#### Symptoms
- Frontend loads but can't fetch data
- Login button doesn't work
- Console shows CORS errors or connection refused

#### Root Cause
Frontend is trying to connect to localhost instead of the server IP.

#### Solution
```bash
# Fix frontend environment variables
cat > /var/www/order-tracker/web/.env.local << EOF
NEXT_PUBLIC_API_BASE=http://50.19.66.100:4000
NEXT_PUBLIC_API_URL=http://50.19.66.100:4000
API_BASE=http://localhost:4000
EOF

# Rebuild frontend
cd /var/www/order-tracker/web
npm run build

# Restart frontend
pm2 restart order-tracker-frontend
```

### 4. JWT Token Errors

#### Symptoms
- "Authentication required" errors
- "Invalid token" errors
- Login works but subsequent requests fail

#### Root Cause
Missing or invalid JWT_SECRET in environment.

#### Solution
```bash
# Check if JWT_SECRET exists
grep JWT_SECRET /var/www/order-tracker/api/.env

# If missing, add it
if ! grep -q "JWT_SECRET" /var/www/order-tracker/api/.env; then
  echo "JWT_SECRET=jwt-secret-$(openssl rand -hex 32)" >> /var/www/order-tracker/api/.env
  pm2 restart order-tracker-backend
fi
```

### 5. PM2 Process Keeps Restarting (Error Loop)

#### Symptoms
- PM2 status shows "errored"
- Restart count keeps increasing
- Application is inaccessible

#### Root Cause
Usually missing dependencies or build files.

#### Solution
```bash
# Check PM2 logs for specific error
pm2 logs order-tracker-backend --lines 50
pm2 logs order-tracker-frontend --lines 50

# Common fixes:

# For backend issues:
cd /var/www/order-tracker/api
npm install
npx prisma generate
pm2 restart order-tracker-backend

# For frontend issues:
cd /var/www/order-tracker/web
npm install
npm run build
pm2 restart order-tracker-frontend
```

### 6. Database Locked Error

#### Symptoms
- "database is locked" error
- Operations timeout
- Can't write to database

#### Solution
```bash
# Stop all processes
pm2 stop all

# Check for stuck processes
ps aux | grep node
ps aux | grep sqlite

# Kill any stuck processes
# kill -9 <PID>

# Fix permissions
sudo chown ubuntu:ubuntu /var/www/order-tracker/api/prisma/dev.db
sudo chmod 664 /var/www/order-tracker/api/prisma/dev.db

# Restart
pm2 start all
```

### 7. Frontend Build Fails

#### Symptoms
- `npm run build` fails
- "Could not find a production build" error
- Frontend PM2 process won't start

#### Solution
```bash
cd /var/www/order-tracker/web

# Clean install
rm -rf node_modules .next
npm install

# Check for TypeScript errors
npm run type-check || true

# Build with verbose output
NEXT_TELEMETRY_DISABLED=1 npm run build

# If build succeeds
pm2 restart order-tracker-frontend
```

### 8. CORS Errors

#### Symptoms
- Browser console shows CORS policy errors
- API requests blocked
- "Access-Control-Allow-Origin" errors

#### Solution
```bash
# Update API CORS settings
cd /var/www/order-tracker/api

# Edit .env file to include correct origins
cat >> .env << EOF
CORS_ORIGIN=http://50.19.66.100:3000,http://50.19.66.100,http://localhost:3000
EOF

pm2 restart order-tracker-backend
```

## Diagnostic Commands

### Check Everything
```bash
cd /var/www/order-tracker
./verify-deployment.sh
```

### Check Services
```bash
# PM2 status
pm2 status

# Detailed info
pm2 describe order-tracker-backend
pm2 describe order-tracker-frontend

# Monitor resources
pm2 monit
```

### Check Logs
```bash
# All logs
pm2 logs

# Specific service
pm2 logs order-tracker-backend --lines 100
pm2 logs order-tracker-frontend --lines 100

# Error logs only
pm2 logs --err
```

### Test Endpoints
```bash
# API health
curl -I http://localhost:4000/auth/check

# Login test
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}'

# Frontend
curl -I http://localhost:3000
```

### Database Checks
```bash
# Check permissions
ls -la /var/www/order-tracker/api/prisma/dev.db

# Check if writable
touch /var/www/order-tracker/api/prisma/test && rm /var/www/order-tracker/api/prisma/test

# Query database
sqlite3 /var/www/order-tracker/api/prisma/dev.db "SELECT COUNT(*) FROM User;"
```

## Emergency Recovery

### Nuclear Option - Complete Reset
```bash
cd /var/www/order-tracker

# Stop everything
pm2 delete all

# Backup current state
mkdir -p backups
cp api/prisma/dev.db backups/dev.db.$(date +%Y%m%d_%H%M%S)
cp api/.env backups/api.env.$(date +%Y%m%d_%H%M%S)
cp web/.env.local backups/web.env.$(date +%Y%m%d_%H%M%S)

# Clean everything
cd api
rm -rf node_modules prisma/dev.db
npm install
npx prisma generate
npx prisma db push
node prisma/seed.js

# Fix permissions
sudo chown ubuntu:ubuntu prisma/dev.db
sudo chmod 664 prisma/dev.db

cd ../web
rm -rf node_modules .next
npm install
npm run build

cd ..

# Recreate environment files
./fix-common-issues.sh

# Start everything
pm2 start api/ecosystem.config.js
pm2 save
```

## Prevention Checklist

To avoid issues:

1. **Always use the deployment script**
   ```bash
   ./deploy-aws.sh
   ```

2. **Check health after deployment**
   ```bash
   ./verify-deployment.sh
   ```

3. **Never manually edit without backup**
   ```bash
   cp file file.backup before editing
   ```

4. **Monitor logs regularly**
   ```bash
   pm2 logs --lines 100
   ```

5. **Keep environment files updated**
   - Check `.env` files match examples
   - Ensure SERVER_IP is correct

## Still Having Issues?

1. **Collect diagnostic info:**
   ```bash
   ./verify-deployment.sh > diagnostic.txt 2>&1
   pm2 logs --nostream --lines 200 >> diagnostic.txt 2>&1
   ```

2. **Check for recent changes:**
   ```bash
   cd /var/www/order-tracker
   git status
   git log -5 --oneline
   ```

3. **Document:**
   - What were you trying to do?
   - What error did you see?
   - What commands did you run?

4. **Recovery attempt:**
   ```bash
   ./fix-common-issues.sh
   ```

Remember: The deployment script and fix scripts handle 99% of issues automatically. When in doubt, run `./fix-common-issues.sh`!