import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

    const where: Record<string, unknown> = { teamId };
    
    if (filter === 'read') where.isRead = true;
    if (filter === 'unread') where.isRead = false;
    if (filter === 'matched') where.leadId = { not: null };
    if (filter === 'unmatched') where.leadId = null;

    const [emails, total] = await Promise.all([
      prisma.inboundEmail.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true,
              businessName: true,
              email: true,
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inboundEmail.count({ where }),
    ]);

    return NextResponse.json({
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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
