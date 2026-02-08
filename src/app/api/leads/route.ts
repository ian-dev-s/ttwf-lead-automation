import { auth } from '@/lib/auth';
import { leadsCollection, messagesCollection, stripUndefined, toDate } from '@/lib/firebase/collections';
import { events } from '@/lib/events';
import { calculateLeadScore } from '@/lib/utils';
import type { LeadStatus } from '@/types';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Serialize Firestore data to plain JSON-safe objects.
 * Converts Timestamps to ISO strings.
 */
function serializeForJson(data: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      serialized[key] = value;
    } else if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: () => Date }).toDate === 'function'
    ) {
      // Firestore Timestamp -> ISO string
      serialized[key] = toDate(value).toISOString();
    } else if (value instanceof Date) {
      serialized[key] = value.toISOString();
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively serialize nested objects
      serialized[key] = serializeForJson(value as Record<string, unknown>);
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}

// Validation schema for creating a lead
const createLeadSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  industry: z.string().optional(),
  location: z.string().min(1, 'Location is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  facebookUrl: z.string().url().optional().or(z.literal('')),
  googleMapsUrl: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  websiteQuality: z.number().min(0).max(100).optional(),
  googleRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().min(0).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/leads - Get all leads with optional filtering
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as LeadStatus | null;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const search = searchParams.get('search');

    let query: FirebaseFirestore.Query<any> = leadsCollection(teamId);

    // Status filter
    if (status) {
      query = query.where('status', '==', status);
    }

    // Search by lowercase fields (prefix matching)
    if (search) {
      const searchLower = search.toLowerCase();
      // Firestore can only do prefix matching on one field at a time
      // We'll search businessNameLower and filter further in memory
      query = query
        .where('businessNameLower', '>=', searchLower)
        .where('businessNameLower', '<=', searchLower + '\uf8ff');
    }

    // Sort
    if (!search) {
      // When searching, Firestore already orders by the searched field
      query = query.orderBy(sortBy, sortOrder);
    }

    // Get total count (separate query without pagination)
    const countQuery = status
      ? leadsCollection(teamId).where('status', '==', status)
      : leadsCollection(teamId);
    const countSnapshot = await countQuery.count().get();
    const total = countSnapshot.data().count;

    // Pagination: offset-based using limit/offset for simplicity
    // (Firestore offset is less efficient than cursor-based but maintains API compat)
    query = query.offset((page - 1) * limit).limit(limit);

    const snapshot = await query.get();

    // Build leads with message data
    const leads = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();

        // Get messages for this lead
        const msgSnapshot = await messagesCollection(teamId)
          .where('leadId', '==', doc.id)
          .select('type', 'status')
          .get();

        const messages = msgSnapshot.docs.map((m) => ({
          id: m.id,
          type: m.data().type,
          status: m.data().status,
        }));

        // Serialize to plain JSON (converts Timestamps to ISO strings)
        const serializedData = serializeForJson(data);

        return {
          id: doc.id,
          ...serializedData,
          messages,
          _count: { messages: messages.length },
        };
      })
    );

    return NextResponse.json({
      data: leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}

// POST /api/leads - Create a new lead
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    if (session.user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createLeadSchema.parse(body);

    // Calculate lead score
    const score = calculateLeadScore({
      hasNoWebsite: !validatedData.website,
      hasLowQualityWebsite: !!validatedData.website && (validatedData.websiteQuality || 0) < 50,
      googleRating: validatedData.googleRating || null,
      reviewCount: validatedData.reviewCount || null,
      hasFacebook: !!validatedData.facebookUrl,
      hasPhone: !!validatedData.phone,
      hasEmail: !!validatedData.email,
    });

    const now = new Date();
    const leadData = stripUndefined({
      businessName: validatedData.businessName,
      businessNameLower: validatedData.businessName.toLowerCase(),
      industry: validatedData.industry || null,
      location: validatedData.location,
      locationLower: validatedData.location.toLowerCase(),
      country: 'ZA',
      address: validatedData.address || null,
      phone: validatedData.phone || null,
      email: validatedData.email || null,
      facebookUrl: validatedData.facebookUrl || null,
      instagramUrl: null,
      twitterUrl: null,
      linkedinUrl: null,
      googleMapsUrl: validatedData.googleMapsUrl || null,
      website: validatedData.website || null,
      websiteQuality: validatedData.websiteQuality || null,
      googleRating: validatedData.googleRating || null,
      reviewCount: validatedData.reviewCount || null,
      description: null,
      status: 'NEW' as const,
      source: validatedData.source || 'manual',
      score,
      notes: validatedData.notes || null,
      metadata: null,
      createdById: session.user.id,
      createdAt: now,
      updatedAt: now,
      contactedAt: null,
    });

    const docRef = leadsCollection(teamId).doc();
    await docRef.set(leadData);

    // Serialize to plain JSON for response
    const serializedLead = serializeForJson(leadData);
    const lead = { id: docRef.id, ...serializedLead };

    // Publish real-time event + external notifications
    await events.leadCreated({
      id: docRef.id,
      businessName: leadData.businessName,
      status: leadData.status,
    }, teamId);

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating lead:', error);
    return NextResponse.json(
      { error: 'Failed to create lead' },
      { status: 500 }
    );
  }
}
