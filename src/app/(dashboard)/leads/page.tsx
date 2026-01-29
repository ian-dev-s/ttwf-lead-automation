import { KanbanBoard } from '@/components/kanban/Board';
import { Header } from '@/components/layout/Header';
import { LeadForm } from '@/components/leads/LeadForm';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/db';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

async function getLeads() {
  return prisma.lead.findMany({
    orderBy: [
      { score: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

export default async function LeadsPage() {
  const leads = await getLeads();

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Leads"
        description="Manage your business leads with drag-and-drop"
        actions={
          <div className="flex gap-2">
            <Link href="/scraper">
              <Button variant="outline">
                <Sparkles className="h-4 w-4 mr-2" />
                Find Leads
              </Button>
            </Link>
            <LeadForm />
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-hidden">
        <KanbanBoard initialLeads={leads} />
      </div>
    </div>
  );
}
