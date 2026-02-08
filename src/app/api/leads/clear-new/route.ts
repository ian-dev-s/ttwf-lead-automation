import { auth } from '@/lib/auth';
import { leadsCollection, messagesCollection, statusHistoryCollection } from '@/lib/firebase/collections';
import { adminDb } from '@/lib/firebase/admin';
import { NextResponse } from 'next/server';

// DELETE /api/leads/clear-new - Delete all leads with NEW status
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can clear leads' },
        { status: 403 }
      );
    }

    // Find all NEW leads
    const newLeadsSnap = await leadsCollection(teamId)
      .where('status', '==', 'NEW')
      .get();

    if (newLeadsSnap.empty) {
      return NextResponse.json({
        success: true,
        message: 'No leads with NEW status to delete',
        deletedCount: 0,
      });
    }

    const leadIds = newLeadsSnap.docs.map((d) => d.id);

    // Delete in batches (Firestore batch limit is 500)
    const batchSize = 400;
    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = adminDb.batch();
      const batchLeadIds = leadIds.slice(i, i + batchSize);

      for (const leadId of batchLeadIds) {
        // Delete messages for this lead
        const msgSnap = await messagesCollection(teamId)
          .where('leadId', '==', leadId)
          .get();
        msgSnap.docs.forEach((d) => batch.delete(d.ref));

        // Delete status history for this lead
        const histSnap = await statusHistoryCollection(teamId)
          .where('leadId', '==', leadId)
          .get();
        histSnap.docs.forEach((d) => batch.delete(d.ref));

        // Delete the lead
        batch.delete(leadsCollection(teamId).doc(leadId));
      }

      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${leadIds.length} leads with NEW status`,
      deletedCount: leadIds.length,
    });
  } catch (error) {
    console.error('Error clearing NEW leads:', error);
    return NextResponse.json(
      { error: 'Failed to clear leads' },
      { status: 500 }
    );
  }
}

// GET /api/leads/clear-new - Get count of NEW leads
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const countSnap = await leadsCollection(teamId)
      .where('status', '==', 'NEW')
      .count()
      .get();

    return NextResponse.json({ count: countSnap.data().count });
  } catch (error) {
    console.error('Error counting NEW leads:', error);
    return NextResponse.json(
      { error: 'Failed to count leads' },
      { status: 500 }
    );
  }
}
