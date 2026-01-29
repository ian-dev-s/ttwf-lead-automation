import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

    // Get current lead
    const currentLead = await prisma.lead.findUnique({
      where: { id },
    });

    if (!currentLead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Skip if status hasn't changed
    if (currentLead.status === status) {
      return NextResponse.json(currentLead);
    }

    // Create status history entry
    await prisma.statusHistory.create({
      data: {
        leadId: id,
        fromStatus: currentLead.status,
        toStatus: status,
        changedById: session.user.id,
        notes,
      },
    });

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
