#!/bin/bash

# Fix measurements string to float conversion in backend
# This script updates the measurements endpoint to convert string values to floats

echo "Applying measurements string-to-float conversion fix..."

# Backup the original file
cp /var/www/order-tracker/api/src/index.js /var/www/order-tracker/api/src/index.js.backup-$(date +%Y%m%d%H%M%S)

# Apply the fix using sed to replace the problematic lines
# We need to find the measurements update section and fix it

cat > /tmp/measurements_fix.js << 'EOF'
// Fix for measurements endpoint
// Find this section in index.js (around line 306):
//   data: {
//     height: height !== undefined ? height : item.height,
//     width: width !== undefined ? width : item.width,
//     length: length !== undefined ? length : item.length,
//     weight: weight !== undefined ? weight : item.weight,

// And replace with:
//   data: {
//     height: height !== undefined ? (height !== null ? parseFloat(height) : null) : item.height,
//     width: width !== undefined ? (width !== null ? parseFloat(width) : null) : item.width,
//     length: length !== undefined ? (length !== null ? parseFloat(length) : null) : item.length,
//     weight: weight !== undefined ? (weight !== null ? parseFloat(weight) : null) : item.weight,

// Using sed to make the replacement
sed -i 's/height: height !== undefined ? height : item.height/height: height !== undefined ? (height !== null ? parseFloat(height) : null) : item.height/g' /var/www/order-tracker/api/src/index.js
sed -i 's/width: width !== undefined ? width : item.width/width: width !== undefined ? (width !== null ? parseFloat(width) : null) : item.width/g' /var/www/order-tracker/api/src/index.js
sed -i 's/length: length !== undefined ? length : item.length/length: length !== undefined ? (length !== null ? parseFloat(length) : null) : item.length/g' /var/www/order-tracker/api/src/index.js
sed -i 's/weight: weight !== undefined ? weight : item.weight/weight: weight !== undefined ? (weight !== null ? parseFloat(weight) : null) : item.weight/g' /var/www/order-tracker/api/src/index.js

# Also fix the bulk measurements endpoint
sed -i 's/data.height = updateData.height;/data.height = parseFloat(updateData.height);/g' /var/www/order-tracker/api/src/index.js
sed -i 's/data.width = updateData.width;/data.width = parseFloat(updateData.width);/g' /var/www/order-tracker/api/src/index.js
sed -i 's/data.length = updateData.length;/data.length = parseFloat(updateData.length);/g' /var/www/order-tracker/api/src/index.js
sed -i 's/data.weight = updateData.weight;/data.weight = parseFloat(updateData.weight);/g' /var/www/order-tracker/api/src/index.js
EOF

# Execute the sed commands
sed -i 's/height: height !== undefined ? height : item.height/height: height !== undefined ? (height !== null ? parseFloat(height) : null) : item.height/g' /var/www/order-tracker/api/src/index.js
sed -i 's/width: width !== undefined ? width : item.width/width: width !== undefined ? (width !== null ? parseFloat(width) : null) : item.width/g' /var/www/order-tracker/api/src/index.js
sed -i 's/length: length !== undefined ? length : item.length/length: length !== undefined ? (length !== null ? parseFloat(length) : null) : item.length/g' /var/www/order-tracker/api/src/index.js
sed -i 's/weight: weight !== undefined ? weight : item.weight/weight: weight !== undefined ? (weight !== null ? parseFloat(weight) : null) : item.weight/g' /var/www/order-tracker/api/src/index.js

# Fix bulk measurements endpoint
sed -i 's/data.height = updateData.height;/data.height = parseFloat(updateData.height);/g' /var/www/order-tracker/api/src/index.js
sed -i 's/data.width = updateData.width;/data.width = parseFloat(updateData.width);/g' /var/www/order-tracker/api/src/index.js
sed -i 's/data.length = updateData.length;/data.length = parseFloat(updateData.length);/g' /var/www/order-tracker/api/src/index.js
sed -i 's/data.weight = updateData.weight;/data.weight = parseFloat(updateData.weight);/g' /var/www/order-tracker/api/src/index.js

echo "Fix applied. Restarting backend..."
cd /var/www/order-tracker
pm2 restart order-tracker-backend

echo "Done! The measurements should now save correctly."
echo "Test it by trying to update measurements again."