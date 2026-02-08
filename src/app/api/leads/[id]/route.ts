import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { events } from '@/lib/events';
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

    const teamId = session.user.teamId;

    const { id } = await params;

    const lead = await prisma.lead.findFirst({
      where: { id, teamId },
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

    const teamId = session.user.teamId;

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
    const currentLead = await prisma.lead.findFirst({
      where: { id, teamId },
    });

    if (!currentLead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Prepare update data - only include fields that were explicitly provided
    const updateData: any = { ...validatedData };
    
    // Only set these fields to null if they were explicitly provided as empty strings
    // (not if they were simply not included in the request)
    if ('email' in body) {
      updateData.email = validatedData.email || null;
    }
    if ('facebookUrl' in body) {
      updateData.facebookUrl = validatedData.facebookUrl || null;
    }
    if ('googleMapsUrl' in body) {
      updateData.googleMapsUrl = validatedData.googleMapsUrl || null;
    }
    if ('website' in body) {
      updateData.website = validatedData.website || null;
    }
    if ('phone' in body) {
      updateData.phone = validatedData.phone || null;
    }

    // Recalculate score if relevant fields changed
    if (
      'website' in body ||
      'websiteQuality' in body ||
      'googleRating' in body ||
      'reviewCount' in body ||
      'phone' in body ||
      'email' in body ||
      'facebookUrl' in body
    ) {
      // Use the new value if provided, otherwise fall back to current lead value
      const newWebsite = 'website' in body ? updateData.website : currentLead.website;
      const newWebsiteQuality = 'websiteQuality' in body ? updateData.websiteQuality : currentLead.websiteQuality;
      const newPhone = 'phone' in body ? updateData.phone : currentLead.phone;
      const newEmail = 'email' in body ? updateData.email : currentLead.email;
      const newFacebookUrl = 'facebookUrl' in body ? updateData.facebookUrl : currentLead.facebookUrl;
      const newGoogleRating = 'googleRating' in body ? updateData.googleRating : currentLead.googleRating;
      const newReviewCount = 'reviewCount' in body ? updateData.reviewCount : currentLead.reviewCount;

      updateData.score = calculateLeadScore({
        hasNoWebsite: !newWebsite,
        hasLowQualityWebsite: !!newWebsite && (newWebsiteQuality || 0) < 50,
        googleRating: newGoogleRating,
        reviewCount: newReviewCount,
        hasFacebook: !!newFacebookUrl,
        hasPhone: !!newPhone,
        hasEmail: !!newEmail,
      });
    }

    // Track status change
    if (validatedData.status && validatedData.status !== currentLead.status) {
      // Get messages to validate status change
      const messages = await prisma.message.findMany({
        where: { leadId: id, teamId },
      });

      const hasMessages = messages.length > 0;
      const hasEmailMessage = messages.some(m => m.type === 'EMAIL');

      // VALIDATION: A lead cannot have any status other than NEW without a message
      if (!hasMessages && validatedData.status !== 'NEW' && validatedData.status !== 'REJECTED' && validatedData.status !== 'INVALID') {
        return NextResponse.json(
          { error: 'A lead must have at least one message before changing status from NEW' },
          { status: 400 }
        );
      }

      // VALIDATION: A lead must have an EMAIL message to be QUALIFIED
      if (validatedData.status === 'QUALIFIED' && !hasEmailMessage) {
        return NextResponse.json(
          { error: 'A lead must have an email message to be qualified' },
          { status: 400 }
        );
      }

      await prisma.statusHistory.create({
        data: {
          leadId: id,
          fromStatus: currentLead.status,
          toStatus: validatedData.status,
          changedById: session.user.id,
          teamId,
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

    // Publish real-time event
    if (validatedData.status && validatedData.status !== currentLead.status) {
      await events.leadStatusChanged({
        id: lead.id,
        businessName: lead.businessName,
        status: lead.status,
        previousStatus: currentLead.status,
      });
    } else {
      await events.leadUpdated({
        id: lead.id,
        businessName: lead.businessName,
        status: lead.status,
      });
    }

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

    const teamId = session.user.teamId;

    // Only admins can delete
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can delete leads' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify the lead belongs to the team before deleting
    const lead = await prisma.lead.findFirst({
      where: { id, teamId },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await prisma.lead.delete({
      where: { id },
    });

    // Publish real-time event
    await events.leadDeleted(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return NextResponse.json(
      { error: 'Failed to delete lead' },
      { status: 500 }
    );
  }
}
