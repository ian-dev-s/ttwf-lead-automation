import { auth } from '@/lib/auth';
import { messageDoc, leadDoc, statusHistoryCollection } from '@/lib/firebase/collections';
import { events } from '@/lib/events';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { renderLeadOutreachEmail } from '@/lib/email/templates/lead-outreach';
import { getBrandingConfig } from '@/lib/email/branding';

const LEAD_STATUS_ORDER = [
  'NEW', 'QUALIFIED', 'MESSAGE_READY', 'PENDING_APPROVAL',
  'CONTACTED', 'RESPONDED', 'CONVERTED', 'NOT_INTERESTED', 'INVALID',
];

// POST /api/messages/[id]/approve
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

    // Get lead
    const leadSnap = await leadDoc(teamId, message.leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const lead = { id: leadSnap.id, ...leadSnap.data()! } as any;

    // Can only approve DRAFT, PENDING_APPROVAL, or FAILED messages
    if (message.status !== 'DRAFT' && message.status !== 'PENDING_APPROVAL' && message.status !== 'FAILED') {
      return NextResponse.json(
        { error: 'Message cannot be approved in current status' },
        { status: 400 }
      );
    }

    // Update to APPROVED
    await messageDoc(teamId, id).update({ status: 'APPROVED', updatedAt: new Date() });

    // Track message result

    // For EMAIL messages, attempt to send immediately
    if (message.type === 'EMAIL') {
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

      const sendResult = await sendEmail(teamId, {
        to: lead.email,
        subject,
        html: emailHtml,
      });

      if (sendResult.success) {
        await messageDoc(teamId, id).update({
          status: 'SENT',
          sentAt: new Date(),
          error: null,
          updatedAt: new Date(),
        });

        // Update lead to CONTACTED if appropriate
        const currentIndex = LEAD_STATUS_ORDER.indexOf(lead.status);
        const contactedIndex = LEAD_STATUS_ORDER.indexOf('CONTACTED');

        if (currentIndex < contactedIndex) {
          await leadDoc(teamId, lead.id).update({
            status: 'CONTACTED',
            updatedAt: new Date(),
          });

          await statusHistoryCollection(teamId).add({
            leadId: lead.id,
            fromStatus: lead.status,
            toStatus: 'CONTACTED',
            changedById: session.user.id,
            changedAt: new Date(),
            notes: 'Email sent successfully',
          });
        }
      } else {
        await messageDoc(teamId, id).update({
          status: 'FAILED',
          error: sendResult.error || 'Failed to send email',
          updatedAt: new Date(),
        });
      }
    } else {
      // WhatsApp - update lead to PENDING_APPROVAL
      const currentIndex = LEAD_STATUS_ORDER.indexOf(lead.status);
      const pendingIndex = LEAD_STATUS_ORDER.indexOf('PENDING_APPROVAL');

      if (currentIndex < pendingIndex) {
        await leadDoc(teamId, lead.id).update({
          status: 'PENDING_APPROVAL',
          updatedAt: new Date(),
        });

        await statusHistoryCollection(teamId).add({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'PENDING_APPROVAL',
          changedById: session.user.id,
          changedAt: new Date(),
          notes: 'Message approved for sending',
        });
      }
    }

    // Notify about the approval result
    const finalSnap = await messageDoc(teamId, id).get();
    const finalStatus = finalSnap.data()?.status;
    await events.messageApproved(id, {
      businessName: lead.businessName,
      email: lead.email,
      status: finalStatus,
      error: finalSnap.data()?.error,
    }, teamId);

    // Return updated message
    return NextResponse.json({ id, ...finalSnap.data()!, lead });
  } catch (error) {
    console.error('Error approving message:', error);
    return NextResponse.json({ error: 'Failed to approve message' }, { status: 500 });
  }
}
