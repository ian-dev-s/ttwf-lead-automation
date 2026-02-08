import { auth } from '@/lib/auth';
import { aiSampleResponsesCollection, serverTimestamp, stripUndefined } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSampleSchema = z.object({
  customerQuestion: z.string().min(1),
  preferredResponse: z.string().min(1),
  category: z.string().optional().nullable(),
});

// Default sample responses for The Tiny Web Factory
const DEFAULT_SAMPLE_RESPONSES = [
  {
    customerQuestion: 'How much does a website cost?',
    preferredResponse: 'Great question! We start by creating a free draft landing page for you — completely no obligation. You can review it, suggest changes, and only once you are 100% happy do we send an invoice. Our landing pages are very affordable and tailored to small businesses. Would you like us to put a draft together for you?',
    category: 'Pricing',
  },
  {
    customerQuestion: 'How long does it take to build a website?',
    preferredResponse: 'We typically have a draft landing page ready within 2-3 business days. Once you review it and we make any changes you would like, we can have it live within a day. The whole process is quick and painless!',
    category: 'Process',
  },
  {
    customerQuestion: 'I already have a Facebook page, do I really need a website?',
    preferredResponse: 'A Facebook page is a great start, but a professional website gives you much more visibility. Your website appears in Google searches, works 24/7 as your digital shopfront, and gives you full control over your brand. Many customers look for a website before making contact — it builds trust and credibility. The best part? We will create a free draft so you can see the difference for yourself.',
    category: 'Value Proposition',
  },
  {
    customerQuestion: 'Do you offer ongoing support and maintenance?',
    preferredResponse: 'Absolutely! We offer ongoing support to ensure your website stays up to date and running smoothly. We can also help with updates, adding new content, and keeping everything secure. You will never be left without help.',
    category: 'Support',
  },
];

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

    // Auto-seed default sample responses if collection is empty
    if (snapshot.empty) {
      const now = serverTimestamp();
      for (const sample of DEFAULT_SAMPLE_RESPONSES) {
        const docRef = aiSampleResponsesCollection(teamId).doc();
        await docRef.set(stripUndefined({
          teamId,
          customerQuestion: sample.customerQuestion,
          preferredResponse: sample.preferredResponse,
          category: sample.category,
          createdAt: now,
          updatedAt: now,
        }));
      }

      // Re-fetch after seeding
      const seededSnapshot = await aiSampleResponsesCollection(teamId)
        .orderBy('createdAt', 'desc')
        .get();

      const samples = seededSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

      return NextResponse.json(samples);
    }

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
