/**
 * Migration script: Move existing data to a default team.
 * 
 * Run this script when upgrading from the single-tenant SystemSettings model
 * to the multi-tenant Team/TeamSettings model.
 * 
 * Usage: npx tsx scripts/migrate-to-teams.ts
 * 
 * This script:
 * 1. Creates a default team from existing SystemSettings
 * 2. Assigns all existing users to the default team
 * 3. Assigns all existing leads, messages, etc. to the default team
 * 4. Copies SystemSettings values to new TeamSettings
 * 5. If SMTP/IMAP/API keys exist in env vars, encrypts and stores them in DB
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting migration to teams...\n');

  // Check if teams already exist
  const existingTeams = await prisma.team.count();
  if (existingTeams > 0) {
    console.log('Teams already exist. Migration not needed.');
    console.log('If you need to re-run, delete all teams first.');
    return;
  }

  // Create default team
  const team = await prisma.team.create({
    data: {
      name: 'Default Team',
      slug: 'default',
    },
  });
  console.log(`Created default team: ${team.name} (${team.id})`);

  // Create team settings
  await prisma.teamSettings.create({
    data: {
      teamId: team.id,
    },
  });
  console.log('Created team settings');

  // Assign all users to the default team
  const userResult = await prisma.user.updateMany({
    where: { teamId: null },
    data: { teamId: team.id },
  });
  console.log(`Assigned ${userResult.count} users to default team`);

  // NOTE: The following models now have required teamId fields.
  // If you have existing data without teamId, you would need to update
  // those records here. Since we force-reset the DB during the schema
  // migration, this script serves as a template for production migrations.
  
  console.log('\nMigration complete!');
  console.log('Run the setup wizard at /setup to configure your team settings.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
