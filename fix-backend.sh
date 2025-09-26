#!/bin/bash
# Fix customerDocsLink backend support directly on EC2
cd /var/www/order-tracker

# Stop services
sudo systemctl stop order-tracker-api order-tracker-web

# Add customerDocsLink support to backend
cat > /tmp/fix-backend.js << 'EOF'
const fs = require('fs');
const path = '/var/www/order-tracker/api/src/index.js';
let content = fs.readFileSync(path, 'utf8');

// Fix 1: Add customerDocsLink to public order endpoint
content = content.replace(
  'shippingCarrier, trackingNumber, items, statusEvents, account',
  'shippingCarrier, trackingNumber, items, statusEvents, account, customerDocsLink'
);

// Fix 2: Add customerDocsLink to create order
content = content.replace(
  'const { accountId, poNumber, sku, items = [] } = req.body',
  'const { accountId, poNumber, sku, items = [], customerDocsLink } = req.body'
);

// Fix 3: Add customerDocsLink to order creation data
content = content.replace(
  'trackingToken,\n          createdByUserId: req.user.id,',
  'trackingToken,\n          customerDocsLink: customerDocsLink ?? null,\n          createdByUserId: req.user.id,'
);

// Fix 4: Add customerDocsLink to order update (find the PATCH /orders/:id endpoint)
// This is trickier - we need to add support before the lock check
const patchOrderRegex = /app\.patch\('\/orders\/:id', authGuard, async \(req, res\) => \{[\s\S]*?const original = await prisma\.order\.findUnique[\s\S]*?\}\);[\s\S]*?if \(original\.isLocked\)/;
const match = content.match(patchOrderRegex);

if (match) {
  const originalSection = match[0];
  const modifiedSection = originalSection.replace(
    'if (original.isLocked)',
    `// Handle customerDocsLink update (allowed even when locked)
    const { customerDocsLink } = req.body || {};
    if (customerDocsLink !== undefined && customerDocsLink !== original.customerDocsLink) {
      const updatedOrder = await prisma.order.update({
        where: { id: req.params.id },
        data: { customerDocsLink },
        include: { account: true, items: true }
      });
      await createAuditLog({
        entityType: 'Order',
        entityId: req.params.id,
        parentEntityId: req.params.id,
        action: 'ORDER_UPDATED',
        changes: [{
          field: 'customerDocsLink',
          oldValue: original.customerDocsLink || 'null',
          newValue: customerDocsLink || 'null'
        }],
        userId: req.user.id,
        userName: req.user.name
      });
      return res.json(updatedOrder);
    }
    
    if (original.isLocked)`
  );
  content = content.replace(originalSection, modifiedSection);
}

fs.writeFileSync(path, content);
console.log('Backend patched successfully!');
EOF

node /tmp/fix-backend.js

# Rebuild and restart
cd /var/www/order-tracker/web
rm -rf .next
npm run build

# Start services
sudo systemctl start order-tracker-api
sleep 2
sudo systemctl start order-tracker-web

echo "Fix applied! Test at http://50.19.66.100:3000"
