import { auth } from '@/lib/auth';
import { messageDoc, leadDoc } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { renderLeadOutreachEmail } from '@/lib/email/templates/lead-outreach';
import { getBrandingConfig } from '@/lib/email/branding';

// POST /api/messages/[id]/resend
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
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const teamId = session.user.teamId;
    const { id } = await params;

    const msgSnap = await messageDoc(teamId, id).get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    const message = { id, ...msgSnap.data()! } as any;

    // Only allow resend for SENT, FAILED, or APPROVED
    if (message.status !== 'SENT' && message.status !== 'FAILED' && message.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Message cannot be resent in current status' },
        { status: 400 }
      );
    }

    if (message.type !== 'EMAIL') {
      return NextResponse.json({ error: 'Only email messages can be resent' }, { status: 400 });
    }

    const leadSnap = await leadDoc(teamId, message.leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const lead = { id: leadSnap.id, ...leadSnap.data()! } as any;

    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 });
    }

    const branding = await getBrandingConfig(teamId);
    const subject = message.subject || `A Website for ${lead.businessName}`;
    const whatsappMessage = "Hi, I received your email about a website for my business and I'm interested!";

    const emailHtml = renderLeadOutreachEmail({
      businessName: lead.businessName,
      recipientEmail: lead.email,
      subject,
      bodyHtml: message.content,
      branding,
      whatsappMessage,
    });

    const sendResult = await sendEmail(teamId, { to: lead.email, subject, html: emailHtml });

    if (sendResult.success) {
      await messageDoc(teamId, id).update({
        status: 'SENT',
        sentAt: new Date(),
        error: null,
        updatedAt: new Date(),
      });
    } else {
      await messageDoc(teamId, id).update({
        status: 'FAILED',
        error: sendResult.error || 'Failed to send email',
        updatedAt: new Date(),
      });
    }

    const updatedSnap = await messageDoc(teamId, id).get();
    return NextResponse.json({ id, ...updatedSnap.data()!, lead });
  } catch (error) {
    console.error('Error resending message:', error);
    return NextResponse.json({ error: 'Failed to resend message' }, { status: 500 });
  }
}
