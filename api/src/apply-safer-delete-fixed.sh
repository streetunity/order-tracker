#!/bin/bash

# Script to apply safer delete patch to index.js
# Run this from the api/src directory

echo "Applying safer delete patch to index.js..."

# Check if index.js exists in current directory
if [ ! -f "index.js" ]; then
  echo "Error: index.js not found in current directory"
  echo "Please run this script from the api/src directory"
  exit 1
fi

# Create a backup
cp index.js index.js.backup
echo "Created backup: index.js.backup"

# Apply the safer delete implementation
cat > apply-patch.js << 'EOF'
const fs = require('fs');

const filePath = './index.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the current DELETE /accounts/:id endpoint
const deleteStartPattern = /app\.delete\('\/accounts\/:id', authGuard, async \(req, res\) => \{/;

// Find start and end positions
const startMatch = content.match(deleteStartPattern);
if (!startMatch) {
  console.error('Could not find DELETE /accounts/:id endpoint');
  process.exit(1);
}

const startIndex = content.indexOf(startMatch[0]);
let endIndex = startIndex;
let braceCount = 0;
let inDelete = false;

// Find the closing of the delete endpoint
for (let i = startIndex; i < content.length; i++) {
  const char = content[i];
  if (char === '{') {
    braceCount++;
    inDelete = true;
  } else if (char === '}') {
    braceCount--;
    if (inDelete && braceCount === 0) {
      // Check if this is followed by );
      const nextTwo = content.substring(i, i + 3);
      if (nextTwo === '});') {
        endIndex = i + 3;
        break;
      }
    }
  }
}

console.log('Found DELETE endpoint from position', startIndex, 'to', endIndex);

// The safer delete implementation
const saferDelete = `app.delete('/accounts/:id', authGuard, async (req, res) => {
  try {
    // First check if account exists and get order count
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          select: {
            id: true,
            poNumber: true,
            createdAt: true
          }
        }
      }
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Check if there are any associated orders
    if (account.orders && account.orders.length > 0) {
      // Build a helpful error message with order details
      const orderDetails = account.orders.slice(0, 3).map(o => 
        \`PO#\${o.poNumber || 'N/A'} (\${new Date(o.createdAt).toLocaleDateString()})\`
      ).join(', ');
      
      const moreOrders = account.orders.length > 3 
        ? \` and \${account.orders.length - 3} more\` 
        : '';
      
      return res.status(400).json({
        error: \`Cannot delete customer "\${account.name}" because they have \${account.orders.length} associated order(s): \${orderDetails}\${moreOrders}. Please delete all orders first.\`
      });
    }
    
    // Safe to delete - no orders associated
    await prisma.$transaction(async (tx) => {
      // Log deletion using new audit system
      await tx.auditLog.create({
        data: {
          entityType: 'Account',
          entityId: account.id,
          action: 'ACCOUNT_DELETED',
          metadata: JSON.stringify({ 
            message: \`Account "\${account.name}" deleted (no associated orders)\` 
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      // Delete the account
      await tx.account.delete({ 
        where: { id: req.params.id } 
      });
    });
    
    res.status(204).end();
  } catch (e) {
    // This will catch any foreign key constraint errors as a fallback
    if (e.code === 'P2003') {
      console.error('Foreign key constraint error:', e);
      return res.status(400).json({ 
        error: 'Cannot delete this customer because they have associated orders. Please delete all orders first.' 
      });
    }
    console.error('Account deletion error:', e);
    res.status(500).json({ error: e.message });
  }
});`;

// Replace the old delete endpoint with the safer one
const newContent = content.substring(0, startIndex) + saferDelete + content.substring(endIndex);

// Write the updated content back
fs.writeFileSync(filePath, newContent, 'utf8');

console.log('✅ Safer delete patch applied successfully!');
console.log('   - Checks for associated orders before deletion');
console.log('   - Provides detailed error messages');
console.log('   - Prevents orphaned orders');
EOF

# Run the patch application
node apply-patch.js

# Clean up
rm apply-patch.js

echo ""
echo "✅ Patch applied successfully!"
echo "   Please restart your API server:"
echo "   pm2 restart api"
