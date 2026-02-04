import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/stats - Get dashboard statistics
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
