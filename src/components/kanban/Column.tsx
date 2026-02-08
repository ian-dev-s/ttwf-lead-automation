'use client';

import { cn } from '@/lib/utils';
import { Droppable } from '@hello-pangea/dnd';
import { Lead, LeadStatus } from '@prisma/client';
import { LeadCard } from './LeadCard';

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

interface KanbanColumnProps {
  status: LeadStatus;
  title: string;
  leads: LeadWithMessages[];
}

const columnColors: Record<LeadStatus, string> = {
  NEW: 'border-t-blue-500',
  QUALIFIED: 'border-t-purple-500',
  MESSAGE_READY: 'border-t-indigo-500',
  PENDING_APPROVAL: 'border-t-yellow-500',
  CONTACTED: 'border-t-orange-500',
  RESPONDED: 'border-t-green-500',
  CONVERTED: 'border-t-emerald-500',
  NOT_INTERESTED: 'border-t-gray-500',
  REJECTED: 'border-t-red-500',
  INVALID: 'border-t-red-500',
};

export function KanbanColumn({ status, title, leads }: KanbanColumnProps) {
  return (
    <div
      className={cn(
        'flex flex-col bg-muted/50 rounded-lg min-w-[300px] max-w-[300px] border-t-4',
        columnColors[status]
      )}
    >
      <div className="p-3 border-b bg-background/50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="bg-muted text-muted-foreground text-xs font-medium px-2 py-1 rounded-full">
            {leads.length}
          </span>
        </div>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] transition-colors',
              snapshot.isDraggingOver && 'bg-muted/80'
            )}
          >
            {leads.map((lead, index) => (
              <LeadCard key={lead.id} lead={lead} index={index} />
            ))}
            {provided.placeholder}
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center text-muted-foreground text-sm py-8">
                No leads
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
