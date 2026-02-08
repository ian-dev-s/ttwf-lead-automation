import { auth } from '@/lib/auth';
import { getEmailConfig } from '@/lib/email/config';
import { sendEmail } from '@/lib/email/send';
import { NextRequest, NextResponse } from 'next/server';
import { getBrandingConfig } from '@/lib/email/branding';
import { renderLeadOutreachEmail } from '@/lib/email/templates/lead-outreach';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const teamId = session.user.teamId;

    const body = await request.json().catch(() => ({}));
    const config = await getEmailConfig(teamId);

    // Send to debug address, or the provided address, or the user's own email
    const testTo = config.debugAddress || body.to || session.user.email;

    if (!testTo) {
      return NextResponse.json(
        { error: 'No recipient address available. Set EMAIL_DEBUG_ADDRESS or provide a "to" address.' },
        { status: 400 }
      );
    }

    const branding = await getBrandingConfig(teamId);

    const testHtml = renderLeadOutreachEmail({
      businessName: 'Test Business',
      recipientEmail: testTo,
      subject: '[Test] TTWF Lead Generator - Email Configuration Test',
      bodyHtml: `
        <p>This is a <strong>test email</strong> from your TTWF Lead Generator system.</p>
        <p>If you're reading this, your SMTP configuration is working correctly!</p>
        <p>This email demonstrates the full branded template with:</p>
        <ul>
          <li>Company logo/banner header</li>
          <li>WhatsApp CTA button</li>
          <li>Social media links in the footer</li>
        </ul>
        <p>Sent at: ${new Date().toISOString()}</p>
      `,
      branding,
      whatsappMessage: 'Hi, I received your test email!',
    });

    const result = await sendEmail(teamId, {
      to: testTo,
      subject: '[Test] TTWF Lead Generator - Email Configuration Test',
      html: testHtml,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${testTo}`,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        { success: false, message: `Failed to send test email: ${result.error}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json(
      { error: 'Failed to send test email' },
      { status: 500 }
    );
  }
}
