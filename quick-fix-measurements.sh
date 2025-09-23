#!/bin/bash
# quick-fix-measurements.sh
# Quick fix for measurement data type issue

echo "Fixing measurement data type issue..."

cd /var/www/order-tracker/api

# Backup the current file
cp src/index.js src/index.js.backup

# Fix the measurement endpoint to convert strings to numbers
# Line ~306: Fix the measurement update
sed -i '306s/.*/          height: height !== undefined ? (height === null ? null : parseFloat(height)) : item.height,/' src/index.js
sed -i '307s/.*/          width: width !== undefined ? (width === null ? null : parseFloat(width)) : item.width,/' src/index.js
sed -i '308s/.*/          length: length !== undefined ? (length === null ? null : parseFloat(length)) : item.length,/' src/index.js
sed -i '309s/.*/          weight: weight !== undefined ? (weight === null ? null : parseFloat(weight)) : item.weight,/' src/index.js

echo "✓ Fixed measurement endpoint"

# Restart the API
pm2 restart order-tracker-backend

echo "✓ API restarted"
echo ""
echo "Measurements should now work properly!"
