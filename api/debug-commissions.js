// Debug script to check commission status
// Run with: node debug-commissions.js

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debugCommissions() {
  console.log('\n========================================');
  console.log('COMMISSION DEBUG REPORT');
  console.log('========================================\n');

  // 1. Check total orders
  const totalOrders = await prisma.order.count();
  console.log(`📦 Total Orders: ${totalOrders}`);

  // 2. Check orders with sales person assigned
  const ordersWithSalesPerson = await prisma.order.count({
    where: {
      sku: { not: null }
    }
  });
  console.log(`👤 Orders with Sales Person: ${ordersWithSalesPerson}`);

  // 3. Check total commissions
  const totalCommissions = await prisma.commission.count();
  console.log(`💰 Total Commissions Created: ${totalCommissions}`);

  // 4. Check commission statuses
  const commissionsByStatus = await prisma.commission.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('\n📊 Commissions by Status:');
  commissionsByStatus.forEach(s => {
    console.log(`   ${s.status}: ${s._count}`);
  });

  // 5. Check total payouts
  const totalPayouts = await prisma.commissionPayout.count();
  console.log(`\n💸 Total Payouts Created: ${totalPayouts}`);

  // 6. Check payout statuses
  const payoutsByStatus = await prisma.commissionPayout.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('\n📊 Payouts by Status:');
  payoutsByStatus.forEach(s => {
    console.log(`   ${s.status}: ${s._count}`);
  });

  // 7. Check items with isOrdered = true
  const orderedItems = await prisma.orderItem.count({
    where: { isOrdered: true }
  });
  const totalItems = await prisma.orderItem.count();
  console.log(`\n📋 Items Marked as Ordered: ${orderedItems} / ${totalItems}`);

  // 8. Check items with prices
  const itemsWithPrices = await prisma.orderItem.count({
    where: {
      itemPrice: { gt: 0 }
    }
  });
  console.log(`💵 Items with Prices: ${itemsWithPrices} / ${totalItems}`);

  // 9. Check current stage distribution
  const itemsByStage = await prisma.orderItem.groupBy({
    by: ['currentStage'],
    _count: true
  });
  console.log('\n📍 Items by Current Stage:');
  itemsByStage.forEach(s => {
    console.log(`   ${s.currentStage || 'NULL'}: ${s._count}`);
  });

  // 10. Check commission stage settings
  const stageSettings = await prisma.commissionStageSetting.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  });
  console.log('\n⚙️  Active Commission Stage Settings:');
  stageSettings.forEach(s => {
    console.log(`   ${s.stage}: ${s.percentage}%`);
  });

  // 11. Sample commission with details
  const sampleCommission = await prisma.commission.findFirst({
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          sku: true
        }
      },
      itemCommissions: {
        include: {
          payouts: true,
          item: {
            select: {
              id: true,
              productCode: true,
              isOrdered: true,
              currentStage: true,
              itemPrice: true
            }
          }
        }
      }
    }
  });

  if (sampleCommission) {
    console.log('\n🔍 Sample Commission Details:');
    console.log(`   Commission ID: ${sampleCommission.id}`);
    console.log(`   Order: ${sampleCommission.order.orderNumber || sampleCommission.order.id}`);
    console.log(`   Sales Person: ${sampleCommission.salesPersonName}`);
    console.log(`   Status: ${sampleCommission.status}`);
    console.log(`   Total Amount: $${sampleCommission.totalCommissionAmount}`);
    
    if (sampleCommission.itemCommissions.length > 0) {
      const ic = sampleCommission.itemCommissions[0];
      console.log(`\n   Sample Item Commission:`);
      console.log(`      Product: ${ic.item.productCode}`);
      console.log(`      Is Ordered: ${ic.item.isOrdered}`);
      console.log(`      Current Stage: ${ic.item.currentStage}`);
      console.log(`      Item Price: $${ic.item.itemPrice}`);
      console.log(`      Commission Amount: $${ic.commissionAmount}`);
      
      if (ic.payouts.length > 0) {
        console.log(`\n   Payouts for this item:`);
        ic.payouts.forEach(p => {
          console.log(`      ${p.stage}: $${p.amount} - Status: ${p.status}`);
        });
      }
    }
  }

  // 12. Check for WAITING payouts that could be triggered
  const waitingPayouts = await prisma.commissionPayout.findMany({
    where: { status: 'WAITING' },
    include: {
      itemCommission: {
        include: {
          item: {
            select: {
              id: true,
              productCode: true,
              isOrdered: true,
              currentStage: true
            }
          }
        }
      }
    },
    take: 5
  });

  console.log(`\n⏳ Sample WAITING Payouts (showing up to 5):`);
  waitingPayouts.forEach(p => {
    const item = p.itemCommission.item;
    console.log(`   ${item.productCode}: ${p.stage} payout ($${p.amount})`);
    console.log(`      Item Ordered: ${item.isOrdered}, Current Stage: ${item.currentStage}`);
  });

  console.log('\n========================================');
  console.log('KEY INSIGHTS:');
  console.log('========================================');
  
  if (ordersWithSalesPerson === 0) {
    console.log('⚠️  NO ORDERS have a Sales Person assigned!');
    console.log('   → Orders need a value in the SKU field (Sales Person)');
  }
  
  if (itemsWithPrices === 0) {
    console.log('⚠️  NO ITEMS have prices set!');
    console.log('   → Items need itemPrice > 0 for commissions to calculate');
  }
  
  if (orderedItems === 0) {
    console.log('⚠️  NO ITEMS are marked as ordered!');
    console.log('   → Items must have isOrdered = true for payouts to trigger');
    console.log('   → This is the NEW requirement as of the latest changes');
  }

  if (totalPayouts > 0 && payoutsByStatus.every(s => s.status === 'WAITING')) {
    console.log('⚠️  ALL PAYOUTS are in WAITING status!');
    console.log('   → Payouts need items to be:');
    console.log('      1. Marked as ordered (isOrdered = true)');
    console.log('      2. At or past the commission trigger stage');
  }

  console.log('\n');
  
  await prisma.$disconnect();
}

debugCommissions().catch(console.error);
