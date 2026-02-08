import { auth } from '@/lib/auth';
import { inboundEmailDoc, leadDoc } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateSchema = z.object({
  isRead: z.boolean().optional(),
  leadId: z.string().nullable().optional(),
});

// GET /api/email/inbox/[id] - Get single inbound email with details
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
    const teamId = session.user.teamId;

    const emailDocRef = await inboundEmailDoc(teamId, id).get();

    if (!emailDocRef.exists) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const emailData = emailDocRef.data()!;
    let email = { id: emailDocRef.id, ...emailData };

    // Fetch lead relation if leadId exists
    if (emailData.leadId) {
      try {
        const leadDocRef = await leadDoc(teamId, emailData.leadId).get();
        if (leadDocRef.exists) {
          const leadData = leadDocRef.data()!;
          email = {
            ...email,
            lead: {
              id: leadDocRef.id,
              businessName: leadData.businessName,
              email: leadData.email,
              phone: leadData.phone,
              location: leadData.location,
              status: leadData.status,
            },
          };
        }
      } catch (error) {
        console.error(`Error fetching lead ${emailData.leadId}:`, error);
      }
    }

    // Mark as read
    if (!emailData.isRead) {
      await inboundEmailDoc(teamId, id).update({ isRead: true, updatedAt: new Date() });
      email.isRead = true;
    }

    return NextResponse.json(email);
  } catch (error) {
    console.error('Error fetching email:', error);
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 });
  }
}

// PATCH /api/email/inbox/[id] - Update inbound email (mark read, link to lead)
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
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const teamId = session.user.teamId;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const existingEmailDoc = await inboundEmailDoc(teamId, id).get();

    if (!existingEmailDoc.exists) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    await inboundEmailDoc(teamId, id).update(updateData);

    const updatedDoc = await inboundEmailDoc(teamId, id).get();
    let email = { id: updatedDoc.id, ...updatedDoc.data()! };

    // Fetch lead relation if leadId exists
    if (email.leadId) {
      try {
        const leadDocRef = await leadDoc(teamId, email.leadId).get();
        if (leadDocRef.exists) {
          const leadData = leadDocRef.data()!;
          email = {
            ...email,
            lead: {
              id: leadDocRef.id,
              businessName: leadData.businessName,
              email: leadData.email,
            },
          };
        }
      } catch (error) {
        console.error(`Error fetching lead ${email.leadId}:`, error);
      }
    }

    return NextResponse.json(email);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating email:', error);
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
  }
}

// DELETE /api/email/inbox/[id] - Delete inbound email
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const teamId = session.user.teamId;

    const existingEmailDoc = await inboundEmailDoc(teamId, id).get();

    if (!existingEmailDoc.exists) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    await inboundEmailDoc(teamId, id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting email:', error);
    return NextResponse.json({ error: 'Failed to delete email' }, { status: 500 });
  }
}
