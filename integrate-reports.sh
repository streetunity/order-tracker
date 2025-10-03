#!/bin/bash
# Quick integration script for reporting suite
# Run this after pulling all the report files

echo "Integrating Reporting Suite into Order Tracker..."

# Backup current index.js
cp api/src/index.js api/src/index.js.backup-reports-$(date +%Y%m%d-%H%M%S)

# The integration will add the reports router to index.js
# This needs to be done manually or with the patch below

cat << 'EOF'
================================================================================
MANUAL INTEGRATION STEPS
================================================================================

1. Open api/src/index.js in your editor

2. Add these imports at the top (after existing imports, around line 14):

import { createReportsRouter } from './routes/reports.js';

3. After the line "app.use(cookieParser());" (around line 65), add:

// Reports Module
const reportsRouter = createReportsRouter(prisma);
app.use('/reports', authGuard, reportsRouter);
console.log('Reports module loaded');

4. Save the file

5. Test by running:
cd /var/www/order-tracker
git pull origin aws-deployment
cd api
npm install
pm2 restart order-tracker-backend

6. Verify reports are working:
pm2 logs order-tracker-backend

You should see "Reports module loaded" in the logs.

7. Test an endpoint:
curl -H "Authorization: Bearer YOUR_TOKEN" \  
  http://localhost:4000/reports/summary

================================================================================
EOF

echo ""
echo "Files are ready. Follow the manual steps above to complete integration."
echo "Backup created: api/src/index.js.backup-reports-$(date +%Y%m%d-%H%M%S)"
