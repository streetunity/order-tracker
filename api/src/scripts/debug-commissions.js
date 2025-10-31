const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugCommissions() {
  console.log('=== COMMISSION DEBUGGING REPORT ===\n');

  // Check commission records
  const commissions = await prisma.commission.findMany({
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          sku: true,
          customer: true
        }
      },
      payouts: true
    }
  });

  console.log(`Total Commissions: ${commissions.length}\n`);

  // Check commission settings
  const stageSettings = await prisma.commissionStageSetting.findMany({
    orderBy: { stage: 'asc' }
  });

  console.log('Commission Stage Settings:');
  stageSettings.forEach(setting => {
    console.log(`  - Stage: ${setting.stage}, Percentage: ${setting.percentage}%`);
  });
  console.log('');

  // Check items that should generate commissions
  const ordersWithSalesPerson = await prisma.order.findMany({
    where: {
      sku: { not: null },
      isDeleted: false
    },
    include: {
      items: true
    }
  });

  console.log(`Orders with Sales Person: ${ordersWithSalesPerson.length}\n`);

  for (const order of ordersWithSalesPerson) {
    console.log(`\nOrder #${order.orderNumber} (${order.customer})`);
    console.log(`  Sales Person: ${order.sku}`);
    console.log(`  Items: ${order.items.length}`);
    
    const orderedItems = order.items.filter(i => i.isOrdered);
    console.log(`  Items Marked as Ordered: ${orderedItems.length}`);
    
    if (orderedItems.length > 0) {
      console.log('  Item Details:');
      orderedItems.forEach(item => {
        console.log(`    - ${item.description || 'No description'}`);
        console.log(`      Current Stage: ${item.currentStage}`);
        console.log(`      Price: $${item.price || 0}`);
        console.log(`      Is Ordered: ${item.isOrdered}`);
      });
    } else {
      console.log('  ⚠️  No items marked as ordered yet!');
    }

    // Check if commission exists for this order
    const commission = commissions.find(c => c.orderId === order.id);
    if (commission) {
      console.log(`  Commission: $${commission.calculatedAmount.toFixed(2)} (${commission.rate}%)`);
      console.log(`  Payouts: ${commission.payouts.length}`);
      
      if (commission.payouts.length > 0) {
        const pendingPayouts = commission.payouts.filter(p => p.status === 'PENDING');
        const waitingPayouts = commission.payouts.filter(p => p.status === 'WAITING');
        console.log(`    - Pending: ${pendingPayouts.length}`);
        console.log(`    - Waiting: ${waitingPayouts.length}`);
        
        commission.payouts.forEach(payout => {
          console.log(`    - ${payout.stage}: $${payout.amount.toFixed(2)} [${payout.status}]`);
        });
      }
    } else {
      console.log('  ⚠️  No commission record created!');
    }
  }

  // Summary of payout statuses
  const allPayouts = await prisma.commissionPayout.findMany({
    include: {
      commission: {
        include: {
          order: {
            select: { orderNumber: true }
          }
        }
      }
    }
  });

  console.log('\n\n=== PAYOUT SUMMARY ===');
  console.log(`Total Payouts: ${allPayouts.length}`);
  
  const byStatus = {
    PENDING: allPayouts.filter(p => p.status === 'PENDING'),
    WAITING: allPayouts.filter(p => p.status === 'WAITING'),
    APPROVED: allPayouts.filter(p => p.status === 'APPROVED'),
    PAID: allPayouts.filter(p => p.status === 'PAID')
  };

  console.log(`  - PENDING: ${byStatus.PENDING.length} (should show on admin page)`);
  console.log(`  - WAITING: ${byStatus.WAITING.length} (not ready yet)`);
  console.log(`  - APPROVED: ${byStatus.APPROVED.length}`);
  console.log(`  - PAID: ${byStatus.PAID.length}`);

  console.log('\n=== LIKELY ISSUES ===');
  
  if (ordersWithSalesPerson.length === 0) {
    console.log('❌ No orders have a sales person assigned (sku field is empty)');
  }
  
  const totalOrderedItems = ordersWithSalesPerson.reduce((sum, order) => 
    sum + order.items.filter(i => i.isOrdered).length, 0
  );
  
  if (totalOrderedItems === 0) {
    console.log('❌ No items are marked as "isOrdered = true"');
    console.log('   Items need to be marked as ordered before commissions calculate');
  }
  
  if (byStatus.PENDING.length === 0 && byStatus.WAITING.length > 0) {
    console.log('⚠️  All payouts are WAITING - items haven\'t reached commission trigger stages yet');
  }

  await prisma.$disconnect();
}

debugCommissions().catch(console.error);
