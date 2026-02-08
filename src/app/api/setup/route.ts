import { adminAuth } from '@/lib/firebase/admin';
import { encrypt } from '@/lib/crypto';
import { teamsCollection, teamSettingsDoc, userDoc, emailTemplatesCollection, teamApiKeysCollection } from '@/lib/firebase/collections';
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
    const teamsSnapshot = await teamsCollection().limit(1).get();
    return NextResponse.json({ needsSetup: teamsSnapshot.empty });
  } catch (error) {
    console.error('Error checking setup status:', error);
    return NextResponse.json({ needsSetup: true });
  }
}

// POST /api/setup - Run initial setup
export async function POST(request: NextRequest) {
  try {
    // Only allow setup if no teams exist yet
    const teamsSnapshot = await teamsCollection().limit(1).get();
    if (!teamsSnapshot.empty) {
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

    const now = new Date();

    // Create team
    const teamRef = teamsCollection().doc();
    await teamRef.set({
      name: data.teamName,
      slug: slug || 'default',
      createdAt: now,
      updatedAt: now,
    });
    const teamId = teamRef.id;

    // Create admin user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
    });

    // Set custom claims (teamId and role)
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: 'ADMIN',
      teamId,
    });

    // Create Firestore user document
    await userDoc(userRecord.uid).set({
      email: data.email,
      name: data.name,
      role: 'ADMIN',
      teamId,
      createdAt: now,
      updatedAt: now,
    });

    // Create team settings with optional SMTP/IMAP
    const settingsData: Record<string, unknown> = {
      // Default values for required fields
      dailyLeadTarget: 10,
      leadGenerationEnabled: false,
      scrapeDelayMs: 2000,
      maxLeadsPerRun: 50,
      searchRadiusKm: 25,
      minGoogleRating: 4.0,
      targetIndustries: [],
      blacklistedIndustries: [],
      targetCities: [],
      autoGenerateMessages: false,
      companyName: data.teamName,
      companyWebsite: '',
      companyTagline: '',
      logoUrl: null,
      bannerUrl: null,
      whatsappPhone: null,
      socialFacebookUrl: null,
      socialInstagramUrl: null,
      socialLinkedinUrl: null,
      socialTwitterUrl: null,
      socialTiktokUrl: null,
      aiTone: null,
      aiWritingStyle: null,
      aiCustomInstructions: null,
      smtpPort: 587,
      smtpSecure: false,
      emailDebugMode: false,
      imapPort: 993,
      imapSecure: true,
      updatedAt: now,
    };

    // Encrypt and store SMTP config if provided
    if (data.smtpHost) {
      settingsData.smtpHost = data.smtpHost;
      settingsData.smtpPort = data.smtpPort || 587;
      settingsData.smtpSecure = data.smtpSecure ?? false;
      if (data.smtpUser) settingsData.smtpUser = encrypt(data.smtpUser);
      if (data.smtpPass) settingsData.smtpPass = encrypt(data.smtpPass);
      if (data.emailFrom) settingsData.emailFrom = data.emailFrom;
    } else {
      settingsData.smtpHost = null;
      settingsData.smtpUser = null;
      settingsData.smtpPass = null;
      settingsData.emailFrom = null;
    }

    // Encrypt and store IMAP config if provided
    if (data.imapHost) {
      settingsData.imapHost = data.imapHost;
      settingsData.imapPort = data.imapPort || 993;
      settingsData.imapSecure = data.imapSecure !== false;
      if (data.imapUser) settingsData.imapUser = encrypt(data.imapUser);
      if (data.imapPass) settingsData.imapPass = encrypt(data.imapPass);
    } else {
      settingsData.imapHost = null;
      settingsData.imapUser = null;
      settingsData.imapPass = null;
    }

    await teamSettingsDoc(teamId).set(settingsData);

    // Store AI API key if provided
    if (data.aiProvider && data.aiApiKey) {
      const apiKeyRef = teamApiKeysCollection(teamId).doc();
      await apiKeyRef.set({
        provider: data.aiProvider,
        encryptedKey: encrypt(data.aiApiKey),
        label: `${data.aiProvider} API Key`,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Seed default email templates for this team
    await seedDefaultTemplates(teamId, now);

    return NextResponse.json({
      success: true,
      message: 'Setup completed successfully! You can now log in.',
      teamId,
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

async function seedDefaultTemplates(teamId: string, now: Date) {
  const templates = [
    {
      name: 'Initial Outreach',
      description: 'First contact email to businesses without a website or with a low-quality website',
      purpose: 'outreach',
      systemPrompt: `You write outreach emails for The Tiny Web Factory using the SPEAR framework.

SPEAR rules:
- SHORT: Keep the body under 100 words. 2-3 short paragraphs max.
- PERSONAL: Mention the business by name. Reference their Google rating, reviews, industry, or location. Never sound like a mass email.
- EXPECTS A REPLY: End with a casual question (e.g., "Keen to have a look?" or "Want us to put something together?").

Tone: Casual and friendly — not corporate or formal. Like messaging someone you know.
Never be pushy or salesy. Use South African English spelling.
For EMAIL messages: Use HTML formatting with <p>, <br>, <strong>, <em>, <a> tags. Do NOT use markdown.`,
      subjectLine: 'Quick idea for {businessName}',
      isActive: true,
      isDefault: true,
      tone: 'casual-friendly',
      maxLength: 800,
      mustInclude: ['free draft', 'no obligation', 'question at the end'],
      avoidTopics: ['competitor names', 'pricing details', 'negative comments about current website'],
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Friendly Follow-up',
      description: 'Follow-up email for businesses that have not responded to the initial outreach',
      purpose: 'follow_up',
      systemPrompt: `You write follow-up emails for The Tiny Web Factory using the SPEAR framework.

SPEAR rules:
- SHORT: Even shorter than the first email — under 60 words for the body.
- PERSONAL: Reference the business by name. Nod to the previous email casually.
- EXPECTS A REPLY: End with a simple yes/no question (e.g., "Still keen?" or "Should we go ahead?").

Tone: Casual and understanding — acknowledge they're busy, no guilt-tripping.
Never desperate or aggressive. Use South African English spelling.
For EMAIL messages: Use HTML formatting with <p>, <br>, <strong>, <em>, <a> tags. Do NOT use markdown.`,
      subjectLine: 'Just checking in - {businessName}',
      isActive: true,
      isDefault: true,
      tone: 'casual-friendly',
      maxLength: 500,
      mustInclude: ['free draft', 'question at the end'],
      avoidTopics: ['competitor names', 'pricing details', 'guilt-tripping'],
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'Re-engagement',
      description: 'Re-engage businesses that showed initial interest but went cold',
      purpose: 're_engagement',
      systemPrompt: `You write re-engagement emails for The Tiny Web Factory using the SPEAR framework.

SPEAR rules:
- SHORT: Ultra-brief — under 50 words for the body. 1-2 short paragraphs.
- PERSONAL: Use their name and reference something specific about their business or previous interest.
- EXPECTS A REPLY: End with an easy yes/no question (e.g., "Worth another look?" or "Should we give it another go?").

Tone: Relaxed and low-pressure — respect their time. Offer a fresh angle or mention new work.
No pressure tactics. Use South African English spelling.
For EMAIL messages: Use HTML formatting with <p>, <br>, <strong>, <em>, <a> tags. Do NOT use markdown.`,
      subjectLine: 'Quick thought for {businessName}',
      isActive: true,
      isDefault: true,
      tone: 'casual-friendly',
      maxLength: 400,
      mustInclude: ['question at the end'],
      avoidTopics: ['competitor names', 'pricing details', 'pressure tactics'],
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const template of templates) {
    const templateRef = emailTemplatesCollection(teamId).doc();
    await templateRef.set(template);
  }
}
