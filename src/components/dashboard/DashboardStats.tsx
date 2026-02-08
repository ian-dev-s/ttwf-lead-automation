'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useStatsRealtime } from '@/hooks/use-realtime';
import { formatDate, leadStatusLabels } from '@/lib/utils';
import { LeadStatus } from '@/types';
import {
  Calendar,
  MessageSquare,
  RefreshCw,
  Send,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  contactedLeads: number;
  convertedLeads: number;
  pendingMessages: number;
  weeklyLeads: number;
  recentLeads: {
    id: string;
    businessName: string;
    status: LeadStatus;
    location: string;
    createdAt: Date;
  }[];
}

interface DashboardStatsProps {
  initialStats: DashboardStats;
  userName: string;
}

export function DashboardStats({ initialStats, userName: _userName }: DashboardStatsProps) {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasMounted = useRef(false);

  // Fetch updated stats from the server
  const refreshStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        startTransition(() => {
          setStats(data);
          setLastUpdated(new Date());
        });
      }
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    }
  }, []);

  // Set up real-time updates
  const { isConnected } = useStatsRealtime(refreshStats);

  // Refresh on mount to ensure fresh data (only once)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      refreshStats();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const conversionRate =
    stats.contactedLeads > 0
      ? Math.round((stats.convertedLeads / stats.contactedLeads) * 100)
      : 0;

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Connection Status Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              <span>Offline</span>
            </>
          )}
          {lastUpdated && (
            <span className="text-xs">
              • {formatDate(lastUpdated)}
            </span>
          )}
        </div>
        <button
          onClick={refreshStats}
          disabled={isPending}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

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
  );
}
