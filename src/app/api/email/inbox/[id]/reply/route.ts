import { auth } from '@/lib/auth';
import { inboundEmailDoc, leadDoc } from '@/lib/firebase/collections';
import { sendEmail } from '@/lib/email/send';
import { generateInboundReply } from '@/lib/ai/reply';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'regenerate']),
});

// POST /api/email/inbox/[id]/reply - Approve, reject, or regenerate an AI reply
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

    const { id } = await params;
    const teamId = session.user.teamId;
    const body = await request.json();
    const { action } = actionSchema.parse(body);

    // Fetch the inbound email
    const emailDocRef = inboundEmailDoc(teamId, id);
    const emailSnap = await emailDocRef.get();

    if (!emailSnap.exists) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const email = { id: emailSnap.id, ...emailSnap.data()! } as any;

    // ─── APPROVE: Send the AI reply via SMTP ────────────────
    if (action === 'approve') {
      if (!email.aiReplyContent) {
        return NextResponse.json(
          { error: 'No AI reply to approve. Generate a reply first.' },
          { status: 400 }
        );
      }

      if (email.status === 'approved') {
        return NextResponse.json(
          { error: 'This reply has already been approved and sent.' },
          { status: 400 }
        );
      }

      // Extract the recipient email from the "from" field
      const fromMatch = email.from.match(/<(.+?)>/);
      const recipientEmail = fromMatch ? fromMatch[1] : email.from.trim();

      if (!recipientEmail || !recipientEmail.includes('@')) {
        return NextResponse.json(
          { error: 'Could not determine recipient email address.' },
          { status: 400 }
        );
      }

      const subject = email.aiReplySubject || `Re: ${email.subject}`;

      const sendResult = await sendEmail(teamId, {
        to: recipientEmail,
        subject,
        html: email.aiReplyContent,
      });

      if (sendResult.success) {
        await emailDocRef.update({
          status: 'approved',
          isProcessed: true,
          updatedAt: new Date(),
        });

        // If matched to a lead, update lead status to RESPONDED
        if (email.leadId) {
          try {
            const leadSnap = await leadDoc(teamId, email.leadId).get();
            if (leadSnap.exists) {
              const leadData = leadSnap.data()!;
              const LEAD_STATUS_ORDER = [
                'NEW', 'QUALIFIED', 'MESSAGE_READY', 'PENDING_APPROVAL',
                'CONTACTED', 'RESPONDED', 'CONVERTED', 'NOT_INTERESTED', 'INVALID',
              ];
              const currentIdx = LEAD_STATUS_ORDER.indexOf(leadData.status);
              const respondedIdx = LEAD_STATUS_ORDER.indexOf('RESPONDED');
              if (currentIdx < respondedIdx) {
                await leadDoc(teamId, email.leadId).update({
                  status: 'RESPONDED',
                  updatedAt: new Date(),
                });
              }
            }
          } catch (err) {
            console.error('Error updating lead status:', err);
          }
        }

        return NextResponse.json({
          success: true,
          status: 'approved',
          message: `Reply sent to ${recipientEmail}`,
        });
      } else {
        return NextResponse.json(
          { error: sendResult.error || 'Failed to send reply' },
          { status: 500 }
        );
      }
    }

    // ─── REJECT: Mark as rejected ───────────────────────────
    if (action === 'reject') {
      await emailDocRef.update({
        status: 'rejected',
        isProcessed: true,
        updatedAt: new Date(),
      });

      return NextResponse.json({
        success: true,
        status: 'rejected',
      });
    }

    // ─── REGENERATE: Generate a new AI reply ────────────────
    if (action === 'regenerate') {
      const emailBody = email.bodyText || email.bodyHtml?.replace(/<[^>]+>/g, ' ').trim() || '';
      if (!emailBody) {
        return NextResponse.json(
          { error: 'Cannot generate reply — email has no content.' },
          { status: 400 }
        );
      }

      // Fetch lead context if available
      let leadContext: { businessName?: string; industry?: string; location?: string } | null = null;
      if (email.leadId) {
        try {
          const leadSnap = await leadDoc(teamId, email.leadId).get();
          if (leadSnap.exists) {
            const ld = leadSnap.data()!;
            leadContext = {
              businessName: ld.businessName,
              industry: ld.industry || undefined,
              location: ld.location,
            };
          }
        } catch {
          // Ignore lead fetch errors
        }
      }

      const reply = await generateInboundReply({
        teamId,
        from: email.from,
        subject: email.subject,
        bodyText: emailBody,
        leadContext,
      });

      await emailDocRef.update({
        aiReplyContent: reply.content,
        aiReplySubject: reply.subject,
        status: 'pending',
        isProcessed: false,
        updatedAt: new Date(),
      });

      return NextResponse.json({
        success: true,
        status: 'pending',
        aiReplyContent: reply.content,
        aiReplySubject: reply.subject,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error handling reply action:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process reply action' },
      { status: 500 }
    );
  }
}
