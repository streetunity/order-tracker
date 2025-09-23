#!/bin/bash

# Fix Dynamic Route Conflict Script
# This script removes the conflicting [orderId] routes that are causing Next.js build errors

echo "🔧 Fixing Next.js dynamic route conflict..."
echo "   Removing conflicting [orderId] routes..."

# Navigate to the web directory
cd "$(dirname "$0")"

# Remove the entire [orderId] directory structure
if [ -d "app/api/orders/[orderId]" ]; then
    echo "   ✓ Removing app/api/orders/[orderId] directory..."
    rm -rf "app/api/orders/[orderId]"
    echo "   ✓ Deleted [orderId] routes"
else
    echo "   ℹ️  [orderId] directory not found (may already be deleted)"
fi

# Clear Next.js cache
if [ -d ".next" ]; then
    echo "   ✓ Clearing Next.js cache..."
    rm -rf .next
    echo "   ✓ Cache cleared"
fi

echo ""
echo "✅ Fix complete! The conflicting routes have been removed."
echo ""
echo "📝 Next steps:"
echo "   1. Commit these changes: git add -A && git commit -m 'Remove conflicting [orderId] routes'"
echo "   2. Push to remote: git push origin feature/add-measurements"
echo "   3. Restart your dev server: npm run dev"
echo ""
echo "The measurement routes are now properly located at:"
echo "   • /api/orders/[id]/items/[itemId]/measurements"
echo "   • /api/orders/[id]/measurements/bulk"
