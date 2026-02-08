import { auth } from '@/lib/auth';
import { leadsCollection, messagesCollection } from '@/lib/firebase/collections';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/stats - Get dashboard statistics
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    // Get total leads count
    const totalLeadsSnapshot = await leadsCollection(teamId).count().get();
    const totalLeads = totalLeadsSnapshot.data().count;

    // Get all leads to calculate status counts (groupBy equivalent)
    const allLeadsSnapshot = await leadsCollection(teamId).get();
    const statusCounts: Record<string, number> = {};
    
    allLeadsSnapshot.docs.forEach((doc) => {
      const status = doc.data().status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Get recent leads (last 5)
    const recentLeadsSnapshot = await leadsCollection(teamId)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    const recentLeads = recentLeadsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        businessName: data.businessName,
        status: data.status,
        location: data.location,
        createdAt: data.createdAt,
      };
    });

    // Count pending messages
    const pendingMessagesSnapshot = await messagesCollection(teamId)
      .where('status', 'in', ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'])
      .count()
      .get();
    const pendingMessages = pendingMessagesSnapshot.data().count;

    // Count weekly leads (created in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyLeadsSnapshot = await leadsCollection(teamId)
      .where('createdAt', '>=', sevenDaysAgo)
      .count()
      .get();
    const weeklyLeads = weeklyLeadsSnapshot.data().count;

    return NextResponse.json({
      totalLeads,
      newLeads: statusCounts['NEW'] || 0,
      qualifiedLeads: statusCounts['QUALIFIED'] || 0,
      contactedLeads: (statusCounts['CONTACTED'] || 0) + (statusCounts['RESPONDED'] || 0),
      convertedLeads: statusCounts['CONVERTED'] || 0,
      pendingMessages,
      weeklyLeads,
      recentLeads,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
