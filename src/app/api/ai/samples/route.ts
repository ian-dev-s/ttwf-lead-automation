import { auth } from '@/lib/auth';
import { aiSampleResponsesCollection, serverTimestamp, stripUndefined } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSampleSchema = z.object({
  customerQuestion: z.string().min(1),
  preferredResponse: z.string().min(1),
  category: z.string().optional().nullable(),
});

// GET /api/ai/samples - List sample responses
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const snapshot = await aiSampleResponsesCollection(teamId)
      .orderBy('createdAt', 'desc')
      .get();

    let samples = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    // Filter by category client-side (Firestore requires composite index for where + orderBy on different fields)
    if (category) {
      samples = samples.filter(sample => sample.category === category);
    }

    return NextResponse.json(samples);
  } catch (error) {
    console.error('Error fetching sample responses:', error);
    return NextResponse.json({ error: 'Failed to fetch sample responses' }, { status: 500 });
  }
}

// POST /api/ai/samples - Create a sample response
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
    const data = createSampleSchema.parse(body);

    const sampleData = stripUndefined({
      teamId,
      customerQuestion: data.customerQuestion,
      preferredResponse: data.preferredResponse,
      category: data.category ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const docRef = aiSampleResponsesCollection(teamId).doc();
    await docRef.set(sampleData);

    const sample = {
      id: docRef.id,
      ...sampleData,
    };

    return NextResponse.json(sample, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error creating sample response:', error);
    return NextResponse.json({ error: 'Failed to create sample response' }, { status: 500 });
  }
}
