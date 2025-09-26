const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

(async () => {
  const adminHash = await bcrypt.hash('admin123', 10);
  const agentHash = await bcrypt.hash('agent123', 10);
  
  await prisma.user.create({
    data: {
      email: 'admin@stealthmachinetools.com',
      name: 'Admin User',
      password: adminHash,
      role: 'ADMIN',
      isActive: true
    }
  });
  
  await prisma.user.create({
    data: {
      email: 'john@stealthmachinetools.com',
      name: 'John Agent',
      password: agentHash,
      role: 'AGENT',
      isActive: true
    }
  });
  
  console.log('✅ Users created!');
  const users = await prisma.user.findMany();
  console.log('Users in DB:', users.length);
})();
