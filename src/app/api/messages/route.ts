import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MessageStatus, MessageType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for creating a message
const createMessageSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  type: z.nativeEnum(MessageType),
  subject: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  status: z.nativeEnum(MessageStatus).optional(),
});

// GET /api/messages - Get messages with optional filtering
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as MessageStatus | null;
    const type = searchParams.get('type') as MessageType | null;
    const leadId = searchParams.get('leadId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build where clause
    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (type) {
      where.type = type;
    }
    
    if (leadId) {
      where.leadId = leadId;
    }

    // Get total count
    const total = await prisma.message.count({ where });

    // Get messages with lead details
    const messages = await prisma.message.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            phone: true,
            email: true,
            location: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      data: messages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

// POST /api/messages - Create a new message
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

    const body = await request.json();
    const validatedData = createMessageSchema.parse(body);

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: validatedData.leadId },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const message = await prisma.message.create({
      data: {
        leadId: validatedData.leadId,
        type: validatedData.type,
        subject: validatedData.subject,
        content: validatedData.content,
        status: validatedData.status || MessageStatus.DRAFT,
      },
      include: {
        lead: true,
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
