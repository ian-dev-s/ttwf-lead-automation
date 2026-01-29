import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDate, leadStatusLabels } from '@/lib/utils';
import {
    Calendar,
    MessageSquare,
    Send,
    Target,
    TrendingUp,
    UserCheck,
    Users,
} from 'lucide-react';
import Link from 'next/link';

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

  const conversionRate =
    stats.contactedLeads > 0
      ? Math.round((stats.convertedLeads / stats.contactedLeads) * 100)
      : 0;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        description={`Welcome back, ${session?.user?.name || 'User'}!`}
      />

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Leads
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLeads}</div>
              <p className="text-xs text-muted-foreground">
                +{stats.weeklyLeads} this week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                New Leads
              </CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.newLeads}</div>
              <p className="text-xs text-muted-foreground">
                Ready to qualify
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Messages
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingMessages}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting approval
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Conversion Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{conversionRate}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.convertedLeads} of {stats.contactedLeads} contacted
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Leads */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Leads</CardTitle>
              <CardDescription>
                Latest businesses added to your pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recentLeads.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium">{lead.businessName}</p>
                        <p className="text-sm text-muted-foreground">
                          {lead.location}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary">
                          {leadStatusLabels[lead.status]}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(lead.createdAt)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No leads yet. Start by running the scraper or adding leads manually.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks to manage your leads</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href="/leads"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">View Kanban Board</p>
                  <p className="text-sm text-muted-foreground">
                    Manage leads through your pipeline
                  </p>
                </div>
              </Link>

              <Link
                href="/messages"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Send className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Review Messages</p>
                  <p className="text-sm text-muted-foreground">
                    Approve and send outreach messages
                  </p>
                </div>
              </Link>

              <Link
                href="/scraper"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Run Lead Scraper</p>
                  <p className="text-sm text-muted-foreground">
                    Find new businesses to contact
                  </p>
                </div>
              </Link>

              <Link
                href="/settings"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="p-2 bg-primary/10 rounded-lg">
                  <UserCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Configure AI Settings</p>
                  <p className="text-sm text-muted-foreground">
                    Adjust AI and scraping parameters
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
