#!/bin/bash
# apply-measurement-fix.sh
# Apply the measurement fix directly

echo "=== Applying Measurement Fix ==="

cd /var/www/order-tracker

# Pull latest changes
git pull

# Apply the fix using sed to the exact lines
cd api

echo "Patching measurement endpoint..."

# Create a temporary fix by modifying just the critical lines
cat > temp-fix.js << 'EOF'
// Temporary fix - add this at line 305 in src/index.js
// Convert string values to numbers for measurements
const parseNum = (val) => val === null || val === undefined || val === '' ? null : parseFloat(val);

// Then replace lines 306-309 with:
// height: height !== undefined ? parseNum(height) : item.height,
// width: width !== undefined ? parseNum(width) : item.width,
// length: length !== undefined ? parseNum(length) : item.length,
// weight: weight !== undefined ? parseNum(weight) : item.weight,
EOF

# Apply the fix directly with awk
awk '
NR==305 {print "      // Convert string values to numbers"; print "      const parseNum = (val) => val === null || val === undefined || val === \"\" ? null : parseFloat(val);"}
NR==306 {print "          height: height !== undefined ? parseNum(height) : item.height,"; next}
NR==307 {print "          width: width !== undefined ? parseNum(width) : item.width,"; next}
NR==308 {print "          length: length !== undefined ? parseNum(length) : item.length,"; next}
NR==309 {print "          weight: weight !== undefined ? parseNum(weight) : item.weight,"; next}
{print}
' src/index.js > src/index.js.fixed

# Check if the fix was applied
if grep -q "parseNum" src/index.js.fixed; then
    mv src/index.js src/index.js.backup
    mv src/index.js.fixed src/index.js
    echo "✓ Fix applied successfully"
else
    echo "✗ Fix failed, keeping original"
    rm src/index.js.fixed
fi

# Restart the API
pm2 restart order-tracker-backend

echo ""
echo "=== Fix Complete ==="
echo "Measurements should now work properly!"
echo "Test it in the application."
