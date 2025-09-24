#!/bin/bash
# fix-measurements-type-conversion.sh
# Dynamically finds and fixes the measurements string-to-float conversion issue

echo "=== Applying Measurements Type Conversion Fix ==="
echo "Finding and fixing measurement endpoints..."

cd /var/www/order-tracker/api

# Backup the original file
cp src/index.js src/index.js.backup-$(date +%Y%m%d-%H%M%S)
echo "✓ Backup created"

# Create a Node.js script to properly fix the measurements
cat > fix-measurements.js << 'EOF'
const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/index.js', 'utf8');

// Fix 1: Individual measurements endpoint (around line 306 based on error logs)
// Find and replace the pattern in the update function
const pattern1 = /height: height !== undefined \? height : item\.height,/g;
const replacement1 = 'height: height !== undefined ? (height !== null && height !== "" ? parseFloat(height) : null) : item.height,';
content = content.replace(pattern1, replacement1);

const pattern2 = /width: width !== undefined \? width : item\.width,/g;
const replacement2 = 'width: width !== undefined ? (width !== null && width !== "" ? parseFloat(width) : null) : item.width,';
content = content.replace(pattern2, replacement2);

const pattern3 = /length: length !== undefined \? length : item\.length,/g;
const replacement3 = 'length: length !== undefined ? (length !== null && length !== "" ? parseFloat(length) : null) : item.length,';
content = content.replace(pattern3, replacement3);

const pattern4 = /weight: weight !== undefined \? weight : item\.weight,/g;
const replacement4 = 'weight: weight !== undefined ? (weight !== null && weight !== "" ? parseFloat(weight) : null) : item.weight,';
content = content.replace(pattern4, replacement4);

// Fix 2: Bulk measurements endpoint
// Fix assignments like data.height = updateData.height;
const bulkPattern1 = /data\.height = updateData\.height;/g;
const bulkReplacement1 = 'data.height = parseFloat(updateData.height);';
content = content.replace(bulkPattern1, bulkReplacement1);

const bulkPattern2 = /data\.width = updateData\.width;/g;
const bulkReplacement2 = 'data.width = parseFloat(updateData.width);';
content = content.replace(bulkPattern2, bulkReplacement2);

const bulkPattern3 = /data\.length = updateData\.length;/g;
const bulkReplacement3 = 'data.length = parseFloat(updateData.length);';
content = content.replace(bulkPattern3, bulkReplacement3);

const bulkPattern4 = /data\.weight = updateData\.weight;/g;
const bulkReplacement4 = 'data.weight = parseFloat(updateData.weight);';
content = content.replace(bulkPattern4, bulkReplacement4);

// Fix 3: Also fix the item PATCH endpoint (non-measurement specific)
// This handles the general item update endpoint
const itemPattern1 = /data\.height = height;/g;
const itemReplacement1 = 'data.height = parseFloat(height);';
content = content.replace(itemPattern1, itemReplacement1);

const itemPattern2 = /data\.width = width;/g;
const itemReplacement2 = 'data.width = parseFloat(width);';
content = content.replace(itemPattern2, itemReplacement2);

const itemPattern3 = /data\.length = length;/g;
const itemReplacement3 = 'data.length = parseFloat(length);';
content = content.replace(itemPattern3, itemReplacement3);

const itemPattern4 = /data\.weight = weight;/g;
const itemReplacement4 = 'data.weight = parseFloat(weight);';
content = content.replace(itemPattern4, itemReplacement4);

// Write the fixed content back
fs.writeFileSync('src/index.js', content);

console.log('✓ Measurements type conversion fix applied successfully');
console.log('Fixed the following patterns:');
console.log('  - Individual measurements endpoint');
console.log('  - Bulk measurements endpoint');
console.log('  - Item PATCH endpoint');
EOF

# Run the fix script
node fix-measurements.js

# Clean up
rm fix-measurements.js

# Verify the fix was applied
echo ""
echo "Verifying fix..."
if grep -q "parseFloat(height)" src/index.js; then
    echo "✓ Fix verified - parseFloat conversions found in code"
else
    echo "⚠ Warning: Fix may not have been applied correctly"
    echo "Please check src/index.js manually"
fi

# Restart the backend
echo ""
echo "Restarting backend..."
pm2 restart order-tracker-backend

# Show status
pm2 status order-tracker-backend

echo ""
echo "=== Fix Complete ==="
echo "The measurements endpoint should now properly convert strings to floats."
echo "Test by updating measurements in the application."
echo ""
echo "If issues persist, check the logs with:"
echo "  pm2 logs order-tracker-backend --lines 50"
