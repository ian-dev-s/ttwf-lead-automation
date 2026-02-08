import { auth } from '@/lib/auth';
import { aiKnowledgeItemsCollection, serverTimestamp, stripUndefined } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createKnowledgeSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  category: z.string().optional().nullable(),
});

// Default knowledge base items for The Tiny Web Factory
const DEFAULT_KNOWLEDGE_ITEMS = [
  {
    title: 'Our Services',
    content: 'The Tiny Web Factory specialises in creating professional landing page websites for small businesses. We also offer professional business email addresses (e.g., info@yourbusiness.co.za) to strengthen brand credibility. Our focus is on helping South African businesses establish a strong online presence without breaking the bank.',
    category: 'Services',
  },
  {
    title: 'Free Draft Website Offer',
    content: 'We create a free draft landing page for prospective clients at no cost and with no obligation. The client can review the draft, request changes, and only once they are completely happy do we send an invoice to take the website live. This removes all risk for the client and lets them see exactly what they will get before committing.',
    category: 'Sales Process',
  },
  {
    title: 'Why Businesses Need a Website',
    content: 'Many small businesses in South Africa rely solely on Facebook pages or Google Maps listings. A professional website builds trust, appears in Google search results, works 24/7 as a digital shopfront, and gives businesses full control over their online brand. Customers increasingly expect businesses to have a website before they make contact.',
    category: 'Value Proposition',
  },
  {
    title: 'Our Target Market',
    content: 'We focus on small service-based businesses in South Africa that either have no website or have a low-quality website (e.g., free Wix/WordPress.com sites). Ideal prospects have good Google ratings (4+ stars), are established in their community, and would benefit from a professional online presence. Common industries include plumbers, electricians, beauty salons, photographers, caterers, and personal trainers.',
    category: 'Company Info',
  },
];

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

    // Auto-seed default knowledge items if collection is empty
    if (snapshot.empty) {
      const now = serverTimestamp();
      for (const item of DEFAULT_KNOWLEDGE_ITEMS) {
        const docRef = aiKnowledgeItemsCollection(teamId).doc();
        await docRef.set(stripUndefined({
          teamId,
          title: item.title,
          content: item.content,
          category: item.category,
          createdAt: now,
          updatedAt: now,
        }));
      }

      // Re-fetch after seeding
      const seededSnapshot = await aiKnowledgeItemsCollection(teamId)
        .orderBy('createdAt', 'desc')
        .get();

      const items = seededSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

      return NextResponse.json(items);
    }

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
