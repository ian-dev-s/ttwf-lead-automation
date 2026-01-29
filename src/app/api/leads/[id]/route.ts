import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calculateLeadScore } from '@/lib/utils';
import { LeadStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for updating a lead
const updateLeadSchema = z.object({
  businessName: z.string().min(1).optional(),
  industry: z.string().optional(),
  location: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  facebookUrl: z.string().url().optional().or(z.literal('')),
  googleMapsUrl: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  websiteQuality: z.number().min(0).max(100).optional(),
  googleRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().min(0).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  notes: z.string().optional(),
});

// GET /api/leads/[id] - Get a single lead
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: {
            changedBy: {
              select: { name: true, email: true },
            },
          },
        },
        createdBy: {
          select: { name: true, email: true },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lead' },
      { status: 500 }
    );
  }
}

// PATCH /api/leads/[id] - Update a lead
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateLeadSchema.parse(body);

    // Get current lead for status tracking
    const currentLead = await prisma.lead.findUnique({
      where: { id },
    });

    if (!currentLead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {
      ...validatedData,
      email: validatedData.email || null,
      facebookUrl: validatedData.facebookUrl || null,
      googleMapsUrl: validatedData.googleMapsUrl || null,
      website: validatedData.website || null,
    };

    // Recalculate score if relevant fields changed
    if (
      validatedData.website !== undefined ||
      validatedData.websiteQuality !== undefined ||
      validatedData.googleRating !== undefined ||
      validatedData.reviewCount !== undefined ||
      validatedData.phone !== undefined ||
      validatedData.email !== undefined ||
      validatedData.facebookUrl !== undefined
    ) {
      updateData.score = calculateLeadScore({
        hasNoWebsite: !updateData.website && !currentLead.website,
        hasLowQualityWebsite:
          (updateData.website || currentLead.website) &&
          (updateData.websiteQuality || currentLead.websiteQuality || 0) < 50,
        googleRating: updateData.googleRating ?? currentLead.googleRating,
        reviewCount: updateData.reviewCount ?? currentLead.reviewCount,
        hasFacebook: !!(updateData.facebookUrl || currentLead.facebookUrl),
        hasPhone: !!(updateData.phone || currentLead.phone),
        hasEmail: !!(updateData.email || currentLead.email),
      });
    }

    // Track status change
    if (validatedData.status && validatedData.status !== currentLead.status) {
      await prisma.statusHistory.create({
        data: {
          leadId: id,
          fromStatus: currentLead.status,
          toStatus: validatedData.status,
          changedById: session.user.id,
        },
      });

      // Update contacted timestamp if moving to CONTACTED
      if (validatedData.status === 'CONTACTED') {
        updateData.contactedAt = new Date();
      }
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        messages: true,
      },
    });

    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating lead:', error);
    return NextResponse.json(
      { error: 'Failed to update lead' },
      { status: 500 }
    );
  }
}

// DELETE /api/leads/[id] - Delete a lead
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can delete leads' },
        { status: 403 }
      );
    }

    const { id } = await params;

    await prisma.lead.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return NextResponse.json(
      { error: 'Failed to delete lead' },
      { status: 500 }
    );
  }
}
