#!/bin/bash

# apply-ordered-endpoints.sh
# Script to apply ordered endpoints functionality to the API

echo "Applying ordered endpoints patch..."

cd /var/www/order-tracker/api

# Backup current index.js
cp src/index.js src/index.js.backup-$(date +%Y%m%d-%H%M%S)

# Apply the patch
patch -p0 < src/ordered-endpoints.patch

if [ $? -eq 0 ]; then
    echo "✓ Patch applied successfully"
else
    echo "✗ Failed to apply patch, attempting manual integration..."
    
    # Manual integration as fallback
    # Add the require statement
    sed -i "/const state = require('.\/state');/a const { markItemAsOrdered, unmarkItemAsOrdered } = require('./ordered-endpoints');" src/index.js
    
    # Add the routes before the "Apply the router to the app" comment
    sed -i "/\/\/ Apply the router to the app/i\
// Mark item as ordered (Admin only)\n\
router.post('/orders/:id/items/:itemId/ordered', authenticateToken, async (req, res) => {\n\
  const authenticatedUser = req.user;\n\
  await markItemAsOrdered(req, res, prisma, authenticatedUser);\n\
});\n\
\n\
// Unmark item as ordered (Admin only, requires reason)\n\
router.post('/orders/:id/items/:itemId/unordered', authenticateToken, async (req, res) => {\n\
  const authenticatedUser = req.user;\n\
  await unmarkItemAsOrdered(req, res, prisma, authenticatedUser);\n\
});\n" src/index.js
    
    echo "✓ Manual integration completed"
fi

echo "API endpoints added for ordered/unordered functionality"