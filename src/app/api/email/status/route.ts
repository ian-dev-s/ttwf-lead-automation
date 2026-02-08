import { auth } from '@/lib/auth';
import { getMaskedSmtpConfig, getMaskedImapConfig } from '@/lib/email/config';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/email/status
 * 
 * Returns email configuration status (is it configured or not).
 * Does NOT verify connections - that's done via /api/email/test-connection.
 * This keeps the endpoint fast for page loads.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const [smtpConfig, imapConfig] = await Promise.all([
      getMaskedSmtpConfig(teamId),
      getMaskedImapConfig(teamId),
    ]);

    return NextResponse.json({
      isConfigured: smtpConfig.isConfigured,
      smtp: smtpConfig,
      imap: imapConfig,
    });
  } catch (error) {
    console.error('Error checking email status:', error);
    return NextResponse.json(
      { error: 'Failed to check email status' },
      { status: 500 }
    );
  }
}
