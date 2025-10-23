// api/fix-notifications-user.js
// Script to reassign notifications from one user to another
// Usage: node api/fix-notifications-user.js <fromUserId> <toUserId>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reassignNotifications() {
  const fromUserId = process.argv[2];
  const toUserId = process.argv[3];

  if (!fromUserId || !toUserId) {
    console.error('Usage: node fix-notifications-user.js <fromUserId> <toUserId>');
    console.error('\nExample:');
    console.error('  node fix-notifications-user.js cmgpmnnt90004hnl5267jvh6v cmgpmlvxa000080cqaykhu8i1');
    process.exit(1);
  }

  try {
    console.log(`Reassigning notifications from ${fromUserId} to ${toUserId}...`);

    // Get count before
    const beforeCount = await prisma.notification.count({
      where: { userId: fromUserId }
    });

    console.log(`Found ${beforeCount} notifications for ${fromUserId}`);

    // Reassign
    const result = await prisma.notification.updateMany({
      where: {
        userId: fromUserId
      },
      data: {
        userId: toUserId
      }
    });

    console.log(`✓ Reassigned ${result.count} notifications to ${toUserId}`);

    // Verify
    const afterCount = await prisma.notification.count({
      where: { userId: toUserId }
    });

    console.log(`\n${toUserId} now has ${afterCount} total notifications`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

reassignNotifications();
