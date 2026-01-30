'use client';

import { kanbanColumnOrder, leadStatusLabels } from '@/lib/utils';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { Lead, LeadStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { KanbanColumn } from './Column';

interface KanbanBoardProps {
  initialLeads: Lead[];
}

export function KanbanBoard({ initialLeads }: KanbanBoardProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [isUpdating, setIsUpdating] = useState(false);

  // Group leads by status and sort alphabetically by business name
  const leadsByStatus = kanbanColumnOrder.reduce((acc, status) => {
    acc[status] = leads
      .filter((lead) => lead.status === status)
      .sort((a, b) => a.businessName.localeCompare(b.businessName));
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

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

      // Optimistically update UI
      setLeads((prevLeads) =>
        prevLeads.map((lead) =>
          lead.id === leadId ? { ...lead, status: newStatus } : lead
        )
      );

      // Update on server
      setIsUpdating(true);
      try {
        const response = await fetch(`/api/leads/${leadId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) {
          throw new Error('Failed to update status');
        }

        router.refresh();
      } catch (error) {
        console.error('Error updating lead status:', error);
        // Revert on error
        setLeads(initialLeads);
      } finally {
        setIsUpdating(false);
      }
    },
    [initialLeads, router]
  );

  // Refresh leads when initialLeads changes
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  return (
    <div className="h-full">
      {isUpdating && (
        <div className="fixed top-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg z-50">
          Updating...
        </div>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-full">
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
