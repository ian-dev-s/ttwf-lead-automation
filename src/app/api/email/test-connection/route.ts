import { auth } from '@/lib/auth';
import { isSmtpConfigured } from '@/lib/email/config';
import { verifySmtpConnection } from '@/lib/email/send';
import { NextResponse } from 'next/server';

// POST /api/email/test-connection - Test SMTP connection
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    if (!(await isSmtpConfigured(teamId))) {
      return NextResponse.json(
        { success: false, message: 'SMTP is not configured. Go to Settings > Email to configure your SMTP server.' },
        { status: 400 }
      );
    }

    const result = await verifySmtpConnection(teamId);

    if (result.connected) {
      return NextResponse.json({
        success: true,
        message: 'SMTP connection successful',
      });
    } else {
      return NextResponse.json(
        { success: false, message: `SMTP connection failed: ${result.error || 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error testing SMTP connection:', error);
    return NextResponse.json(
      { error: 'Failed to test SMTP connection' },
      { status: 500 }
    );
  }
}
