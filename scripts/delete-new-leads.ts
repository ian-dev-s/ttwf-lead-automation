/**
 * Delete all leads with NEW status
 * 
 * Run with: npx tsx scripts/delete-new-leads.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';

// Load environment variables
config();

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function deleteNewLeads() {
  console.log('🗑️  Delete NEW Status Leads\n');
  console.log('================================================\n');

  try {
    // Count leads to be deleted
    const count = await prisma.lead.count({
      where: { status: 'NEW' },
    });

    console.log(`📊 Found ${count} leads with NEW status\n`);

    if (count === 0) {
      console.log('✅ No leads to delete.\n');
      return;
    }

    // Delete related records first (messages, status history)
    console.log('🔄 Deleting related messages...');
    const messagesDeleted = await prisma.message.deleteMany({
      where: {
        lead: {
          status: 'NEW',
        },
      },
    });
    console.log(`   Deleted ${messagesDeleted.count} messages\n`);

    console.log('🔄 Deleting status history...');
    const historyDeleted = await prisma.statusHistory.deleteMany({
      where: {
        lead: {
          status: 'NEW',
        },
      },
    });
    console.log(`   Deleted ${historyDeleted.count} history records\n`);

    // Delete the leads
    console.log('🔄 Deleting leads...');
    const result = await prisma.lead.deleteMany({
      where: { status: 'NEW' },
    });

    console.log(`\n================================================`);
    console.log(`✅ Successfully deleted ${result.count} leads with NEW status`);
    console.log(`================================================\n`);

  } catch (error) {
    console.error('❌ Error deleting leads:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteNewLeads();
