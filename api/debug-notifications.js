// api/debug-notifications.js
// Run this script on the server to debug notification userId issues
// Usage: node api/debug-notifications.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugNotifications() {
  try {
    console.log('=== Notification Debug Report ===\n');

    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    console.log('Users in system:');
    users.forEach(u => {
      console.log(`  - ${u.name} (${u.email})`);
      console.log(`    ID: ${u.id}`);
      console.log(`    Role: ${u.role}, Active: ${u.isActive}\n`);
    });

    // Get all notifications
    const notifications = await prisma.notification.findMany({
      select: {
        id: true,
        userId: true,
        isRead: true,
        isDismissed: true,
        title: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`\nTotal notifications: ${notifications.length}`);

    // Group by userId
    const byUser = {};
    notifications.forEach(n => {
      if (!byUser[n.userId]) {
        byUser[n.userId] = { total: 0, unread: 0, dismissed: 0 };
      }
      byUser[n.userId].total++;
      if (!n.isRead) byUser[n.userId].unread++;
      if (n.isDismissed) byUser[n.userId].dismissed++;
    });

    console.log('\nNotifications by userId:');
    Object.entries(byUser).forEach(([userId, counts]) => {
      const user = users.find(u => u.id === userId);
      const userName = user ? user.name : 'UNKNOWN USER';
      console.log(`\n  ${userName} (${userId}):`);
      console.log(`    Total: ${counts.total}`);
      console.log(`    Unread: ${counts.unread}`);
      console.log(`    Dismissed: ${counts.dismissed}`);
    });

    // Show recent unread notifications
    const unread = notifications.filter(n => !n.isRead && !n.isDismissed).slice(0, 10);
    console.log(`\n\nRecent unread notifications (${unread.length}):`);
    unread.forEach(n => {
      const user = users.find(u => u.id === n.userId);
      console.log(`  - ${n.title}`);
      console.log(`    For: ${user?.name || 'Unknown'} (${n.userId})`);
      console.log(`    Created: ${n.createdAt}\n`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugNotifications();
