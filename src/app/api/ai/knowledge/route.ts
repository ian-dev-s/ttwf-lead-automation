import { auth } from '@/lib/auth';
import { aiKnowledgeItemsCollection, serverTimestamp, stripUndefined } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createKnowledgeSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  category: z.string().optional().nullable(),
});

// GET /api/ai/knowledge - List knowledge base items
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const snapshot = await aiKnowledgeItemsCollection(teamId)
      .orderBy('createdAt', 'desc')
      .get();

    let items = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    // Filter by category client-side (Firestore requires composite index for where + orderBy on different fields)
    if (category) {
      items = items.filter(item => item.category === category);
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching knowledge items:', error);
    return NextResponse.json({ error: 'Failed to fetch knowledge items' }, { status: 500 });
  }
}

// POST /api/ai/knowledge - Create a knowledge base item
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
    const data = createKnowledgeSchema.parse(body);

    const itemData = stripUndefined({
      teamId,
      title: data.title,
      content: data.content,
      category: data.category ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const docRef = aiKnowledgeItemsCollection(teamId).doc();
    await docRef.set(itemData);

    const item = {
      id: docRef.id,
      ...itemData,
    };

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error creating knowledge item:', error);
    return NextResponse.json({ error: 'Failed to create knowledge item' }, { status: 500 });
  }
}
