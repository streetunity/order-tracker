/**
 * Script to clear assignedToId for all customers (reset to Unassigned)
 * Run from /api directory: node scripts/clear-default-sales-reps.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Finding customers with sales rep assignments...\n');

  // Find all customers with an assignedToId
  const customers = await prisma.customer.findMany({
    where: {
      isDeleted: false,
      assignedToId: { not: null }
    },
    select: {
      id: true,
      customerNumber: true,
      firstName: true,
      lastName: true,
      assignedToId: true,
      assignedTo: { select: { name: true } }
    }
  });

  if (customers.length === 0) {
    console.log('No customers found with sales rep assignments.');
    return;
  }

  console.log(`Found ${customers.length} customers with sales rep assignments:\n`);

  for (const customer of customers) {
    console.log(`  ${customer.customerNumber} - ${customer.firstName} ${customer.lastName}`);
    console.log(`    Currently assigned to: ${customer.assignedTo?.name || 'Unknown'}`);
  }

  console.log('\nClearing assignedToId for all these customers...\n');

  // Update all customers with assignedToId to null
  const result = await prisma.customer.updateMany({
    where: {
      isDeleted: false,
      assignedToId: { not: null }
    },
    data: {
      assignedToId: null
    }
  });

  console.log(`Successfully updated ${result.count} customers to "Unassigned".`);
  console.log('Sales reps can now be properly assigned to each customer.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
