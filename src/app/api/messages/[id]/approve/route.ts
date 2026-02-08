import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LeadStatus, MessageStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { renderLeadOutreachEmail } from '@/lib/email/templates/lead-outreach';
import { getBrandingConfig } from '@/lib/email/branding';

// POST /api/messages/[id]/approve - Approve a message for sending
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

    // Can only approve DRAFT, PENDING_APPROVAL, or FAILED messages (for retry)
    if (message.status !== MessageStatus.DRAFT && 
        message.status !== MessageStatus.PENDING_APPROVAL &&
        message.status !== MessageStatus.FAILED) {
      return NextResponse.json(
        { error: 'Message cannot be approved in current status' },
        { status: 400 }
      );
    }

    // Update message status to APPROVED
    let updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        status: MessageStatus.APPROVED,
      },
      include: {
        lead: true,
      },
    });

    // For EMAIL messages, attempt to send immediately after approval
    if (message.type === 'EMAIL') {
      // Check if lead has an email address
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

        // Update lead status to CONTACTED
        const leadStatusOrder = [
          'NEW', 'QUALIFIED', 'MESSAGE_READY', 'PENDING_APPROVAL',
          'CONTACTED', 'RESPONDED', 'CONVERTED', 'NOT_INTERESTED', 'INVALID'
        ];
        
        const currentIndex = leadStatusOrder.indexOf(message.lead.status);
        const contactedIndex = leadStatusOrder.indexOf('CONTACTED');

        if (currentIndex < contactedIndex) {
          await prisma.lead.update({
            where: { id: message.leadId },
            data: { status: LeadStatus.CONTACTED },
          });

          await prisma.statusHistory.create({
            data: {
              leadId: message.leadId,
              teamId,
              fromStatus: message.lead.status,
              toStatus: LeadStatus.CONTACTED,
              changedById: session.user.id,
              notes: 'Email sent successfully',
            },
          });
        }
      } else {
        // Email send failed - set status to FAILED and store error (user can retry by approving again)
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
    } else {
      // For WhatsApp messages, update lead status to PENDING_APPROVAL if not already further along
      const leadStatusOrder = [
        'NEW', 'QUALIFIED', 'MESSAGE_READY', 'PENDING_APPROVAL',
        'CONTACTED', 'RESPONDED', 'CONVERTED', 'NOT_INTERESTED', 'INVALID'
      ];
      
      const currentIndex = leadStatusOrder.indexOf(message.lead.status);
      const pendingIndex = leadStatusOrder.indexOf('PENDING_APPROVAL');

      if (currentIndex < pendingIndex) {
        await prisma.lead.update({
          where: { id: message.leadId },
          data: { status: LeadStatus.PENDING_APPROVAL },
        });

        await prisma.statusHistory.create({
          data: {
            leadId: message.leadId,
            teamId,
            fromStatus: message.lead.status,
            toStatus: LeadStatus.PENDING_APPROVAL,
            changedById: session.user.id,
            notes: 'Message approved for sending',
          },
        });
      }
    }

    return NextResponse.json(updatedMessage);
  } catch (error) {
    console.error('Error approving message:', error);
    return NextResponse.json(
      { error: 'Failed to approve message' },
      { status: 500 }
    );
  }
}
