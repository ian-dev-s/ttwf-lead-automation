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
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const filter = searchParams.get('filter'); // 'read', 'unread', 'matched', 'unmatched'

    // Build query - apply where first, then orderBy
    let query: FirebaseFirestore.Query<any> = inboundEmailsCollection(teamId);

    if (filter === 'read') {
      query = query.where('isRead', '==', true);
    } else if (filter === 'unread') {
      query = query.where('isRead', '==', false);
    } else if (filter === 'matched') {
      query = query.where('leadId', '!=', null);
    } else if (filter === 'unmatched') {
      query = query.where('leadId', '==', null);
    }

    query = query.orderBy('receivedAt', 'desc');

    const snapshot = await query.get();
    const allEmails = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Apply pagination manually (Firestore doesn't support offset efficiently)
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const emails = allEmails.slice(startIndex, endIndex);

    // Fetch lead relations for emails that have leadId
    const emailsWithLeads = await Promise.all(
      emails.map(async (email) => {
        if (email.leadId) {
          try {
            const leadDocRef = await leadDoc(teamId, email.leadId).get();
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
            console.error(`Error fetching lead ${email.leadId}:`, error);
          }
        }
        return email;
      })
    );

    return NextResponse.json({
      emails: emailsWithLeads,
      pagination: {
        page,
        limit,
        total: allEmails.length,
        totalPages: Math.ceil(allEmails.length / limit),
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
