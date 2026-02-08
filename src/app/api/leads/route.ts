import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { events } from '@/lib/events';
import { calculateLeadScore } from '@/lib/utils';
import { LeadStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const search = searchParams.get('search');

    // Build where clause
    const where: any = {
      teamId,
    };
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.lead.count({ where });

    // Get leads with message count and types
    const leads = await prisma.lead.findMany({
      where,
      include: {
        messages: {
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

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

    // Check permissions
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

    const lead = await prisma.lead.create({
      data: {
        ...validatedData,
        email: validatedData.email || null,
        facebookUrl: validatedData.facebookUrl || null,
        googleMapsUrl: validatedData.googleMapsUrl || null,
        website: validatedData.website || null,
        score,
        source: validatedData.source || 'manual',
        teamId,
        createdById: session.user.id,
      },
    });

    // Publish real-time event
    await events.leadCreated({
      id: lead.id,
      businessName: lead.businessName,
      status: lead.status,
    });

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
