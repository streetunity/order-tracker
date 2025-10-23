// api/regenerate-notifications.js
// Script to clear old notifications and generate new individual ones for all admins
// Usage: node api/regenerate-notifications.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function regenerateNotifications() {
  try {
    console.log('=== Regenerating Notifications ===\n');

    // Step 1: Delete all existing notifications
    const deleteResult = await prisma.notification.deleteMany({});
    console.log(`✓ Deleted ${deleteResult.count} old notifications\n`);

    // Step 2: Get all active admins
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['ADMIN', 'SUPER_ADMIN'] }
      },
      select: { id: true, name: true, role: true }
    });

    console.log(`Found ${admins.length} active admins:`);
    admins.forEach(a => console.log(`  - ${a.name} (${a.role})`));
    console.log('');

    // Step 3: Get stage thresholds
    const thresholds = await prisma.stageThreshold.findMany();
    const thresholdMap = thresholds.reduce((acc, t) => {
      acc[t.stage] = t;
      return acc;
    }, {});

    // Step 4: Get all active orders with items
    const orders = await prisma.order.findMany({
      include: {
        items: {
          where: { archivedAt: null },
          include: {
            statusEvents: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        },
        account: {
          select: { name: true }
        }
      }
    });

    console.log(`Processing ${orders.length} orders...\n`);

    const notifications = [];
    const now = new Date();
    const FINAL_STAGES = ['COMPLETED', 'FOLLOW_UP'];

    // Step 5: Generate notifications
    for (const order of orders) {
      // Find sales rep
      let salesRep = null;
      if (order.sku) {
        salesRep = await prisma.user.findFirst({
          where: { name: order.sku, isActive: true }
        });
      }

      for (const item of order.items) {
        if (FINAL_STAGES.includes(item.currentStage)) {
          continue;
        }

        const lastEvent = item.statusEvents[0];
        const stageEnteredAt = lastEvent ? new Date(lastEvent.createdAt) : new Date(item.createdAt);
        const daysInStage = Math.floor((now - stageEnteredAt) / (1000 * 60 * 60 * 24));

        const threshold = thresholdMap[item.currentStage];
        if (!threshold) continue;

        let priority = 'NORMAL';
        let type = 'STAGE_WARNING';

        if (daysInStage >= threshold.criticalDays) {
          priority = 'CRITICAL';
          type = 'STAGE_CRITICAL';
        } else if (daysInStage >= threshold.warningDays) {
          priority = 'HIGH';
          type = 'STAGE_WARNING';
        } else {
          continue;
        }

        // Build list of users to notify
        const usersToNotify = [...admins];
        if (salesRep && !admins.find(a => a.id === salesRep.id)) {
          usersToNotify.push(salesRep);
        }

        // Create notification for EACH user
        for (const user of usersToNotify) {
          const notification = await prisma.notification.create({
            data: {
              userId: String(user.id),
              type,
              category: 'OPERATIONAL',
              title: `Item ${priority === 'CRITICAL' ? 'Critical' : 'Warning'}: ${item.productCode}`,
              message: `Item ${item.productCode} in order ${order.poNumber || order.id} has been in ${item.currentStage} stage for ${daysInStage} days`,
              relatedOrderId: order.id,
              relatedItemId: item.id,
              metadata: JSON.stringify({
                daysInStage,
                stage: item.currentStage,
                warningDays: threshold.warningDays,
                criticalDays: threshold.criticalDays,
                customerName: order.account?.name
              }),
              priority
            }
          });

          notifications.push(notification);
        }
      }
    }

    console.log(`\n✓ Created ${notifications.length} individual notifications`);

    // Show breakdown by user
    const byUser = {};
    notifications.forEach(n => {
      if (!byUser[n.userId]) {
        const user = admins.find(a => a.id === n.userId) || { name: 'Unknown' };
        byUser[n.userId] = { name: user.name, count: 0 };
      }
      byUser[n.userId].count++;
    });

    console.log('\nNotifications created per user:');
    Object.values(byUser).forEach(u => {
      console.log(`  - ${u.name}: ${u.count} notifications`);
    });

    console.log('\n✓ Done!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateNotifications();
