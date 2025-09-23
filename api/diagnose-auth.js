// diagnose-auth.js - Just diagnose, don't change anything
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

console.log('\n=== DIAGNOSTIC ONLY - NO CHANGES WILL BE MADE ===\n');

// Check environment
console.log('1. Environment Variables:');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   PORT:', process.env.PORT || '4000');

// Check database
try {
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@stealthmachinetools.com' }
  });
  
  if (admin) {
    console.log('\n2. Admin User Found:');
    console.log('   Email:', admin.email);
    console.log('   Role:', admin.role);
    console.log('   Active:', admin.isActive);
    console.log('   Password hash exists:', !!admin.password);
    console.log('   Hash starts with $2:', admin.password?.startsWith('$2'));
    
    // Test password
    console.log('\n3. Testing password "admin123":');
    const matches = await bcrypt.compare('admin123', admin.password);
    console.log('   Password matches:', matches);
    
    if (!matches) {
      console.log('\n   ⚠️  PASSWORD DOES NOT MATCH!');
      console.log('   This means the password in the database is not "admin123"');
      console.log('   Someone may have changed it, or the hash is corrupted.');
    }
  } else {
    console.log('\n2. ❌ Admin user NOT found in database!');
  }
  
  // List all users
  console.log('\n4. All users in database:');
  const users = await prisma.user.findMany({
    select: { email: true, role: true, isActive: true }
  });
  users.forEach(u => console.log(`   - ${u.email} (${u.role}) Active: ${u.isActive}`));
  
} catch (error) {
  console.error('\nDatabase error:', error.message);
}

// Test API endpoint
console.log('\n5. Testing API endpoint:');
try {
  const response = await fetch('http://localhost:4000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@stealthmachinetools.com',
      password: 'admin123'
    })
  });
  
  const data = await response.json();
  if (response.ok) {
    console.log('   ✅ Login successful!');
  } else {
    console.log('   ❌ Login failed:', data.error);
  }
} catch (error) {
  console.log('   ❌ Could not connect to API:', error.message);
}

await prisma.$disconnect();

console.log('\n=== DIAGNOSTIC COMPLETE ===');
console.log('\nNo changes were made. Based on the results above:');
console.log('- If password doesn\'t match: Run npm run seed to reset it');
console.log('- If JWT_SECRET not set: Add it to .env file');
console.log('- If API not responding: Check pm2 logs');
