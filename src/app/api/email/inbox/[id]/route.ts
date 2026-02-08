import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateSchema = z.object({
  isRead: z.boolean().optional(),
  leadId: z.string().nullable().optional(),
});

// GET /api/email/inbox/[id] - Get single inbound email with details
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
    const teamId = session.user.teamId;
    
    const email = await prisma.inboundEmail.findFirst({
      where: { id, teamId },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phone: true,
            location: true,
            status: true,
          },
        },
      },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Mark as read
    if (!email.isRead) {
      await prisma.inboundEmail.update({
        where: { id },
        data: { isRead: true },
      });
    }

    return NextResponse.json(email);
  } catch (error) {
    console.error('Error fetching email:', error);
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 });
  }
}

// PATCH /api/email/inbox/[id] - Update inbound email (mark read, link to lead)
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

    const { id } = await params;
    const teamId = session.user.teamId;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const existingEmail = await prisma.inboundEmail.findFirst({
      where: { id, teamId },
    });

    if (!existingEmail) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const email = await prisma.inboundEmail.update({
      where: { id },
      data,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(email);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating email:', error);
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
  }
}

// DELETE /api/email/inbox/[id] - Delete inbound email
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

    const { id } = await params;
    const teamId = session.user.teamId;

    const existingEmail = await prisma.inboundEmail.findFirst({
      where: { id, teamId },
    });

    if (!existingEmail) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    await prisma.inboundEmail.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting email:', error);
    return NextResponse.json({ error: 'Failed to delete email' }, { status: 500 });
  }
}
