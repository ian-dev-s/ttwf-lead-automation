import { auth } from '@/lib/auth';
import { messagesCollection, leadDoc } from '@/lib/firebase/collections';
import { MessageStatus, MessageType } from '@/types';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const MSG_STATUS_VALUES = Object.values(MessageStatus) as [string, ...string[]];
const MSG_TYPE_VALUES = Object.values(MessageType) as [string, ...string[]];

const createMessageSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  type: z.enum(MSG_TYPE_VALUES),
  subject: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  status: z.enum(MSG_STATUS_VALUES).optional(),
});

// GET /api/messages
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const leadId = searchParams.get('leadId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    let query: FirebaseFirestore.Query<any> = messagesCollection(teamId);

    if (status) query = query.where('status', '==', status);
    if (type) query = query.where('type', '==', type);
    if (leadId) query = query.where('leadId', '==', leadId);

    // Count
    const countSnap = await query.count().get();
    const total = countSnap.data().count;

    // Fetch with pagination
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    // Attach lead details
    const messages = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        let lead = null;
        if (data.leadId) {
          const leadSnap = await leadDoc(teamId, data.leadId as string).get();
          if (leadSnap.exists) {
            const ld = leadSnap.data()!;
            lead = {
              id: leadSnap.id,
              businessName: ld.businessName,
              phone: ld.phone,
              email: ld.email,
              location: ld.location,
            };
          }
        }
        return { id: doc.id, ...data, lead };
      })
    );

    return NextResponse.json({
      data: messages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST /api/messages
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const teamId = session.user.teamId;
    const body = await request.json();
    const validatedData = createMessageSchema.parse(body);

    // Verify lead exists
    const leadSnap = await leadDoc(teamId, validatedData.leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const now = new Date();
    const messageData = {
      leadId: validatedData.leadId,
      type: validatedData.type,
      subject: validatedData.subject || null,
      content: validatedData.content,
      status: validatedData.status || 'DRAFT',
      sentAt: null,
      error: null,
      generatedBy: null,
      aiProvider: null,
      aiModel: null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = messagesCollection(teamId).doc();
    await docRef.set(messageData);

    const leadData = leadSnap.data()!;
    const lead = { id: leadSnap.id, ...leadData };

    return NextResponse.json(
      { id: docRef.id, ...messageData, lead },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error creating message:', error);
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
  }
}
