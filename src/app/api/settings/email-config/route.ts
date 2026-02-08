import { auth } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { getMaskedImapConfig, getMaskedSmtpConfig, getMaskedProxyConfig, getDetectedSystemProxy } from '@/lib/email/config';
import { teamSettingsDoc } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const emailConfigSchema = z.object({
  // SMTP
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().nullable().optional(),
  smtpPass: z.string().nullable().optional(),
  emailFrom: z.string().nullable().optional(),
  emailDebugMode: z.boolean().optional(),
  emailDebugAddress: z.string().nullable().optional(),
  // IMAP
  imapHost: z.string().nullable().optional(),
  imapPort: z.number().optional(),
  imapSecure: z.boolean().optional(),
  imapUser: z.string().nullable().optional(),
  imapPass: z.string().nullable().optional(),
  // Connection Proxy (Thunderbird-style)
  proxyMode: z.enum(['none', 'system', 'manual']).nullable().optional(),
  proxyHttpHost: z.string().nullable().optional(),
  proxyHttpPort: z.number().nullable().optional(),
  proxyUseHttpForHttps: z.boolean().optional(),
  proxyHttpsHost: z.string().nullable().optional(),
  proxyHttpsPort: z.number().nullable().optional(),
  proxySocksHost: z.string().nullable().optional(),
  proxySocksPort: z.number().nullable().optional(),
  proxySocksVersion: z.union([z.literal(4), z.literal(5)]).nullable().optional(),
  proxyNoProxyFor: z.string().nullable().optional(),
  proxyDnsOverSocks: z.boolean().optional(),
});

// GET /api/settings/email-config - Get masked email config
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;
    const [smtp, imap, proxy] = await Promise.all([
      getMaskedSmtpConfig(teamId),
      getMaskedImapConfig(teamId),
      getMaskedProxyConfig(teamId),
    ]);
    const systemProxy = getDetectedSystemProxy();

    return NextResponse.json({ smtp, imap, proxy, systemProxy });
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

    // Connection Proxy
    if (data.proxyMode !== undefined) updateData.proxyMode = data.proxyMode || 'none';
    if (data.proxyHttpHost !== undefined) updateData.proxyHttpHost = data.proxyHttpHost || null;
    if (data.proxyHttpPort !== undefined) updateData.proxyHttpPort = data.proxyHttpPort ?? null;
    if (data.proxyUseHttpForHttps !== undefined) updateData.proxyUseHttpForHttps = data.proxyUseHttpForHttps;
    if (data.proxyHttpsHost !== undefined) updateData.proxyHttpsHost = data.proxyHttpsHost || null;
    if (data.proxyHttpsPort !== undefined) updateData.proxyHttpsPort = data.proxyHttpsPort ?? null;
    if (data.proxySocksHost !== undefined) updateData.proxySocksHost = data.proxySocksHost || null;
    if (data.proxySocksPort !== undefined) updateData.proxySocksPort = data.proxySocksPort ?? null;
    if (data.proxySocksVersion !== undefined) updateData.proxySocksVersion = data.proxySocksVersion ?? null;
    if (data.proxyNoProxyFor !== undefined) updateData.proxyNoProxyFor = data.proxyNoProxyFor || null;
    if (data.proxyDnsOverSocks !== undefined) updateData.proxyDnsOverSocks = data.proxyDnsOverSocks;

    updateData.updatedAt = new Date();

    // Upsert team settings
    const settingsDoc = teamSettingsDoc(teamId);
    const existingDoc = await settingsDoc.get();
    
    if (existingDoc.exists) {
      await settingsDoc.update(updateData);
    } else {
      await settingsDoc.set(updateData);
    }

    // Return masked config
    const [smtp, imap, proxy] = await Promise.all([
      getMaskedSmtpConfig(teamId),
      getMaskedImapConfig(teamId),
      getMaskedProxyConfig(teamId),
    ]);
    const systemProxy = getDetectedSystemProxy();

    return NextResponse.json({ smtp, imap, proxy, systemProxy, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating email config:', error);
    return NextResponse.json({ error: 'Failed to update email config' }, { status: 500 });
  }
}
