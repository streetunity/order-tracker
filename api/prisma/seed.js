// api/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  try {
    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@stealthmachinetools.com' },
      update: {
        password: adminPassword,
        name: 'Admin User',
        role: 'ADMIN',
        isActive: true
      },
      create: {
        email: 'admin@stealthmachinetools.com',
        password: adminPassword,
        name: 'Admin User',
        role: 'ADMIN',
        isActive: true
      }
    });
    console.log('✓ Admin user created/updated:', admin.email);

    // Create agent user
    const agentPassword = await bcrypt.hash('agent123', 10);
    const agent = await prisma.user.upsert({
      where: { email: 'john@stealthmachinetools.com' },
      update: {
        password: agentPassword,
        name: 'John Doe',
        role: 'AGENT',
        isActive: true
      },
      create: {
        email: 'john@stealthmachinetools.com',
        password: agentPassword,
        name: 'John Doe',
        role: 'AGENT',
        isActive: true
      }
    });
    console.log('✓ Agent user created/updated:', agent.email);

    console.log('\n✓ Database seed completed successfully!');
    console.log('\nYou can now login with:');
    console.log('Admin: admin@stealthmachinetools.com / admin123');
    console.log('Agent: john@stealthmachinetools.com / agent123');
    
  } catch (error) {
    console.error('✗ Error seeding database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Seed script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
