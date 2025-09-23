# Order Tracker - AWS Deployment Notes

## Important Information

### Server Details
- **Server IP**: 50.19.66.100
- **Frontend URL**: http://50.19.66.100:3000
- **API URL**: http://50.19.66.100:4000
- **Deploy Directory**: `/var/www/order-tracker`

### Default Credentials
- **Admin**: admin@stealthmachinetools.com / admin123
- **IMPORTANT**: Change this password immediately after first login!

## Known Issues and Fixes

### Issue 1: Login Fails with "Invalid credentials"
**Cause**: Database file doesn't have write permissions, preventing the API from updating the lastLogin timestamp.

**Solution**:
```bash
sudo chmod 664 /var/www/order-tracker/api/prisma/dev.db
sudo chown ubuntu:ubuntu /var/www/order-tracker/api/prisma/dev.db
pm2 restart order-tracker-backend
```

### Issue 2: Measurements Won't Save
**Cause**: Frontend sends measurement values as strings, but database expects Float type.

**Solution**: Already fixed in the deployment script. The API now converts strings to numbers automatically.

### Issue 3: Missing JWT_SECRET
**Cause**: Environment variable not set in `.env` file.

**Solution**:
```bash
echo "JWT_SECRET=jwt-secret-$(openssl rand -hex 32)" >> /var/www/order-tracker/api/.env
pm2 restart order-tracker-backend
```

### Issue 4: Frontend Can't Connect to API
**Cause**: Frontend `.env.local` has wrong API URL (localhost instead of server IP).

**Solution**:
```bash
cat > /var/www/order-tracker/web/.env.local << EOF
NEXT_PUBLIC_API_BASE=http://50.19.66.100:4000
NEXT_PUBLIC_API_URL=http://50.19.66.100:4000
API_BASE=http://localhost:4000
EOF

cd /var/www/order-tracker/web
npm run build
pm2 restart order-tracker-frontend
```

## Deployment Commands

### Initial Deployment
```bash
cd /var/www/order-tracker
./deploy-aws.sh
```

### Check System Health
```bash
./verify-deployment.sh
```

### Fix Common Issues
```bash
./fix-common-issues.sh
```

### Manual Service Management
```bash
# Check status
pm2 status

# View logs
pm2 logs order-tracker-backend
pm2 logs order-tracker-frontend

# Restart services
pm2 restart all
pm2 restart order-tracker-backend
pm2 restart order-tracker-frontend

# Stop services
pm2 stop all

# Start services
pm2 start all
```

## Database Management

### Access Database
```bash
sqlite3 /var/www/order-tracker/api/prisma/dev.db
```

### Common Database Queries
```sql
-- List all users
SELECT email, name, role FROM User;

-- Check admin user
SELECT * FROM User WHERE email='admin@stealthmachinetools.com';

-- List recent orders
SELECT id, poNumber, currentStage, createdAt FROM "Order" ORDER BY createdAt DESC LIMIT 10;

-- Exit SQLite
.quit
```

### Reset Admin Password
```bash
cd /var/www/order-tracker/api
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 10).then(h => console.log(h));"
# Copy the hash output

sqlite3 prisma/dev.db
UPDATE User SET password='<paste-hash-here>' WHERE email='admin@stealthmachinetools.com';
.quit

pm2 restart order-tracker-backend
```

## Testing Endpoints

### Test API Health
```bash
curl http://localhost:4000/auth/check
```

### Test Login
```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stealthmachinetools.com","password":"admin123"}'
```

### Test External Access
```bash
# From another machine
curl http://50.19.66.100:4000/auth/check
curl http://50.19.66.100:3000
```

## File Locations

### Configuration Files
- API Environment: `/var/www/order-tracker/api/.env`
- Frontend Environment: `/var/www/order-tracker/web/.env.local`
- Database: `/var/www/order-tracker/api/prisma/dev.db`
- PM2 Config: `~/.pm2/`

### Log Files
- PM2 Logs: `~/.pm2/logs/`
- Backend Logs: `~/.pm2/logs/order-tracker-backend-*.log`
- Frontend Logs: `~/.pm2/logs/order-tracker-frontend-*.log`

### Backup Locations
- Database backups: `/var/www/order-tracker/api/prisma/dev.db.backup.*`
- Code backups: `/var/www/order-tracker/api/src/index.js.backup.*`

