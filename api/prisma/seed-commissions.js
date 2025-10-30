const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding commission data...');

  try {
    // 1. Set default commission rates for existing sales reps
    console.log('\n📊 Setting default commission rates...');
    const users = await prisma.user.findMany({
      where: { 
        showInSalesRepDropdown: true,
        isActive: true
      }
    });

    for (const user of users) {
      const existing = await prisma.commissionRate.findUnique({
        where: { salesPersonName: user.name }
      });
      
      if (!existing) {
        await prisma.commissionRate.create({
          data: {
            salesPersonName: user.name,
            rate: 5.0,
            setByName: 'System',
            notes: 'Default rate set during initial deployment'
          }
        });
        console.log(`✅ Set default 5% rate for ${user.name}`);
      } else {
        console.log(`⏭️  ${user.name} already has a custom rate of ${existing.rate}%`);
      }
    }

    // 2. Create default stage settings (50% SHIPPING, 50% DELIVERED)
    console.log('\n⚙️  Setting up stage distribution...');
    
    const shippingStage = await prisma.commissionStageSetting.findUnique({
      where: { stage: 'SHIPPING' }
    });
    
    if (!shippingStage) {
      await prisma.commissionStageSetting.create({
        data: {
          stage: 'SHIPPING',
          percentage: 50.0,
          sortOrder: 1,
          isActive: true,
          updatedByName: 'System'
        }
      });
      console.log('✅ Created SHIPPING stage setting (50%)');
    } else {
      console.log(`⏭️  SHIPPING stage already configured at ${shippingStage.percentage}%`);
    }

    const deliveredStage = await prisma.commissionStageSetting.findUnique({
      where: { stage: 'DELIVERED' }
    });
    
    if (!deliveredStage) {
      await prisma.commissionStageSetting.create({
        data: {
          stage: 'DELIVERED',
          percentage: 50.0,
          sortOrder: 2,
          isActive: true,
          updatedByName: 'System'
        }
      });
      console.log('✅ Created DELIVERED stage setting (50%)');
    } else {
      console.log(`⏭️  DELIVERED stage already configured at ${deliveredStage.percentage}%`);
    }

    // 3. Process existing orders to create commissions
    console.log('\n💰 Processing existing orders for commission calculation...');
    
    const orders = await prisma.order.findMany({
      where: {
        sku: {
          not: null
        }
      },
      include: {
        items: true
      }
    });

    console.log(`Found ${orders.length} orders with sales reps`);
    
    let created = 0;
    let skipped = 0;
    let flagged = 0;

    for (const order of orders) {
      // Check if commission already exists
      const existingCommission = await prisma.commission.findFirst({
        where: { orderId: order.id }
      });

      if (existingCommission) {
        skipped++;
        continue;
      }

      // Calculate order total
      const orderTotal = order.items.reduce((sum, item) => {
        return sum + (item.itemPrice || 0);
      }, 0);

      // Check if all items have prices
      const missingPrices = order.items.some(item => !item.itemPrice);

      // Get commission rate
      const rateRecord = await prisma.commissionRate.findUnique({
        where: { salesPersonName: order.sku }
      });
      const rate = rateRecord?.rate || 5.0;

      // Calculate commission amount
      const commissionAmount = Math.round((orderTotal * rate) / 100 * 100) / 100;

      // Create price snapshot
      const priceSnapshot = order.items.map(item => ({
        itemId: item.id,
        productCode: item.productCode,
        price: item.itemPrice || 0
      }));

      // Create commission
      const commission = await prisma.commission.create({
        data: {
          orderId: order.id,
          salesPersonName: order.sku,
          orderTotalAmount: orderTotal,
          commissionRate: rate,
          totalCommissionAmount: commissionAmount,
          status: missingPrices ? 'AWAITING_PRICES' : 'CALCULATED',
          isFlagged: missingPrices,
          flagReason: missingPrices ? 'AWAITING_PRICES' : null,
          itemPricesSnapshot: JSON.stringify(priceSnapshot),
          calculatedAt: missingPrices ? null : new Date()
        }
      });

      // Create payouts if commission is calculated
      if (!missingPrices && commissionAmount > 0) {
        const stageSettings = await prisma.commissionStageSetting.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' }
        });

        for (const setting of stageSettings) {
          const payoutAmount = Math.round((commissionAmount * setting.percentage) / 100 * 100) / 100;
          
          // Determine payout status based on order stage
          let payoutStatus = 'WAITING';
          if (order.currentStage === setting.stage || 
              (setting.stage === 'DELIVERED' && ['DELIVERED', 'ONSITE', 'COMPLETED'].includes(order.currentStage)) ||
              (setting.stage === 'SHIPPING' && ['SHIPPING', 'SMT', 'QC', 'DELIVERED', 'ONSITE', 'COMPLETED'].includes(order.currentStage))) {
            payoutStatus = 'PENDING';
          }

          await prisma.commissionPayout.create({
            data: {
              commissionId: commission.id,
              stage: setting.stage,
              percentage: setting.percentage,
              amount: payoutAmount,
              status: payoutStatus
            }
          });
        }
        created++;
      } else {
        flagged++;
      }
    }

    console.log(`\n📈 Commission seeding results:`);
    console.log(`✅ Created: ${created} commissions`);
    console.log(`⏭️  Skipped: ${skipped} (already exist)`);
    console.log(`⚠️  Flagged: ${flagged} (awaiting prices)`);

    // 4. Create notification about commission system
    console.log('\n📢 Creating system notification...');
    
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: true
      }
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'COMMISSION',
          category: 'INFO',
          title: 'Commission System Activated',
          message: 'The commission tracking system has been successfully deployed. You can now manage commission rates and approve payouts.',
          priority: 'HIGH'
        }
      });
    }

    console.log(`✅ Created notifications for ${admins.length} admin(s)`);

    console.log('\n🎉 Commission seeding complete!');
    
  } catch (error) {
    console.error('❌ Error seeding commission data:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
