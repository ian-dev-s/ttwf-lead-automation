import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/contacts - List all contacts
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const favoritesOnly = searchParams.get('favorites') === 'true';

    const contacts = await prisma.contact.findMany({
      where: {
        AND: [
          { teamId },
          search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {},
          favoritesOnly ? { isFavorite: true } : {},
        ],
      },
      orderBy: [
        { isFavorite: 'desc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}

// POST /api/contacts - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, phone, telegramId, notes, isFavorite } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // At least one contact method is required
    if (!email && !phone && !telegramId) {
      return NextResponse.json(
        { error: 'At least one contact method (email, phone, or Telegram) is required' },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.create({
      data: {
        teamId: session.user.teamId,
        name,
        email: email || null,
        phone: phone || null,
        telegramId: telegramId || null,
        notes: notes || null,
        isFavorite: isFavorite || false,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    );
  }
}
