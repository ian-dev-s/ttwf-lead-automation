import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LeadStatus, MessageStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for updating a message
const updateMessageSchema = z.object({
  subject: z.string().optional(),
  content: z.string().min(1).optional(),
  status: z.nativeEnum(MessageStatus).optional(),
});

// GET /api/messages/[id] - Get a single message
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        lead: true,
      },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    return NextResponse.json(
      { error: 'Failed to fetch message' },
      { status: 500 }
    );
  }
}

// PATCH /api/messages/[id] - Update a message
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
    const validatedData = updateMessageSchema.parse(body);

    const currentMessage = await prisma.message.findUnique({
      where: { id },
      include: { lead: true },
    });

    if (!currentMessage) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Handle status transitions
    const updateData: any = { ...validatedData };

    if (validatedData.status === MessageStatus.SENT) {
      updateData.sentAt = new Date();
      
      // Also update the lead status to CONTACTED
      await prisma.lead.update({
        where: { id: currentMessage.leadId },
        data: {
          status: LeadStatus.CONTACTED,
          contactedAt: new Date(),
        },
      });

      // Create status history
      await prisma.statusHistory.create({
        data: {
          leadId: currentMessage.leadId,
          fromStatus: currentMessage.lead.status,
          toStatus: LeadStatus.CONTACTED,
          changedById: session.user.id,
          notes: `Message sent via ${currentMessage.type}`,
        },
      });
    }

    const message = await prisma.message.update({
      where: { id },
      data: updateData,
      include: {
        lead: true,
      },
    });

    return NextResponse.json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating message:', error);
    return NextResponse.json(
      { error: 'Failed to update message' },
      { status: 500 }
    );
  }
}

// DELETE /api/messages/[id] - Delete a message
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
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    await prisma.message.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}
