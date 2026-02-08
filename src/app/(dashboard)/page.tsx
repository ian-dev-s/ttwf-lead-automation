import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { Header } from '@/components/layout/Header';
import { auth } from '@/lib/auth';
import { leadsCollection, messagesCollection } from '@/lib/firebase/collections';

export const dynamic = 'force-dynamic';

async function getStats(teamId: string) {
  const leadsCol = leadsCollection(teamId);

  // Fetch all leads to compute groupBy-like stats
  const [allLeadsSnap, pendingMsgSnap] = await Promise.all([
    leadsCol.get(),
    messagesCollection(teamId)
      .where('status', 'in', ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'])
      .count()
      .get(),
  ]);

  const totalLeads = allLeadsSnap.size;
  const pendingMessages = pendingMsgSnap.data().count;

  // Group by status
  const statusCounts: Record<string, number> = {};
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let weeklyLeads = 0;

  const recentLeads: any[] = [];

  allLeadsSnap.forEach((doc) => {
    const data = doc.data();
    const status = data.status as string;
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const createdAt = data.createdAt?.toDate ? (data.createdAt as any).toDate() : new Date(data.createdAt as any);
    if (createdAt >= oneWeekAgo) {
      weeklyLeads++;
    }
  });

  // Get 5 most recent leads
  const recentSnap = await leadsCol.orderBy('createdAt', 'desc').limit(5).get();
  recentSnap.forEach((doc) => {
    const data = doc.data();
    recentLeads.push({
      id: doc.id,
      businessName: data.businessName,
      status: data.status,
      location: data.location,
      createdAt: data.createdAt,
    });
  });

  return {
    totalLeads,
    newLeads: statusCounts['NEW'] || 0,
    qualifiedLeads: statusCounts['QUALIFIED'] || 0,
    contactedLeads: (statusCounts['CONTACTED'] || 0) + (statusCounts['RESPONDED'] || 0),
    convertedLeads: statusCounts['CONVERTED'] || 0,
    pendingMessages,
    weeklyLeads,
    recentLeads,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const teamId = session?.user?.teamId || '';
  const stats = teamId ? await getStats(teamId) : {
    totalLeads: 0, newLeads: 0, qualifiedLeads: 0, contactedLeads: 0,
    convertedLeads: 0, pendingMessages: 0, weeklyLeads: 0, recentLeads: [],
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        description={`Welcome back, ${session?.user?.name || 'User'}!`}
      />
      <DashboardStats 
        initialStats={stats} 
        userName={session?.user?.name || 'User'} 
      />
    </div>
  );
}
