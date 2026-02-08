import { auth } from '@/lib/auth';
import { inboundEmailsCollection, leadDoc } from '@/lib/firebase/collections';
import { isImapConfigured } from '@/lib/email/config';
import { fetchNewEmails } from '@/lib/email/imap';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/email/inbox - List inbound emails with pagination and filters
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const filter = searchParams.get('filter'); // 'pending', 'approved', 'rejected', 'read', 'unread', 'matched', 'unmatched'

    // Fetch all emails once for counts (ordered by receivedAt desc)
    const allSnapshot = await inboundEmailsCollection(teamId)
      .orderBy('receivedAt', 'desc')
      .get();

    const allEmailsRaw = allSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Compute status counts
    const counts = { all: allEmailsRaw.length, pending: 0, approved: 0, rejected: 0 };
    for (const e of allEmailsRaw) {
      const status = (e as any).status || 'pending';
      if (status === 'pending') counts.pending++;
      else if (status === 'approved') counts.approved++;
      else if (status === 'rejected') counts.rejected++;
    }

    // Apply filter
    let filteredEmails = allEmailsRaw;
    if (filter === 'pending') {
      filteredEmails = allEmailsRaw.filter((e: any) => (e.status || 'pending') === 'pending');
    } else if (filter === 'approved') {
      filteredEmails = allEmailsRaw.filter((e: any) => e.status === 'approved');
    } else if (filter === 'rejected') {
      filteredEmails = allEmailsRaw.filter((e: any) => e.status === 'rejected');
    } else if (filter === 'read') {
      filteredEmails = allEmailsRaw.filter((e: any) => e.isRead === true);
    } else if (filter === 'unread') {
      filteredEmails = allEmailsRaw.filter((e: any) => e.isRead === false);
    } else if (filter === 'matched') {
      filteredEmails = allEmailsRaw.filter((e: any) => e.leadId != null);
    } else if (filter === 'unmatched') {
      filteredEmails = allEmailsRaw.filter((e: any) => e.leadId == null);
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const emails = filteredEmails.slice(startIndex, endIndex);

    // Fetch lead relations for emails that have leadId
    const emailsWithLeads = await Promise.all(
      emails.map(async (email) => {
        if ((email as any).leadId) {
          try {
            const leadDocRef = await leadDoc(teamId, (email as any).leadId).get();
            if (leadDocRef.exists) {
              const leadData = leadDocRef.data()!;
              return {
                ...email,
                lead: {
                  id: leadDocRef.id,
                  businessName: leadData.businessName,
                  email: leadData.email,
                },
              };
            }
          } catch (error) {
            console.error(`Error fetching lead ${(email as any).leadId}:`, error);
          }
        }
        return email;
      })
    );

    return NextResponse.json({
      emails: emailsWithLeads,
      counts,
      pagination: {
        page,
        limit,
        total: filteredEmails.length,
        totalPages: Math.ceil(filteredEmails.length / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    return NextResponse.json({ error: 'Failed to fetch inbox' }, { status: 500 });
  }
}

// POST /api/email/inbox - Trigger manual IMAP fetch
export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const teamId = session.user.teamId;

    if (!(await isImapConfigured(teamId))) {
      return NextResponse.json(
        { error: 'IMAP is not configured. Go to Settings > Email to configure your IMAP server.' },
        { status: 400 }
      );
    }

    const result = await fetchNewEmails(teamId);

    return NextResponse.json({
      success: true,
      fetched: result.fetched,
      matched: result.matched,
      errors: result.errors,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching new emails:', error);
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
