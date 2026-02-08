import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { events } from '@/lib/events';
import { LeadStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for status update
const statusUpdateSchema = z.object({
  status: z.nativeEnum(LeadStatus),
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

    if (session.user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { status, notes } = statusUpdateSchema.parse(body);

    // Get current lead with messages
    const currentLead = await prisma.lead.findUnique({
      where: { id },
      include: {
        messages: true,
      },
    });

    if (!currentLead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Skip if status hasn't changed
    if (currentLead.status === status) {
      return NextResponse.json(currentLead);
    }

    // VALIDATION: A lead cannot have any status other than NEW without a message
    const hasMessages = currentLead.messages.length > 0;
    if (!hasMessages && status !== 'NEW' && status !== 'REJECTED' && status !== 'INVALID') {
      return NextResponse.json(
        { error: 'A lead must have at least one message before changing status from NEW' },
        { status: 400 }
      );
    }

    // VALIDATION: A lead must have an EMAIL message to be QUALIFIED
    const hasEmailMessage = currentLead.messages.some(m => m.type === 'EMAIL');
    if (status === 'QUALIFIED' && !hasEmailMessage) {
      return NextResponse.json(
        { error: 'A lead must have an email message to be qualified' },
        { status: 400 }
      );
    }

    // Verify the user exists before creating status history
    const userExists = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });

    // Create status history entry (only if user exists)
    if (userExists) {
      await prisma.statusHistory.create({
        data: {
          leadId: id,
          fromStatus: currentLead.status,
          toStatus: status,
          changedById: session.user.id,
          notes,
        },
      });
    } else {
      console.warn(`[Status Update] User ${session.user.id} not found in database, skipping status history`);
    }

    // Update the lead
    const updateData: any = { status };

    // Set contacted timestamp if moving to CONTACTED
    if (status === 'CONTACTED' && !currentLead.contactedAt) {
      updateData.contactedAt = new Date();
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: updateData,
    });

    // Publish real-time event for status change
    await events.leadStatusChanged({
      id: lead.id,
      businessName: lead.businessName,
      status: lead.status,
      previousStatus: currentLead.status,
    });

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
