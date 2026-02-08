'use client';

import { useLeadsRealtime } from '@/hooks/use-realtime';
import { kanbanColumnOrder, leadStatusLabels, outreachTypeLabels, determineOutreachType } from '@/lib/utils';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { Lead, LeadStatus, OutreachType } from '@/types';
import { AlertCircle, Mail, MessageCircle, Phone, RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { KanbanColumn } from './Column';

interface LeadMessage {
  id: string;
  type: 'EMAIL' | 'WHATSAPP';
  status: string;
}

interface LeadWithMessages extends Lead {
  messages?: LeadMessage[];
  _count?: {
    messages: number;
  };
}

interface KanbanBoardProps {
  initialLeads: LeadWithMessages[];
}

const outreachFilterOptions: Array<{ value: OutreachType | 'ALL'; label: string; icon: typeof Mail }> = [
  { value: 'ALL', label: 'All', icon: RefreshCw },
  { value: 'EMAIL', label: 'Email Ready', icon: Mail },
  { value: 'COLD_CALL', label: 'Cold Call', icon: Phone },
  { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle },
];

export function KanbanBoard({ initialLeads }: KanbanBoardProps) {
  const [leads, setLeads] = useState<LeadWithMessages[]>(initialLeads);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outreachFilter, setOutreachFilter] = useState<OutreachType | 'ALL'>('ALL');
  
  // Skip next refresh if we just made a local change
  const [skipNextRefresh, setSkipNextRefresh] = useState(false);

  // Compute outreach type counts for filter tabs
  const outreachCounts = useMemo(() => {
    const counts: Record<OutreachType | 'ALL', number> = { ALL: leads.length, EMAIL: 0, COLD_CALL: 0, WHATSAPP: 0 };
    for (const lead of leads) {
      const ot = lead.outreachType || determineOutreachType(lead);
      counts[ot] = (counts[ot] || 0) + 1;
    }
    return counts;
  }, [leads]);

  // Filter leads by outreach type
  const filteredLeads = useMemo(() => {
    if (outreachFilter === 'ALL') return leads;
    return leads.filter((lead) => {
      const ot = lead.outreachType || determineOutreachType(lead);
      return ot === outreachFilter;
    });
  }, [leads, outreachFilter]);

  // Fetch leads from the server
  const refreshLeads = useCallback(async () => {
    // Skip refresh if we just made a local change (to avoid flicker)
    if (skipNextRefresh) {
      setSkipNextRefresh(false);
      return;
    }
    
    try {
      const response = await fetch('/api/leads?limit=500');
      if (response.ok) {
        const data = await response.json();
        startTransition(() => {
          setLeads(data.data);
          setLastUpdated(new Date());
        });
      }
    } catch (error) {
      console.error('Failed to refresh leads:', error);
    }
  }, [skipNextRefresh]);

  // Set up real-time updates
  const { isConnected } = useLeadsRealtime(refreshLeads);

  // Group leads by status and sort alphabetically by business name
  const leadsByStatus = kanbanColumnOrder.reduce((acc, status) => {
    acc[status] = filteredLeads
      .filter((lead) => lead.status === status)
      .sort((a, b) => a.businessName.localeCompare(b.businessName));
    return acc;
  }, {} as Record<LeadStatus, LeadWithMessages[]>);

  // Handle drag and drop
  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { destination, source, draggableId } = result;

      // Dropped outside a droppable area
      if (!destination) return;

      // Dropped in the same position
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      ) {
        return;
      }

      const newStatus = destination.droppableId as LeadStatus;
      const leadId = draggableId;

      // Skip next refresh since we're making a local change
      setSkipNextRefresh(true);

      // Optimistically update UI
      setLeads((prevLeads) =>
        prevLeads.map((lead) =>
          lead.id === leadId ? { ...lead, status: newStatus } : lead
        )
      );

      // Update on server
      setIsUpdating(true);
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/leads/${leadId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update status');
        }

        // Don't call router.refresh() - real-time updates will handle it
      } catch (error) {
        console.error('Error updating lead status:', error);
        // Show error message to user
        setErrorMessage(error instanceof Error ? error.message : 'Failed to update status');
        // Revert on error and clear skip flag
        setSkipNextRefresh(false);
        setLeads((prevLeads) =>
          prevLeads.map((lead) =>
            lead.id === leadId
              ? { ...lead, status: source.droppableId as LeadStatus }
              : lead
          )
        );
        // Auto-clear error after 5 seconds
        setTimeout(() => setErrorMessage(null), 5000);
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  // Refresh leads when initialLeads changes
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  return (
    <div className="h-full flex flex-col">
      {/* Outreach Type Filter Tabs */}
      <div className="flex items-center gap-1 mb-3 px-1">
        {outreachFilterOptions.map(({ value, label, icon: Icon }) => {
          const isActive = outreachFilter === value;
          const count = outreachCounts[value];
          return (
            <button
              key={value}
              onClick={() => setOutreachFilter(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? value === 'EMAIL'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                    : value === 'COLD_CALL'
                    ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                    : value === 'WHATSAPP'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {value !== 'ALL' && <Icon className="h-3.5 w-3.5" />}
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-white/50 dark:bg-black/20' : 'bg-muted'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4 px-1">
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
              • {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={refreshLeads}
          disabled={isPending}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isUpdating && (
        <div className="fixed top-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg z-50">
          Updating...
        </div>
      )}
      
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-destructive text-destructive-foreground px-4 py-3 rounded-md shadow-lg z-50 flex items-center gap-3 max-w-md">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="shrink-0 hover:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {kanbanColumnOrder.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              title={leadStatusLabels[status]}
              leads={leadsByStatus[status] || []}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
