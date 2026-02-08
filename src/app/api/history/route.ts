import { auth } from '@/lib/auth';
import { analyzedBusinessesCollection } from '@/lib/firebase/collections';
import { adminDb } from '@/lib/firebase/admin';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/history - Get analyzed businesses history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const filter = searchParams.get('filter') || 'all'; // 'all', 'prospects', 'skipped', 'converted'

    const skip = (page - 1) * limit;

    // Build query based on filters
    let query: FirebaseFirestore.Query<any> = analyzedBusinessesCollection(teamId);

    if (filter === 'prospects') {
      query = query.where('isGoodProspect', '==', true).where('wasConverted', '==', false);
    } else if (filter === 'skipped') {
      query = query.where('isGoodProspect', '==', false);
    } else if (filter === 'converted') {
      query = query.where('wasConverted', '==', true);
    }

    // Get total count for pagination
    const countSnapshot = await query.count().get();
    const totalCount = countSnapshot.data().count;

    // Apply pagination and ordering
    query = query.orderBy('analyzedAt', 'desc').offset(skip).limit(limit);

    const snapshot = await query.get();
    const businesses = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get statistics by fetching all docs and reducing in memory
    const allBusinessesSnapshot = await analyzedBusinessesCollection(teamId).get();
    let total = 0;
    let prospects = 0;
    let skipped = 0;
    let converted = 0;

    allBusinessesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      total++;
      if (data.isGoodProspect && !data.wasConverted) {
        prospects++;
      }
      if (!data.isGoodProspect) {
        skipped++;
      }
      if (data.wasConverted) {
        converted++;
      }
    });

    const statistics = {
      total,
      prospects,
      skipped,
      converted,
    };

    return NextResponse.json({
      businesses,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      statistics,
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

// DELETE /api/history - Clear all history
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const olderThan = searchParams.get('olderThan'); // Days

    let query: FirebaseFirestore.Query<any> = analyzedBusinessesCollection(teamId);

    if (olderThan) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(olderThan));
      query = query.where('analyzedAt', '<', daysAgo);
    }

    // Firestore doesn't have deleteMany, so we need to fetch and delete in batches
    const snapshot = await query.get();
    let deletedCount = 0;

    // Process in batches of 500 (Firestore batch limit)
    const batchSize = 500;
    const docs = snapshot.docs;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = adminDb.batch();
      const batchDocs = docs.slice(i, i + batchSize);
      
      batchDocs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    return NextResponse.json(
      { error: 'Failed to clear history' },
      { status: 500 }
    );
  }
}
