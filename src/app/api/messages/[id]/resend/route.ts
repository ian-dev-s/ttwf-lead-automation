import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MessageStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { renderLeadOutreachEmail } from '@/lib/email/templates/lead-outreach';
import { getBrandingConfig } from '@/lib/email/branding';

// POST /api/messages/[id]/resend - Re-send an email that was previously sent or failed
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;

    const message = await prisma.message.findFirst({
      where: { id, teamId },
      include: { lead: true },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Only allow resend for messages with status SENT, FAILED, or APPROVED
    if (
      message.status !== MessageStatus.SENT &&
      message.status !== MessageStatus.FAILED &&
      message.status !== MessageStatus.APPROVED
    ) {
      return NextResponse.json(
        { error: 'Message cannot be resent in current status' },
        { status: 400 }
      );
    }

    // Only allow resend for EMAIL type messages
    if (message.type !== 'EMAIL') {
      return NextResponse.json(
        { error: 'Only email messages can be resent' },
        { status: 400 }
      );
    }

    // Check that the lead has an email address
    if (!message.lead.email) {
      return NextResponse.json(
        { error: 'Lead has no email address' },
        { status: 400 }
      );
    }

    // Get branding configuration
    const branding = await getBrandingConfig(teamId);

    // Build email data
    const subject = message.subject || `A Website for ${message.lead.businessName}`;
    const whatsappMessage = "Hi, I received your email about a website for my business and I'm interested!";

    // Render email template
    const emailHtml = renderLeadOutreachEmail({
      businessName: message.lead.businessName,
      recipientEmail: message.lead.email,
      subject,
      bodyHtml: message.content,
      branding,
      whatsappMessage,
    });

    // Attempt to send email
    const sendResult = await sendEmail(teamId, {
      to: message.lead.email,
      subject,
      html: emailHtml,
    });

    let updatedMessage;
    if (sendResult.success) {
      // Email sent successfully
      updatedMessage = await prisma.message.update({
        where: { id },
        data: {
          status: MessageStatus.SENT,
          sentAt: new Date(),
          error: null,
        },
        include: {
          lead: true,
        },
      });
    } else {
      // Email send failed
      updatedMessage = await prisma.message.update({
        where: { id },
        data: {
          status: MessageStatus.FAILED,
          error: sendResult.error || 'Failed to send email',
        },
        include: {
          lead: true,
        },
      });
    }

    return NextResponse.json(updatedMessage);
  } catch (error) {
    console.error('Error resending message:', error);
    return NextResponse.json(
      { error: 'Failed to resend message' },
      { status: 500 }
    );
  }
}
