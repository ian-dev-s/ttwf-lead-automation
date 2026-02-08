import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateFollowUpMessage } from '@/lib/ai/personalize';

// Validation schema for creating a follow-up message
const createFollowUpSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  previousMessageId: z.string().optional(),
});

// POST /api/messages/follow-up - Create a follow-up message for a lead
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const validatedData = createFollowUpSchema.parse(body);

    // Generate the follow-up message
    const result = await generateFollowUpMessage(
      teamId,
      validatedData.leadId,
      validatedData.previousMessageId
    );

    // Fetch the created message with lead relation
    const message = await prisma.message.findUnique({
      where: { id: result.id },
      include: {
        lead: true,
      },
    });

    if (!message) {
      return NextResponse.json(
        { error: 'Failed to retrieve created message' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message,
        provider: message.aiProvider || null,
        model: message.aiModel || null,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating follow-up message:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create follow-up message' },
      { status: 500 }
    );
  }
}

// GET /api/messages/follow-up - Get follow-up messages for a lead
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;
    const searchParams = request.nextUrl.searchParams;
    const leadId = searchParams.get('leadId');

    if (!leadId) {
      return NextResponse.json(
        { error: 'leadId query parameter is required' },
        { status: 400 }
      );
    }

    // Get all messages for the lead, ordered by createdAt desc
    const allMessages = await prisma.message.findMany({
      where: { leadId, teamId },
      include: {
        lead: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // If there are multiple messages, all except the first one are follow-ups
    // (the first one is the original outreach message)
    const followUpMessages = allMessages.length > 1 ? allMessages.slice(1) : [];

    return NextResponse.json({
      data: followUpMessages,
      total: followUpMessages.length,
    });
  } catch (error) {
    console.error('Error fetching follow-up messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch follow-up messages' },
      { status: 500 }
    );
  }
}
