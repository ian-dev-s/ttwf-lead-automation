import { auth } from '@/lib/auth';
import { messagesCollection, messageDoc, leadDoc } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateFollowUpMessage } from '@/lib/ai/personalize';

const createFollowUpSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  previousMessageId: z.string().optional(),
});

// POST /api/messages/follow-up
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
    const validatedData = createFollowUpSchema.parse(body);

    const result = await generateFollowUpMessage(
      teamId,
      validatedData.leadId,
      validatedData.previousMessageId
    );

    // Fetch the created message with lead
    const msgSnap = await messageDoc(teamId, result.id).get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: 'Failed to retrieve created message' }, { status: 500 });
    }

    const msgData = msgSnap.data()!;
    let lead = null;
    if (msgData.leadId) {
      const leadSnap = await leadDoc(teamId, msgData.leadId as string).get();
      if (leadSnap.exists) lead = { id: leadSnap.id, ...leadSnap.data()! };
    }

    const message = { id: result.id, ...msgData, lead };

    return NextResponse.json(
      {
        message,
        provider: (msgData as any).aiProvider || null,
        model: (msgData as any).aiModel || null,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error creating follow-up message:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create follow-up message' },
      { status: 500 }
    );
  }
}

// GET /api/messages/follow-up
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
      return NextResponse.json({ error: 'leadId query parameter is required' }, { status: 400 });
    }

    const snapshot = await messagesCollection(teamId)
      .where('leadId', '==', leadId)
      .orderBy('createdAt', 'desc')
      .get();

    const allMessages = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        let lead = null;
        const leadSnap = await leadDoc(teamId, leadId).get();
        if (leadSnap.exists) lead = { id: leadSnap.id, ...leadSnap.data()! };
        return { id: doc.id, ...data, lead };
      })
    );

    const followUpMessages = allMessages.length > 1 ? allMessages.slice(1) : [];

    return NextResponse.json({
      data: followUpMessages,
      total: followUpMessages.length,
    });
  } catch (error) {
    console.error('Error fetching follow-up messages:', error);
    return NextResponse.json({ error: 'Failed to fetch follow-up messages' }, { status: 500 });
  }
}
