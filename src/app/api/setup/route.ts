import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const setupSchema = z.object({
  // Admin account
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  
  // Team
  teamName: z.string().min(2, 'Team name must be at least 2 characters'),
  
  // Optional SMTP config
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  emailFrom: z.string().optional(),
  
  // Optional IMAP config
  imapHost: z.string().optional(),
  imapPort: z.number().optional(),
  imapSecure: z.boolean().optional(),
  imapUser: z.string().optional(),
  imapPass: z.string().optional(),
  
  // Optional AI key
  aiProvider: z.string().optional(),
  aiApiKey: z.string().optional(),
});

// GET /api/setup - Check if setup is needed
export async function GET() {
  try {
    const teamCount = await prisma.team.count();
    return NextResponse.json({ needsSetup: teamCount === 0 });
  } catch (error) {
    console.error('Error checking setup status:', error);
    return NextResponse.json({ needsSetup: true });
  }
}

// POST /api/setup - Run initial setup
export async function POST(request: NextRequest) {
  try {
    // Only allow setup if no teams exist yet
    const teamCount = await prisma.team.count();
    if (teamCount > 0) {
      return NextResponse.json(
        { error: 'Setup has already been completed. Please log in.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = setupSchema.parse(body);

    // Generate team slug from name
    const slug = data.teamName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Create team
    const team = await prisma.team.create({
      data: {
        name: data.teamName,
        slug: slug || 'default',
      },
    });

    // Create admin user
    const passwordHash = await bcrypt.hash(data.password, 12);
    await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: 'ADMIN',
        teamId: team.id,
      },
    });

    // Create team settings with optional SMTP/IMAP
    const settingsData: Record<string, unknown> = {
      teamId: team.id,
    };

    // Encrypt and store SMTP config if provided
    if (data.smtpHost) {
      settingsData.smtpHost = data.smtpHost;
      settingsData.smtpPort = data.smtpPort || 587;
      settingsData.smtpSecure = data.smtpSecure || false;
      if (data.smtpUser) settingsData.smtpUser = encrypt(data.smtpUser);
      if (data.smtpPass) settingsData.smtpPass = encrypt(data.smtpPass);
      if (data.emailFrom) settingsData.emailFrom = data.emailFrom;
    }

    // Encrypt and store IMAP config if provided
    if (data.imapHost) {
      settingsData.imapHost = data.imapHost;
      settingsData.imapPort = data.imapPort || 993;
      settingsData.imapSecure = data.imapSecure !== false;
      if (data.imapUser) settingsData.imapUser = encrypt(data.imapUser);
      if (data.imapPass) settingsData.imapPass = encrypt(data.imapPass);
    }

    await prisma.teamSettings.create({
      data: settingsData as Parameters<typeof prisma.teamSettings.create>[0]['data'],
    });

    // Store AI API key if provided
    if (data.aiProvider && data.aiApiKey) {
      await prisma.teamApiKey.create({
        data: {
          teamId: team.id,
          provider: data.aiProvider,
          encryptedKey: encrypt(data.aiApiKey),
          label: `${data.aiProvider} API Key`,
          isActive: true,
        },
      });
    }

    // Seed default email templates for this team
    await seedDefaultTemplates(team.id);

    return NextResponse.json({
      success: true,
      message: 'Setup completed successfully! You can now log in.',
      teamId: team.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed. Please try again.' },
      { status: 500 }
    );
  }
}

async function seedDefaultTemplates(teamId: string) {
  const templates = [
    {
      teamId,
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
      teamId,
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
      teamId,
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
  }
}
