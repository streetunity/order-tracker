import fs from 'fs';

const filePath = './index.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the current DELETE /accounts/:id endpoint
const deleteStartPattern = /app\.delete\('\/accounts\/:id', authGuard, async \(req, res\) => \{/;

const startMatch = content.match(deleteStartPattern);
if (!startMatch) {
  console.error('Could not find DELETE /accounts/:id endpoint');
  process.exit(1);
}

const startIndex = content.indexOf(startMatch[0]);
let endIndex = startIndex;
let braceCount = 0;
let inDelete = false;

for (let i = startIndex; i < content.length; i++) {
  const char = content[i];
  if (char === '{') {
    braceCount++;
    inDelete = true;
  } else if (char === '}') {
    braceCount--;
    if (inDelete && braceCount === 0) {
      const nextTwo = content.substring(i, i + 3);
      if (nextTwo === '});') {
        endIndex = i + 3;
        break;
      }
    }
  }
}

console.log('Found DELETE endpoint from position', startIndex, 'to', endIndex);

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

const newContent = content.substring(0, startIndex) + saferDelete + content.substring(endIndex);
fs.writeFileSync(filePath, newContent, 'utf8');

console.log('✅ Safer delete patch applied successfully!');
