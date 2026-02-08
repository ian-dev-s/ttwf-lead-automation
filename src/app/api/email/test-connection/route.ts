import { auth } from '@/lib/auth';
import { isSmtpConfigured, isImapConfigured } from '@/lib/email/config';
import { verifySmtpConnection } from '@/lib/email/send';
import { verifyImapConnection } from '@/lib/email/imap';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/email/test-connection - Test SMTP and/or IMAP connection
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    // Check for type parameter: 'smtp', 'imap', or undefined (defaults to smtp for backward compat)
    let type = 'smtp';
    try {
      const body = await request.json();
      if (body.type) {
        type = body.type;
      }
    } catch {
      // No body provided, default to smtp
    }

    if (type === 'imap') {
      if (!(await isImapConfigured(teamId))) {
        return NextResponse.json(
          { success: false, message: 'IMAP is not configured. Please fill in the IMAP settings and save first.' },
          { status: 400 }
        );
      }

      const result = await verifyImapConnection(teamId);

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: 'IMAP connection successful! Inbox is accessible.',
        });
      } else {
        return NextResponse.json(
          { success: false, message: `IMAP connection failed: ${result.error || 'Unknown error'}` },
          { status: 500 }
        );
      }
    } else {
      // SMTP (default)
      if (!(await isSmtpConfigured(teamId))) {
        return NextResponse.json(
          { success: false, message: 'SMTP is not configured. Please fill in the SMTP settings and save first.' },
          { status: 400 }
        );
      }

      const result = await verifySmtpConnection(teamId);

      if (result.connected) {
        return NextResponse.json({
          success: true,
          message: 'SMTP connection successful! Ready to send emails.',
        });
      } else {
        return NextResponse.json(
          { success: false, message: `SMTP connection failed: ${result.error || 'Unknown error'}` },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('Error testing connection:', error);
    return NextResponse.json(
      { error: 'Failed to test connection' },
      { status: 500 }
    );
  }
}
