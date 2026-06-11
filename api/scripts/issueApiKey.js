// api/scripts/issueApiKey.js
// Issue a read-only external API key. Run from the api/ directory:
//   node scripts/issueApiKey.js "Partner Company Name"
// Prints the raw key once -- only its SHA-256 hash is stored. Hand the raw key
// to the partner; it cannot be recovered later.
// Revoke later with:
//   psql -d smt_orders -c "UPDATE \"ApiKey\" SET \"isActive\"=false, \"revokedAt\"=now() WHERE prefix='smt_xxxxxxxx';"
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generateApiKey } from '../src/middleware/apiKeyAuth.js';

async function main() {
  const label = process.argv[2];
  if (!label) {
    console.error('Usage: node scripts/issueApiKey.js "<label>"');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const { raw, keyHash, prefix } = generateApiKey('smt');

  try {
    const row = await prisma.apiKey.create({
      data: { label, keyHash, prefix, scopes: 'read' },
    });
    console.log('\nAPI key issued. Give the raw key to the partner -- shown only once:\n');
    console.log('  ' + raw + '\n');
    console.log('label:  ' + row.label);
    console.log('prefix: ' + row.prefix + '   (identifies this key for revocation)');
  } catch (e) {
    console.error('Failed to issue API key:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
