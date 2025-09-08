// api/prisma/seed.js
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const STAGES = [
  'MANUFACTURING','TESTING','SHIPPING','AT_SEA','SMT','QC','DELIVERED','ONSITE','COMPLETED'
];

function token() {
  return crypto.randomBytes(24)
    .toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
