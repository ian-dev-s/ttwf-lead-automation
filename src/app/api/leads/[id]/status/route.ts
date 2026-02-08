import { auth } from '@/lib/auth';
import { leadDoc, messagesCollection, statusHistoryCollection, userDoc } from '@/lib/firebase/collections';
import { events } from '@/lib/events';
import { LeadStatus } from '@/types';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const LEAD_STATUS_VALUES = Object.values(LeadStatus) as [string, ...string[]];

const statusUpdateSchema = z.object({
  status: z.enum(LEAD_STATUS_VALUES),
  notes: z.string().optional(),
});

// PATCH /api/leads/[id]/status - Update lead status (optimized for Kanban)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    if (session.user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = statusUpdateSchema.parse(body);

    // Get current lead
    const leadSnap = await leadDoc(teamId, id).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const currentLead = { id, ...leadSnap.data()! };

    // Skip if status hasn't changed
    if (currentLead.status === status) {
      return NextResponse.json(currentLead);
    }

    // Get messages for validation
    const msgSnapshot = await messagesCollection(teamId)
      .where('leadId', '==', id)
      .get();
    const messages = msgSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // VALIDATION: Must have a message before changing from NEW
    const hasMessages = messages.length > 0;
    if (!hasMessages && status !== 'NEW' && status !== 'REJECTED' && status !== 'INVALID') {
      return NextResponse.json(
        { error: 'A lead must have at least one message before changing status from NEW' },
        { status: 400 }
      );
    }

    // VALIDATION: Must have EMAIL message to be QUALIFIED
    const hasEmailMessage = messages.some((m: any) => m.type === 'EMAIL');
    if (status === 'QUALIFIED' && !hasEmailMessage) {
      return NextResponse.json(
        { error: 'A lead must have an email message to be qualified' },
        { status: 400 }
      );
    }

    // Verify user exists before creating status history
    const userSnap = await userDoc(session.user.id).get();

    if (userSnap.exists) {
      await statusHistoryCollection(teamId).add({
        leadId: id,
        fromStatus: currentLead.status,
        toStatus: status,
        changedById: session.user.id,
        changedAt: new Date(),
        notes: notes || null,
      });
    }

    // Update the lead
    const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === 'CONTACTED' && !currentLead.contactedAt) {
      updateData.contactedAt = new Date();
    }

    await leadDoc(teamId, id).update(updateData);

    const updatedSnap = await leadDoc(teamId, id).get();
    const lead = { id, ...updatedSnap.data()! };

    await events.leadStatusChanged({
      id: lead.id,
      businessName: lead.businessName as string,
      status: lead.status as string,
      previousStatus: currentLead.status as string,
    }, teamId);

    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating lead status:', error);
    return NextResponse.json(
      { error: 'Failed to update lead status' },
      { status: 500 }
    );
  }
}
