import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { Header } from '@/components/layout/Header';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getStats() {
  const [
    totalLeads,
    leadsByStatus,
    recentLeads,
    pendingMessages,
    weeklyLeads,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.lead.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        status: true,
        location: true,
        createdAt: true,
      },
    }),
    prisma.message.count({
      where: {
        status: {
          in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'],
        },
      },
    }),
    prisma.lead.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const statusCounts = leadsByStatus.reduce(
    (acc, item) => {
      acc[item.status] = item._count;
      return acc;
    },
    {} as Record<string, number>
  );

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
  const stats = await getStats();

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
