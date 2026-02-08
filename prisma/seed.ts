import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  // Check if any team exists
  const teamCount = await prisma.team.count();

  if (teamCount === 0) {
    console.log('\nNo teams found. Use the setup wizard at /setup to create your first team and admin account.');
    console.log('The setup wizard will also create default email templates.\n');
    return;
  }

  console.log(`Found ${teamCount} team(s). Checking for email templates...`);

  // Get all teams
  const teams = await prisma.team.findMany();

  for (const team of teams) {
    // Check if team has email templates
    const templateCount = await prisma.emailTemplate.count({
      where: { teamId: team.id },
    });

    if (templateCount > 0) {
      console.log(`Team "${team.name}" already has ${templateCount} template(s). Skipping.`);
      continue;
    }

    console.log(`Seeding default templates for team "${team.name}"...`);

    const templates = [
      {
        teamId: team.id,
        name: 'Initial Outreach',
        description: 'First contact email to businesses without a website or with a low-quality website',
        purpose: 'outreach',
        systemPrompt: `You are an expert copywriter helping businesses establish their online presence.

Your task is to write personalized outreach emails to businesses that could benefit from having a professional website. The messages should:

1. Be warm, professional, and genuine
2. Reference specific details about their business (ratings, reviews, location)
3. Highlight their strengths (great reviews, established reputation)
4. Gently mention the opportunity (no website or low-quality website)
5. Present the offer clearly (free draft website, no obligation)
6. Include a clear call to action

Key guidelines:
- Never be pushy or salesy
- Focus on how we can help them grow
- Be respectful of their time
- For EMAIL messages: Use HTML formatting. Use <p>, <br>, <strong>, <em>, <a href="..."> tags. Do NOT use markdown.`,
        subjectLine: 'A Professional Website for {businessName}',
        isActive: true,
        isDefault: true,
        tone: 'professional',
        maxLength: 2000,
        mustInclude: ['free draft', 'no obligation'],
        avoidTopics: ['competitor names', 'pricing details', 'negative comments about current website'],
      },
      {
        teamId: team.id,
        name: 'Friendly Follow-up',
        description: 'Follow-up email for businesses that have not responded to the initial outreach',
        purpose: 'follow_up',
        systemPrompt: `You are an expert copywriter. You are writing a follow-up email to a business that was previously contacted but has not responded.

Guidelines:
1. Be polite and not pushy - acknowledge they are busy
2. Briefly reference the previous email without repeating all the details
3. Reiterate the key value proposition (free draft website)
4. Keep it shorter than the initial outreach
5. Provide an easy call to action
6. For EMAIL messages: Use HTML formatting with <p>, <br>, <strong>, <em>, <a> tags. Do NOT use markdown.
7. The tone should be warm and understanding, not aggressive or desperate`,
        subjectLine: 'Following up - Website for {businessName}',
        isActive: true,
        isDefault: true,
        tone: 'friendly',
        maxLength: 1000,
        mustInclude: ['free draft'],
        avoidTopics: ['competitor names', 'pricing details', 'guilt-tripping'],
      },
      {
        teamId: team.id,
        name: 'Re-engagement',
        description: 'Re-engage businesses that showed initial interest but went cold',
        purpose: 're_engagement',
        systemPrompt: `You are an expert copywriter. You are writing a re-engagement email to a business that showed some initial interest but has gone quiet.

Guidelines:
1. Be respectful of their time and decision
2. Offer something new or a fresh perspective
3. Keep it very brief and to the point
4. Make it easy to say yes or no
5. For EMAIL messages: Use HTML formatting with <p>, <br>, <strong>, <em>, <a> tags. Do NOT use markdown.
6. Consider mentioning a seasonal offer or new portfolio piece`,
        subjectLine: 'Quick update from us',
        isActive: true,
        isDefault: true,
        tone: 'casual',
        maxLength: 800,
        mustInclude: [],
        avoidTopics: ['competitor names', 'pricing details', 'pressure tactics'],
      },
    ];

    for (const template of templates) {
      await prisma.emailTemplate.create({ data: template });
      console.log(`  Created template: ${template.name}`);
    }
  }

  console.log('\nSeed completed successfully!');
  console.log('\nTo get started:');
  console.log('1. Run: docker-compose up -d (to start PostgreSQL)');
  console.log('2. Run: npm run dev (to start the development server)');
  console.log('3. Visit /setup if this is a fresh install');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
