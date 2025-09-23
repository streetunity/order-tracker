// api/prisma/seedUsers.js
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding users...');

  // Create admin user only
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

  // NOTE: Agent users are no longer created by default
  // Users should be created through the admin interface
  
  console.log('\n📝 Default credentials:');
  console.log('Admin: admin@stealthmachinetools.com / admin123');
  console.log('\n⚠️  IMPORTANT: Change this password in production!');
  console.log('➡️  Create additional users through the admin interface at /admin/users');
}

main()
  .catch((e) => {
    console.error('Error seeding users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });