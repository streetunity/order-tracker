#!/bin/bash

# Fix the ordered endpoints placement in index.js
cd /var/www/order-tracker/api/src

# Backup the file
cp index.js index.js.backup-ordered-fix

# Remove the incorrectly placed routes at the end of the file (lines 2282-2291)
# These lines are AFTER the router is used, causing the error
sed -i '2282,2291d' index.js

# Now add them in the correct location
# Find where other order routes are defined (around line 1650)
# Add our routes just before the "Apply the router to the app" comment

# Use a more targeted approach - find the lock/unlock routes and add ours after them
LINE=$(grep -n "router.post('/orders/:id/unlock'" index.js | cut -d: -f1)

if [ -z "$LINE" ]; then
  echo "Could not find unlock route, searching for other order routes..."
  LINE=$(grep -n "router.delete('/orders/:id/items/:itemId'" index.js | cut -d: -f1)
fi

if [ -z "$LINE" ]; then
  echo "Could not find suitable insertion point, adding before app.use(router)"
  LINE=$(grep -n "app.use(router)" index.js | cut -d: -f1)
  LINE=$((LINE - 1))
fi

# Insert the routes after the found line
sed -i "${LINE}a\\
\\
// Mark item as ordered (Admin only)\\
router.post('/orders/:id/items/:itemId/ordered', authenticateToken, async (req, res) => {\\
  const authenticatedUser = req.user;\\
  await markItemAsOrdered(req, res, prisma, authenticatedUser);\\
});\\
\\
// Unmark item as ordered (Admin only, requires reason)\\
router.post('/orders/:id/items/:itemId/unordered', authenticateToken, async (req, res) => {\\
  const authenticatedUser = req.user;\\
  await unmarkItemAsOrdered(req, res, prisma, authenticatedUser);\\
});" index.js

echo "Fixed ordered endpoints placement in index.js"