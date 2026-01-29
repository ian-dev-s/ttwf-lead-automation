import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LeadStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/stats - Get dashboard statistics
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get total leads
    const totalLeads = await prisma.lead.count();

    // Get leads by status
    const leadsByStatus = await prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    });

    // Convert to record format
    const statusCounts: Record<LeadStatus, number> = {
      NEW: 0,
      QUALIFIED: 0,
      MESSAGE_READY: 0,
      PENDING_APPROVAL: 0,
      CONTACTED: 0,
      RESPONDED: 0,
      CONVERTED: 0,
      NOT_INTERESTED: 0,
      INVALID: 0,
    };

    leadsByStatus.forEach((item) => {
      statusCounts[item.status] = item._count;
    });

    // Get leads created this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const leadsThisWeek = await prisma.lead.count({
      where: {
        createdAt: {
          gte: oneWeekAgo,
        },
      },
    });

    // Calculate conversion rate
    const convertedLeads = statusCounts.CONVERTED;
    const contactedLeads = statusCounts.CONTACTED + statusCounts.RESPONDED + 
                          statusCounts.CONVERTED + statusCounts.NOT_INTERESTED;
    const conversionRate = contactedLeads > 0 
      ? Math.round((convertedLeads / contactedLeads) * 100) 
      : 0;

    // Get recent activity
    const recentLeads = await prisma.lead.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        status: true,
        createdAt: true,
      },
    });

    const recentMessages = await prisma.message.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        lead: {
          select: {
            businessName: true,
          },
        },
      },
    });

    // Get pending messages count
    const pendingMessages = await prisma.message.count({
      where: {
        status: {
          in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'],
        },
      },
    });

    // Get active scraping jobs
    const activeJobs = await prisma.scrapingJob.count({
      where: {
        status: 'RUNNING',
      },
    });

    return NextResponse.json({
      totalLeads,
      newLeads: statusCounts.NEW,
      qualifiedLeads: statusCounts.QUALIFIED,
      contactedLeads,
      convertedLeads,
      leadsThisWeek,
      conversionRate,
      leadsByStatus: statusCounts,
      pendingMessages,
      activeJobs,
      recentLeads,
      recentMessages,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
