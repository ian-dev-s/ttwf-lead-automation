import { auth } from '@/lib/auth';
import { adminDb } from '@/lib/firebase/admin';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/migrate/outreach-type
 * 
 * Admin-only migration endpoint that backfills the `outreachType` field
 * on all existing leads across all teams.
 * 
 * Logic:
 * - Has email -> outreachType: 'EMAIL'
 * - Has whatsappNumber in metadata -> outreachType: 'WHATSAPP'
 * - Otherwise -> outreachType: 'COLD_CALL'
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can run migrations' },
        { status: 403 }
      );
    }

    // Query all leads across all teams using collectionGroup
    const snapshot = await adminDb.collectionGroup('leads').get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        message: 'No leads found to migrate',
        total: 0,
        email: 0,
        coldCall: 0,
        whatsapp: 0,
      });
    }

    const counts = { total: 0, email: 0, coldCall: 0, whatsapp: 0, skipped: 0 };
    const BATCH_SIZE = 500;
    let batch = adminDb.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Skip if already has outreachType set
      if (data.outreachType) {
        counts.skipped++;
        continue;
      }

      // Determine outreach type
      let outreachType: 'EMAIL' | 'WHATSAPP' | 'COLD_CALL';

      if (data.email) {
        outreachType = 'EMAIL';
        counts.email++;
      } else if (data.metadata?.whatsappNumber) {
        outreachType = 'WHATSAPP';
        counts.whatsapp++;
      } else {
        outreachType = 'COLD_CALL';
        counts.coldCall++;
      }

      batch.update(doc.ref, { outreachType });
      batchCount++;
      counts.total++;

      // Commit batch when it reaches the limit
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    }

    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Migration complete. Updated ${counts.total} leads (${counts.skipped} already had outreachType).`,
      ...counts,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
