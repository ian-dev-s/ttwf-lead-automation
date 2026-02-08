import { auth } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { getMaskedSmtpConfig, getMaskedImapConfig } from '@/lib/email/config';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const emailConfigSchema = z.object({
  // SMTP
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  emailFrom: z.string().optional(),
  emailDebugMode: z.boolean().optional(),
  emailDebugAddress: z.string().optional(),
  // IMAP
  imapHost: z.string().optional(),
  imapPort: z.number().optional(),
  imapSecure: z.boolean().optional(),
  imapUser: z.string().optional(),
  imapPass: z.string().optional(),
});

// GET /api/settings/email-config - Get masked email config
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;
    const [smtp, imap] = await Promise.all([
      getMaskedSmtpConfig(teamId),
      getMaskedImapConfig(teamId),
    ]);

    return NextResponse.json({ smtp, imap });
  } catch (error) {
    console.error('Error fetching email config:', error);
    return NextResponse.json({ error: 'Failed to fetch email config' }, { status: 500 });
  }
}

// PATCH /api/settings/email-config - Update email config (encrypts secrets)
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can update email config' }, { status: 403 });
    }

    const teamId = session.user.teamId;
    const body = await request.json();
    const data = emailConfigSchema.parse(body);

    // Build update object, encrypting secrets
    const updateData: Record<string, unknown> = {};

    if (data.smtpHost !== undefined) updateData.smtpHost = data.smtpHost || null;
    if (data.smtpPort !== undefined) updateData.smtpPort = data.smtpPort;
    if (data.smtpSecure !== undefined) updateData.smtpSecure = data.smtpSecure;
    if (data.smtpUser !== undefined) updateData.smtpUser = data.smtpUser ? encrypt(data.smtpUser) : null;
    if (data.smtpPass !== undefined) updateData.smtpPass = data.smtpPass ? encrypt(data.smtpPass) : null;
    if (data.emailFrom !== undefined) updateData.emailFrom = data.emailFrom || null;
    if (data.emailDebugMode !== undefined) updateData.emailDebugMode = data.emailDebugMode;
    if (data.emailDebugAddress !== undefined) updateData.emailDebugAddress = data.emailDebugAddress || null;

    if (data.imapHost !== undefined) updateData.imapHost = data.imapHost || null;
    if (data.imapPort !== undefined) updateData.imapPort = data.imapPort;
    if (data.imapSecure !== undefined) updateData.imapSecure = data.imapSecure;
    if (data.imapUser !== undefined) updateData.imapUser = data.imapUser ? encrypt(data.imapUser) : null;
    if (data.imapPass !== undefined) updateData.imapPass = data.imapPass ? encrypt(data.imapPass) : null;

    await prisma.teamSettings.upsert({
      where: { teamId },
      update: updateData,
      create: { teamId, ...updateData } as Parameters<typeof prisma.teamSettings.create>[0]['data'],
    });

    // Return masked config
    const [smtp, imap] = await Promise.all([
      getMaskedSmtpConfig(teamId),
      getMaskedImapConfig(teamId),
    ]);

    return NextResponse.json({ smtp, imap, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating email config:', error);
    return NextResponse.json({ error: 'Failed to update email config' }, { status: 500 });
  }
}
