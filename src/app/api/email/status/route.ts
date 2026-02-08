import { auth } from '@/lib/auth';
import { getMaskedSmtpConfig } from '@/lib/email/config';
import { verifySmtpConnection } from '@/lib/email/send';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const config = await getMaskedSmtpConfig(teamId);
    const connection = await verifySmtpConnection(teamId);

    return NextResponse.json({
      isConfigured: config.isConfigured,
      connected: connection.connected,
      error: connection.error,
      config,
    });
  } catch (error) {
    console.error('Error checking email status:', error);
    return NextResponse.json(
      { error: 'Failed to check email status' },
      { status: 500 }
    );
  }
}
