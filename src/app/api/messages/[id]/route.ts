import { auth } from '@/lib/auth';
import { messageDoc, leadDoc, statusHistoryCollection } from '@/lib/firebase/collections';
import { MessageStatus } from '@/types';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const MSG_STATUS_VALUES = Object.values(MessageStatus) as [string, ...string[]];

const updateMessageSchema = z.object({
  subject: z.string().optional(),
  content: z.string().min(1).optional(),
  status: z.enum(MSG_STATUS_VALUES).optional(),
});

// GET /api/messages/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;
    const { id } = await params;

    const msgSnap = await messageDoc(teamId, id).get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const data = msgSnap.data()!;
    let lead = null;
    if (data.leadId) {
      const leadSnap = await leadDoc(teamId, data.leadId as string).get();
      if (leadSnap.exists) lead = { id: leadSnap.id, ...leadSnap.data()! };
    }

    return NextResponse.json({ id, ...data, lead });
  } catch (error) {
    console.error('Error fetching message:', error);
    return NextResponse.json({ error: 'Failed to fetch message' }, { status: 500 });
  }
}

// PATCH /api/messages/[id]
export async function PATCH(
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
    const body = await request.json();
    const validatedData = updateMessageSchema.parse(body);

    const msgSnap = await messageDoc(teamId, id).get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const currentMessage = msgSnap.data()!;

    const updateData: Record<string, unknown> = { ...validatedData, updatedAt: new Date() };

    // Handle SENT status transition
    if (validatedData.status === 'SENT') {
      updateData.sentAt = new Date();

      // Update lead status to CONTACTED
      const leadRef = leadDoc(teamId, currentMessage.leadId as string);
      const leadSnap = await leadRef.get();
      if (leadSnap.exists) {
        const leadData = leadSnap.data()!;
        await leadRef.update({
          status: 'CONTACTED',
          contactedAt: new Date(),
          updatedAt: new Date(),
        });

        await statusHistoryCollection(teamId).add({
          leadId: currentMessage.leadId,
          fromStatus: leadData.status,
          toStatus: 'CONTACTED',
          changedById: session.user.id,
          changedAt: new Date(),
          notes: `Message sent via ${currentMessage.type}`,
        });
      }
    }

    await messageDoc(teamId, id).update(updateData);

    // Fetch updated message with lead
    const updatedSnap = await messageDoc(teamId, id).get();
    const updatedData = updatedSnap.data()!;
    let lead = null;
    if (updatedData.leadId) {
      const leadSnap = await leadDoc(teamId, updatedData.leadId as string).get();
      if (leadSnap.exists) lead = { id: leadSnap.id, ...leadSnap.data()! };
    }

    return NextResponse.json({ id, ...updatedData, lead });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating message:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}

// DELETE /api/messages/[id]
export async function DELETE(
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

    await messageDoc(teamId, id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}
