#!/bin/bash
# Manual Fix Script - Run this directly on EC2 if deployment script doesn't work

set -e

echo "=========================================="
echo "MANUAL FIX SCRIPT FOR ORDER TRACKER"
echo "=========================================="
echo ""

cd /home/ubuntu/order-tracker

# Stop services first
echo "Stopping services..."
sudo systemctl stop order-tracker-web order-tracker-api

# Fix 1: Ensure New Order page has correct helper text
echo "Fixing New Order page helper text..."
cat > /tmp/fix_new_order.js << 'EOF'
const fs = require('fs');
const path = '/home/ubuntu/order-tracker/web/app/admin/orders/new/page.jsx';
let content = fs.readFileSync(path, 'utf8');

// Find and replace the helper text
const oldText1 = 'Dropbox or other document link for customer files';
const oldText2 = 'Optional: Link to customer documents';
const newText = 'Enter the full URL including http:// or https:// (e.g., Dropbox link)';

if (content.includes(oldText1)) {
    content = content.replace(oldText1, newText);
    console.log('Replaced old helper text variant 1');
} else if (content.includes(oldText2)) {
    content = content.replace(oldText2, newText);
    console.log('Replaced old helper text variant 2');
} else if (content.includes(newText)) {
    console.log('Helper text already correct!');
} else {
    // Find the customerDocsLink section and update it
    const regex = /customerDocsLink[\s\S]*?fontSize.*?12.*?>([^<]+)</;
    const match = content.match(regex);
    if (match) {
        console.log('Found helper text:', match[1]);
        content = content.replace(match[1], newText);
        console.log('Updated helper text');
    }
}

fs.writeFileSync(path, content);
console.log('New Order page fixed!');
EOF

node /tmp/fix_new_order.js

# Fix 2: Verify Edit Order page has metadata parsing
echo "Checking Edit Order page..."
if ! grep -q "JSON.parse(log.metadata)" web/app/admin/orders/[id]/page.jsx; then
    echo "Edit Order page needs metadata parsing fix..."
    # This should already be in the file, but let's verify
    echo "Warning: Metadata parsing not found - file may need manual update"
else
    echo "Edit Order page metadata parsing OK"
fi

# Fix 3: Clear all caches
echo "Clearing all caches..."
cd /home/ubuntu/order-tracker/web
rm -rf .next
rm -rf node_modules/.cache
npm cache clean --force

# Fix 4: Rebuild
echo "Rebuilding application..."
npm install
NODE_ENV=production npm run build

# Fix 5: Restart services
echo "Starting services..."
cd /home/ubuntu/order-tracker
sudo systemctl start order-tracker-api
sleep 3
sudo systemctl start order-tracker-web
sleep 3

# Verify
echo ""
echo "=========================================="
echo "VERIFICATION"
echo "=========================================="
echo ""

# Check services
if systemctl is-active --quiet order-tracker-api; then
    echo "✓ API service running"
else
    echo "✗ API service not running"
fi

if systemctl is-active --quiet order-tracker-web; then
    echo "✓ Web service running"
else
    echo "✗ Web service not running"
fi

# Check actual file content
echo ""
echo "File content verification:"
echo "---------------------------"
echo "New Order helper text:"
grep -A1 -B1 "customerDocsLink" web/app/admin/orders/new/page.jsx | grep -o "Enter the full URL.*" || echo "Not found - needs fix"

echo ""
echo "Edit Order metadata parsing:"
grep -o "JSON.parse(log.metadata)" web/app/admin/orders/[id]/page.jsx || echo "Not found - needs fix"

echo ""
echo "=========================================="
echo "NEXT STEPS:"
echo "=========================================="
echo "1. Clear your browser cache (Ctrl+Shift+R)"
echo "2. Try incognito/private mode"
echo "3. Visit http://50.19.66.100:3000"
echo "4. Check these specific things:"
echo "   - New Order: Helper text under Customer Documents Link"
echo "   - Edit Order: Unlock an order and check if reason shows in history"
echo ""
echo "If still not working, check logs:"
echo "  sudo journalctl -u order-tracker-web -f"
echo "  sudo journalctl -u order-tracker-api -f"
