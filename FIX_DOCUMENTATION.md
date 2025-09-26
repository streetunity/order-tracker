# Order Tracker Issues - Root Cause Analysis & Solution

## Problem Summary
Three features were implemented in the code but not showing on the live site:
1. customerDocsLink field not displaying on Edit Order page
2. URL helper text not updated on New Order page  
3. Unlock reason not showing in audit log

## Root Cause Analysis

### The Core Issue: Next.js Build Cache
The primary issue is that **Next.js is serving cached/old build files** despite the source code being updated. This is a common issue with Next.js deployments where:

1. Code changes are made directly on the server (via sed, manual edits, etc.)
2. Git changes are pulled but Next.js isn't rebuilt
3. PM2 restarts the process but uses the old `.next` build directory

### Evidence Found:
- The code in Git repository IS correct (verified via GitHub API)
- The `customerDocsLink` sections ARE present in the Edit Order page (lines 297, 331, etc.)
- The audit log parsing logic IS present (with JSON.parse and metadata.message)
- But the changes don't appear on the live site

This definitively points to a **build/deployment issue**, not a code issue.

## The Solution

### Immediate Fix
Run this command on the server as the ubuntu user:
```bash
cd /var/www/order-tracker
git pull origin aws-deployment
chmod +x quick_fix.sh
./quick_fix.sh
```

### Complete Fix (Recommended)
For a thorough fix that ensures everything is properly synced:
```bash
cd /var/www/order-tracker
git pull origin aws-deployment
chmod +x fix_deployment.sh
./fix_deployment.sh
```

## What the Fix Does

1. **Pulls Latest Code**: Ensures Git repository is up to date
2. **Applies Text Fix**: Updates the helper text on New Order page
3. **Clears Build Cache**: Removes `.next` directory completely
4. **Rebuilds Application**: Runs `npm run build` to create fresh build
5. **Restarts PM2**: Ensures the new build is served

## Verification Steps

After running the fix:

1. **Wait 10-15 seconds** for the application to fully start
2. **Clear browser cache** (Ctrl+Shift+R or Cmd+Shift+R)
3. **Test each feature**:

### Test 1: New Order Page
- Navigate to Create New Order
- Look at Customer Documents Link field
- Helper text should say: "Enter the full URL including http:// or https:// (e.g., https://www.dropbox.com/your-folder)"

### Test 2: Edit Order - customerDocsLink
- Go to any existing order
- In header after "Created by:", should see "Documents: View Files ↗" (if order has customerDocsLink)
- Below lock/unlock section, should see editable "Customer Documents Link" field

### Test 3: Unlock Reason Display
- Find or create a locked order
- Unlock it with a reason
- Check the "Lock/Unlock History" section
- The reason should display under the UNLOCKED action

## Database Verification

Check if data exists:
```bash
# Check customerDocsLink in orders
sqlite3 /var/www/order-tracker/api/prisma/dev.db \
  "SELECT id, customerDocsLink FROM Order WHERE customerDocsLink IS NOT NULL;"

# Check unlock reasons in audit log
sqlite3 /var/www/order-tracker/api/prisma/dev.db \
  "SELECT action, metadata FROM AuditLog WHERE action='UNLOCKED';"
```

## Prevention for Future

To prevent this issue in the future:

1. **Always rebuild after code changes**: 
   ```bash
   cd /var/www/order-tracker/web && npm run build
   ```

2. **Use proper deployment workflow**:
   - Make changes in Git
   - Pull on server
   - Rebuild Next.js
   - Restart PM2

3. **Monitor build status**:
   ```bash
   # Check build ID
   cat /var/www/order-tracker/web/.next/BUILD_ID
   
   # Check build time
   stat /var/www/order-tracker/web/.next/
   ```

## Troubleshooting

If issues persist after running the fix:

1. **Check PM2 logs**:
   ```bash
   pm2 logs order-tracker-frontend --lines 50
   ```

2. **Verify PM2 is running from correct directory**:
   ```bash
   pm2 describe order-tracker-frontend | grep cwd
   ```

3. **Check for build errors**:
   ```bash
   cd /var/www/order-tracker/web
   npm run build
   ```

4. **Ensure no duplicate PM2 processes**:
   ```bash
   pm2 list
   pm2 delete [any duplicates]
   ```

## Technical Details

### Why Manual Edits Didn't Work
- Editing files with `sed` or manually only changes the source code
- Next.js compiles and bundles everything into `.next` directory during build
- Without rebuilding, Next.js continues serving the old compiled version

### Why Git Updates Didn't Show
- Git pull updates the source files
- But PM2 was still serving the old `.next` build
- PM2 restart doesn't trigger a rebuild, just restarts the existing build

### The Build Process
1. Next.js reads all `.jsx` files
2. Compiles them with webpack
3. Creates optimized bundles in `.next` directory
4. PM2 serves these compiled files, NOT the source files

## Contact for Issues
If problems persist after following this guide, check:
- PM2 configuration: `pm2 show order-tracker-frontend`
- Server logs: `/var/log/nginx/error.log`
- Application logs: `pm2 logs`
