// api/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@stealthmachinetools.com' },
    update: {},
    create: {
      email: 'admin@stealthmachinetools.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log('Created admin user:', admin.email);

  // Create agent user
  const agentPassword = await bcrypt.hash('agent123', 10);
  const agent = await prisma.user.upsert({
    where: { email: 'john@stealthmachinetools.com' },
    update: {},
    create: {
      email: 'john@stealthmachinetools.com',
      password: agentPassword,
      name: 'John Doe',
      role: 'AGENT',
      isActive: true
    }
  });
  console.log('Created agent user:', agent.email);

  console.log('Database seed completed!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
