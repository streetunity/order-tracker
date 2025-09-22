// api/prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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

    console.log('\n✓ Database seed completed successfully!');
    console.log('\nYou can now login with:');
    console.log('Admin: admin@stealthmachinetools.com / admin123');
    console.log('\n⚠ IMPORTANT: Change the default password immediately!');
    
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
