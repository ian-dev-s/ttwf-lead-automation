/**
 * Fix leads that are in non-NEW status but have no messages
 * This script will:
 * 1. Find leads in invalid states (non-NEW, non-REJECTED, non-INVALID, non-NOT_INTERESTED without messages)
 * 2. Generate email messages for them
 * 3. Or reset them to NEW status if message generation fails
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { LeadStatus, PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
config();

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Statuses that don't require messages
const EXEMPT_STATUSES: LeadStatus[] = ['NEW', 'REJECTED', 'INVALID', 'NOT_INTERESTED'];

async function main() {
  console.log('🔍 Finding leads in invalid states...\n');

  // Find leads that are in non-exempt status but have no messages
  const invalidLeads = await prisma.lead.findMany({
    where: {
      status: {
        notIn: EXEMPT_STATUSES,
      },
      messages: {
        none: {},
      },
    },
    select: {
      id: true,
      businessName: true,
      status: true,
      email: true,
      phone: true,
    },
  });

  console.log(`Found ${invalidLeads.length} leads without messages in non-NEW status\n`);

  if (invalidLeads.length === 0) {
    console.log('✅ All leads are in valid states!');
    return;
  }

  // Group by status for reporting
  const byStatus = invalidLeads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Breakdown by status:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  console.log('');

  // Ask for confirmation
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Do you want to reset these leads to NEW status? (yes/no): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Operation cancelled');
    return;
  }

  console.log('\n🔄 Resetting leads to NEW status...\n');

  let resetCount = 0;
  for (const lead of invalidLeads) {
    try {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'NEW' },
      });
      console.log(`  ✅ Reset: ${lead.businessName} (was ${lead.status})`);
      resetCount++;
    } catch (error) {
      console.error(`  ❌ Failed to reset ${lead.businessName}:`, error);
    }
  }

  console.log(`\n✅ Reset ${resetCount}/${invalidLeads.length} leads to NEW status`);
  console.log('\n💡 You can now generate messages for these leads from the UI');
}

main()
  .catch(console.error)
  .finally(() => {
    prisma.$disconnect();
    pool.end();
  });