## Environment Variables

### Required API Variables (.env)
```
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=<random-32-char-hex-string>
PORT=4000
CORS_ORIGIN=http://50.19.66.100:3000,http://50.19.66.100
SERVER_IP=50.19.66.100
```

### Required Frontend Variables (.env.local)
```
NEXT_PUBLIC_API_BASE=http://50.19.66.100:4000
NEXT_PUBLIC_API_URL=http://50.19.66.100:4000
API_BASE=http://localhost:4000
```

## Critical Fixes Applied

### 1. Database Write Permissions
The database must be writable by the application user. The deployment script now automatically sets:
- File permissions: 664
- Directory permissions: 775
- Owner: ubuntu:ubuntu

### 2. Measurement Data Type Conversion
The API now converts string measurements to floats:
```javascript
// Before: height: height !== undefined ? height : item.height
// After:  height: height !== undefined ? (height === null || height === "" ? null : parseFloat(height)) : item.height
```

### 3. JWT Secret Generation
The deployment script now auto-generates JWT_SECRET if missing:
```bash
JWT_SECRET=jwt-secret-$(openssl rand -hex 32)
```

## Troubleshooting Checklist

1. **Login not working?**
   - [ ] Check database permissions: `ls -la api/prisma/dev.db`
   - [ ] Verify JWT_SECRET exists: `grep JWT_SECRET api/.env`
   - [ ] Check API logs: `pm2 logs order-tracker-backend`
   - [ ] Test login endpoint directly

2. **Frontend not loading?**
   - [ ] Check if built: `ls -la web/.next`
   - [ ] Verify .env.local: `cat web/.env.local`
   - [ ] Check frontend logs: `pm2 logs order-tracker-frontend`
   - [ ] Rebuild if needed: `cd web && npm run build`

3. **Measurements not saving?**
   - [ ] Check if parseFloat fix is applied: `grep parseFloat api/src/index.js`
   - [ ] Verify database is writable
   - [ ] Check API logs for errors

4. **Services keep restarting?**
   - [ ] Check PM2 logs for errors
   - [ ] Verify all dependencies installed
   - [ ] Check available memory: `free -h`
   - [ ] Check disk space: `df -h`

## Recovery Procedures

### Complete Reset
```bash
cd /var/www/order-tracker

# Stop everything
pm2 delete all

# Reset database
cd api
rm -f prisma/dev.db
npx prisma db push
node prisma/seed.js

# Fix permissions
sudo chown ubuntu:ubuntu prisma/dev.db
sudo chmod 664 prisma/dev.db

# Rebuild frontend
cd ../web
npm run build

# Start everything
cd ..
./deploy-aws.sh
```

### Emergency Backup
```bash
# Backup database
cp api/prisma/dev.db api/prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)

# Backup environment files
cp api/.env api/.env.backup
cp web/.env.local web/.env.local.backup

# Backup code changes
tar -czf backup-$(date +%Y%m%d).tar.gz api/src web/src
```

## Maintenance Tasks

### Weekly
- Check disk space: `df -h`
- Check logs size: `du -sh ~/.pm2/logs/`
- Backup database

### Monthly
- Update dependencies: `npm update` (test in staging first!)
- Rotate PM2 logs: `pm2 flush`
- Review error logs

### As Needed
- Change admin password
- Add/remove users
- Update server IP in configuration files

## Support Information

### Repository
https://github.com/streetunity/order-tracker

### Branch
aws-deployment

### Key Files Modified for AWS Deployment
1. `deploy-aws.sh` - Main deployment script with all fixes
2. `verify-deployment.sh` - Health check script
3. `fix-common-issues.sh` - Automatic issue resolver
4. `api/src/index.js` - Measurement data type fix
5. Environment file templates

## Success Indicators

After successful deployment, you should see:
1. ✅ Both PM2 processes show "online" status
2. ✅ Login returns a JWT token
3. ✅ Frontend loads at http://50.19.66.100:3000
4. ✅ Can login with admin credentials
5. ✅ Can save measurements without errors
6. ✅ Database file has 664 permissions

---

**Last Updated**: September 2025
**Deployment Tested On**: Ubuntu AWS EC2 Instance
**Node Version**: 20.x
**PM2 Version**: Latest