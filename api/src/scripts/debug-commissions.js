import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debugCommissions() {
  console.log('=== COMMISSION DEBUGGING REPORT ===\n');

  // Check commission records
  const commissions = await prisma.commission.findMany({
    include: {
      order: {
        select: {
          id: true,
          poNumber: true,
          sku: true,
          discount: true
        }
      },
      itemCommissions: {
        include: {
          item: {
            select: {
              productCode: true,
              currentStage: true,
              isOrdered: true,
              itemPrice: true
            }
          }
        }
      }
    }
  });

  console.log(`Total Commissions: ${commissions.length}\n`);

  // Check commission settings
  const stageSettings = await prisma.commissionStageSetting.findMany({
    orderBy: { sortOrder: 'asc' }
  });

  console.log('Commission Stage Settings:');
  if (stageSettings.length === 0) {
    console.log('  ⚠️  NO STAGE SETTINGS CONFIGURED!');
    console.log('  You need to configure commission stages in the admin panel.');
  } else {
    stageSettings.forEach(setting => {
      console.log(`  - Stage: ${setting.stage}, Percentage: ${setting.percentage}%, Active: ${setting.isActive}`);
    });
  }
  console.log('');

  // Check commission rates
  const rates = await prisma.commissionRate.findMany();
  console.log('Commission Rates:');
  if (rates.length === 0) {
    console.log('  Using default rate (5%) for all sales people');
  } else {
    rates.forEach(rate => {
      console.log(`  - ${rate.salesPersonName}: ${rate.rate}%`);
    });
  }
  console.log('');

  // Check items that should generate commissions
  const ordersWithSalesPerson = await prisma.order.findMany({
    where: {
      sku: { not: null }
    },
    include: {
      items: true,
      account: {
        select: {
          name: true
        }
      }
    }
  });

  console.log(`Orders with Sales Person: ${ordersWithSalesPerson.length}\n`);

  for (const order of ordersWithSalesPerson) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Order ID: ${order.id}`);
    console.log(`  Customer: ${order.account.name}`);
    console.log(`  PO Number: ${order.poNumber || 'None'}`);
    console.log(`  Sales Person: ${order.sku}`);
    console.log(`  Total Items: ${order.items.length}`);
    console.log(`  Discount: $${order.discount || 0}`);
    
    const orderedItems = order.items.filter(i => i.isOrdered);
    const itemsWithPrices = orderedItems.filter(i => i.itemPrice != null);
    
    console.log(`  Items Marked as Ordered: ${orderedItems.length}`);
    console.log(`  Items with Prices: ${itemsWithPrices.length}`);
    
    if (orderedItems.length > 0) {
      console.log('\n  📦 Ordered Items:');
      orderedItems.forEach(item => {
        console.log(`    - ${item.productCode}`);
        console.log(`      Stage: ${item.currentStage}`);
        console.log(`      Price: ${item.itemPrice != null ? '$' + item.itemPrice : '❌ NOT SET'}`);
        console.log(`      Is Ordered: ${item.isOrdered}`);
      });
    } else {
      console.log('  ⚠️  No items marked as ordered yet!');
      console.log('     Items must be marked as "ordered" before commissions calculate.');
    }

    if (orderedItems.length > 0 && itemsWithPrices.length === 0) {
      console.log('\n  ⚠️  WARNING: Items are ordered but have NO PRICES set!');
      console.log('     Commissions cannot calculate without item prices.');
    }

    // Check if commission exists for this order
    const commission = commissions.find(c => c.orderId === order.id);
    if (commission) {
      console.log(`\n  💰 Commission Record:`);
      console.log(`     Total: $${commission.totalCommissionAmount.toFixed(2)} (${commission.commissionRate}%)`);
      console.log(`     Status: ${commission.status}`);
      console.log(`     Flagged: ${commission.isFlagged ? 'YES - ' + commission.flagReason : 'NO'}`);
      
      if (commission.itemCommissions.length > 0) {
        console.log(`\n     Item Commissions: ${commission.itemCommissions.length}`);
        commission.itemCommissions.forEach(ic => {
          const itemPayouts = allPayouts.filter(p => p.itemCommissionId === ic.id);
          console.log(`       - ${ic.productCode}: $${ic.commissionAmount.toFixed(2)}`);
          console.log(`         Item Stage: ${ic.item?.currentStage || 'UNKNOWN'}`);
          console.log(`         Payouts for this item: ${itemPayouts.length}`);
          
          if (itemPayouts.length > 0) {
            itemPayouts.forEach(p => {
              console.log(`           * ${p.stage} (${p.percentage}%): $${p.amount.toFixed(2)} [${p.status}]`);
            });
          }
        });
      }
    } else {
      console.log('\n  ⚠️  No commission record created!');
      console.log('     Try clicking "Recalculate All" in the commission admin page.');
    }
  }

  // Summary of payout statuses
  const allPayouts = await prisma.commissionPayout.findMany({
    include: {
      itemCommission: {
        include: {
          commission: {
            select: {
              orderId: true,
              salesPersonName: true
            }
          }
        }
      }
    }
  });

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('=== PAYOUT SUMMARY ===');
  console.log(`Total Payouts: ${allPayouts.length}`);
  
  const byStatus = {
    PENDING: allPayouts.filter(p => p.status === 'PENDING'),
    WAITING: allPayouts.filter(p => p.status === 'WAITING'),
    APPROVED: allPayouts.filter(p => p.status === 'APPROVED'),
    PAID: allPayouts.filter(p => p.status === 'PAID')
  };

  console.log(`  - PENDING: ${byStatus.PENDING.length} 👈 (should show on admin page)`);
  console.log(`  - WAITING: ${byStatus.WAITING.length} (items not at trigger stage yet)`);
  console.log(`  - APPROVED: ${byStatus.APPROVED.length}`);
  console.log(`  - PAID: ${byStatus.PAID.length}`);

  if (byStatus.PENDING.length > 0) {
    console.log('\n  ✅ PENDING PAYOUTS FOUND:');
    byStatus.PENDING.forEach(payout => {
      console.log(`     - Order: ${payout.itemCommission.commission.orderId.substring(0, 8)}...`);
      console.log(`       Sales Person: ${payout.itemCommission.commission.salesPersonName}`);
      console.log(`       Stage: ${payout.stage}`);
      console.log(`       Amount: $${payout.amount.toFixed(2)}`);
    });
  }

  console.log('\n\n=== DIAGNOSIS ===');
  
  if (ordersWithSalesPerson.length === 0) {
    console.log('❌ PROBLEM: No orders have a sales person assigned');
    console.log('   SOLUTION: Edit orders and set the Sales Person field');
  } else {
    console.log(`✅ Found ${ordersWithSalesPerson.length} orders with sales people assigned`);
  }
  
  const totalOrderedItems = ordersWithSalesPerson.reduce((sum, order) => 
    sum + order.items.filter(i => i.isOrdered).length, 0
  );
  
  if (totalOrderedItems === 0) {
    console.log('❌ PROBLEM: No items are marked as "ordered"');
    console.log('   SOLUTION: Edit order items and check the "Is Ordered" checkbox');
  } else {
    console.log(`✅ Found ${totalOrderedItems} items marked as ordered`);
  }

  const totalPricedItems = ordersWithSalesPerson.reduce((sum, order) => 
    sum + order.items.filter(i => i.isOrdered && i.itemPrice != null).length, 0
  );
  
  if (totalOrderedItems > 0 && totalPricedItems === 0) {
    console.log('❌ PROBLEM: Ordered items have no prices set');
    console.log('   SOLUTION: Edit items and set their prices');
  } else if (totalPricedItems > 0) {
    console.log(`✅ Found ${totalPricedItems} ordered items with prices`);
  }

  if (stageSettings.length === 0) {
    console.log('❌ PROBLEM: No commission stage settings configured');
    console.log('   SOLUTION: Go to Admin → Commission Settings and configure stages');
  } else {
    console.log(`✅ Commission stages configured: ${stageSettings.map(s => s.stage).join(', ')}`);
  }
  
  if (byStatus.PENDING.length === 0 && byStatus.WAITING.length > 0) {
    console.log('⚠️  All payouts are WAITING - items haven\'t reached commission trigger stages yet');
    console.log('   Items must reach stages like SHIPPING or DELIVERED to trigger payouts');
  }

  if (byStatus.PENDING.length === 0 && commissions.length > 0) {
    console.log('\n💡 TIP: If commissions exist but no PENDING payouts:');
    console.log('   1. Check that items have reached the trigger stages (e.g., SHIPPING, DELIVERED)');
    console.log('   2. Verify commission stage settings match your item stages');
    console.log('   3. Try recalculating commissions after items reach trigger stages');
  }

  await prisma.$disconnect();
}

// Define allPayouts at top level so it's accessible
let allPayouts = [];

async function run() {
  // Fetch all payouts first
  allPayouts = await prisma.commissionPayout.findMany({
    include: {
      itemCommission: {
        include: {
          commission: {
            select: {
              orderId: true,
              salesPersonName: true
            }
          }
        }
      }
    }
  });
  
  await debugCommissions();
}

run().catch(console.error);
