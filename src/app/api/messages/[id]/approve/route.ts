import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LeadStatus, MessageStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

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

    const { id } = await params;

    const message = await prisma.message.findUnique({
      where: { id },
      include: { lead: true },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Can only approve DRAFT or PENDING_APPROVAL messages
    if (message.status !== MessageStatus.DRAFT && 
        message.status !== MessageStatus.PENDING_APPROVAL) {
      return NextResponse.json(
        { error: 'Message cannot be approved in current status' },
        { status: 400 }
      );
    }

    // Update message status to APPROVED
    const updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        status: MessageStatus.APPROVED,
      },
      include: {
        lead: true,
      },
    });

    // Update lead status to PENDING_APPROVAL if not already further along
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
          fromStatus: message.lead.status,
          toStatus: LeadStatus.PENDING_APPROVAL,
          changedById: session.user.id,
          notes: 'Message approved for sending',
        },
      });
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
