import { auth } from '@/lib/auth';
import { contactsCollection, stripUndefined } from '@/lib/firebase/collections';
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
    const favoritesOnly = searchParams.get('favorites') === 'true';

    let query: FirebaseFirestore.Query<any> = contactsCollection(teamId);

    // Apply favorites filter if requested
    if (favoritesOnly) {
      query = query.where('isFavorite', '==', true);
    }

    // Order by name (Firestore doesn't support composite ordering with boolean fields easily)
    query = query.orderBy('name', 'asc');

    const snapshot = await query.get();
    const contacts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort favorites first if not filtering by favorites only
    if (!favoritesOnly) {
      contacts.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
      });
    }

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

    const teamId = session.user.teamId;
    const now = new Date();

    const contactData = stripUndefined({
      name,
      email: email || null,
      phone: phone || null,
      telegramId: telegramId || null,
      notes: notes || null,
      isFavorite: isFavorite || false,
      createdById: session.user.id,
      createdAt: now,
      updatedAt: now,
    });

    const docRef = contactsCollection(teamId).doc();
    await docRef.set(contactData);

    const contact = { id: docRef.id, ...contactData };

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    );
  }
}
