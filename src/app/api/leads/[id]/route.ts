import { auth } from '@/lib/auth';
import { leadDoc, messagesCollection, statusHistoryCollection, stripUndefined, serializeDoc } from '@/lib/firebase/collections';
import { events } from '@/lib/events';
import { calculateLeadScore, determineOutreachType } from '@/lib/utils';
import { LeadStatus } from '@/types';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const LEAD_STATUS_VALUES = Object.values(LeadStatus) as [string, ...string[]];

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
  status: z.enum(LEAD_STATUS_VALUES).optional(),
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

    const leadSnap = await leadDoc(teamId, id).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const leadData = leadSnap.data()!;

    // Get messages
    const msgSnapshot = await messagesCollection(teamId)
      .where('leadId', '==', id)
      .orderBy('createdAt', 'desc')
      .get();
    const messages = msgSnapshot.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));

    // Get status history
    const histSnapshot = await statusHistoryCollection(teamId)
      .where('leadId', '==', id)
      .orderBy('changedAt', 'desc')
      .get();
    const statusHistory = histSnapshot.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));

    return NextResponse.json(serializeDoc({
      id,
      ...leadData,
      messages,
      statusHistory,
    }));
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

    // Get current lead
    const leadSnap = await leadDoc(teamId, id).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const currentLead = { id, ...leadSnap.data()! };

    // Build update data
    const updateData: Record<string, unknown> = { ...validatedData, updatedAt: new Date() };

    // Handle nullable fields
    if ('email' in body) updateData.email = validatedData.email || null;
    if ('facebookUrl' in body) updateData.facebookUrl = validatedData.facebookUrl || null;
    if ('googleMapsUrl' in body) updateData.googleMapsUrl = validatedData.googleMapsUrl || null;
    if ('website' in body) updateData.website = validatedData.website || null;
    if ('phone' in body) updateData.phone = validatedData.phone || null;

    // Update lowercase search fields
    if (validatedData.businessName) {
      updateData.businessNameLower = validatedData.businessName.toLowerCase();
    }
    if (validatedData.location) {
      updateData.locationLower = validatedData.location.toLowerCase();
    }

    // Recalculate score if relevant fields changed
    if (
      'website' in body || 'websiteQuality' in body || 'googleRating' in body ||
      'reviewCount' in body || 'phone' in body || 'email' in body || 'facebookUrl' in body
    ) {
      const newWebsite = 'website' in body ? updateData.website : currentLead.website;
      const newWebsiteQuality = 'websiteQuality' in body ? updateData.websiteQuality : currentLead.websiteQuality;
      const newPhone = 'phone' in body ? updateData.phone : currentLead.phone;
      const newEmail = 'email' in body ? updateData.email : currentLead.email;
      const newFacebookUrl = 'facebookUrl' in body ? updateData.facebookUrl : currentLead.facebookUrl;
      const newGoogleRating = 'googleRating' in body ? updateData.googleRating : currentLead.googleRating;
      const newReviewCount = 'reviewCount' in body ? updateData.reviewCount : currentLead.reviewCount;

      updateData.score = calculateLeadScore({
        hasNoWebsite: !newWebsite,
        hasLowQualityWebsite: !!newWebsite && ((newWebsiteQuality as number) || 0) < 50,
        googleRating: newGoogleRating as number | null,
        reviewCount: newReviewCount as number | null,
        hasFacebook: !!newFacebookUrl,
        hasPhone: !!newPhone,
        hasEmail: !!newEmail,
      });

      // Recalculate outreach type when contact info changes
      if ('email' in body || 'phone' in body) {
        updateData.outreachType = determineOutreachType({
          email: newEmail as string | null,
          phone: newPhone as string | null,
          metadata: currentLead.metadata as Record<string, unknown> | null,
        });
      }
    }

    // Track status change
    if (validatedData.status && validatedData.status !== currentLead.status) {
      // Validate: must have a message before changing from NEW
      const msgSnapshot = await messagesCollection(teamId)
        .where('leadId', '==', id)
        .limit(1)
        .get();
      const hasMessages = !msgSnapshot.empty;

      if (!hasMessages && validatedData.status !== 'NEW' && validatedData.status !== 'REJECTED' && validatedData.status !== 'INVALID') {
        return NextResponse.json(
          { error: 'A lead must have at least one message before changing status from NEW' },
          { status: 400 }
        );
      }

      // Validate: must have EMAIL message to be QUALIFIED
      if (validatedData.status === 'QUALIFIED') {
        const emailMsgSnapshot = await messagesCollection(teamId)
          .where('leadId', '==', id)
          .where('type', '==', 'EMAIL')
          .limit(1)
          .get();
        if (emailMsgSnapshot.empty) {
          return NextResponse.json(
            { error: 'A lead must have an email message to be qualified' },
            { status: 400 }
          );
        }
      }

      // Create status history entry
      await statusHistoryCollection(teamId).add({
        leadId: id,
        fromStatus: currentLead.status,
        toStatus: validatedData.status,
        changedById: session.user.id,
        changedAt: new Date(),
        notes: null,
      });

      if (validatedData.status === 'CONTACTED') {
        updateData.contactedAt = new Date();
      }
    }

    // Update the lead
    await leadDoc(teamId, id).update(stripUndefined(updateData as any));

    // Fetch updated lead with messages
    const updatedSnap = await leadDoc(teamId, id).get();
    const updatedData = updatedSnap.data()!;
    const msgSnap2 = await messagesCollection(teamId)
      .where('leadId', '==', id)
      .get();
    const messages = msgSnap2.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));

    const lead = serializeDoc({ id, ...updatedData, messages });

    // Publish events + external notifications
    if (validatedData.status && validatedData.status !== currentLead.status) {
      await events.leadStatusChanged({
        id: lead.id,
        businessName: lead.businessName as string,
        status: lead.status as string,
        previousStatus: currentLead.status,
      }, teamId);
    } else {
      await events.leadUpdated({
        id: lead.id,
        businessName: lead.businessName as string,
        status: lead.status as string,
      }, teamId);
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

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can delete leads' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const leadSnap = await leadDoc(teamId, id).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await leadDoc(teamId, id).delete();

    await events.leadDeleted(id, teamId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return NextResponse.json(
      { error: 'Failed to delete lead' },
      { status: 500 }
    );
  }
}
