// api/prisma/seedUsers.js
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding users...');

  // Create admin user
  const adminPassword = await hashPassword('admin123');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@stealthmachinetools.com' },
    update: {},
    create: {
      email: 'admin@stealthmachinetools.com',
      name: 'System Administrator',
      password: adminPassword,
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log('✅ Created admin user:', admin.email);

  // Create agent users
  const agentPassword = await hashPassword('agent123');
  
  const agent1 = await prisma.user.upsert({
    where: { email: 'john@stealthmachinetools.com' },
    update: {},
    create: {
      email: 'john@stealthmachinetools.com',
      name: 'John Smith',
      password: agentPassword,
      role: 'AGENT',
      isActive: true
    }
  });
  console.log('✅ Created agent user:', agent1.email);

  const agent2 = await prisma.user.upsert({
    where: { email: 'jane@stealthmachinetools.com' },
    update: {},
    create: {
      email: 'jane@stealthmachinetools.com',
      name: 'Jane Doe',
      password: agentPassword,
      role: 'AGENT',
      isActive: true
    }
  });
  console.log('✅ Created agent user:', agent2.email);

  console.log('\n📝 Default credentials:');
  console.log('Admin: admin@stealthmachinetools.com / admin123');
  console.log('Agent: john@stealthmachinetools.com / agent123');
  console.log('Agent: jane@stealthmachinetools.com / agent123');
  console.log('\n⚠️  IMPORTANT: Change these passwords in production!');
}

main()
  .catch((e) => {
    console.error('Error seeding users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });