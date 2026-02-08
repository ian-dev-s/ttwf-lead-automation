import { ClearNewLeadsButton } from '@/components/leads/ClearNewLeadsButton';
import { KanbanBoard } from '@/components/kanban/Board';
import { Header } from '@/components/layout/Header';
import { LeadForm } from '@/components/leads/LeadForm';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { leadsCollection, messagesCollection } from '@/lib/firebase/collections';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getLeads(teamId: string) {
  const snapshot = await leadsCollection(teamId)
    .orderBy('score', 'desc')
    .get();

  // Attach message info to each lead
  const leads = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data();
      const msgSnap = await messagesCollection(teamId)
        .where('leadId', '==', doc.id)
        .select('type', 'status')
        .get();
      const messages = msgSnap.docs.map((m) => ({
        id: m.id,
        type: m.data().type,
        status: m.data().status,
      }));
      return {
        id: doc.id,
        ...data,
        messages,
        _count: { messages: messages.length },
      };
    })
  );

  return leads;
}

async function getNewLeadsCount(teamId: string) {
  const snap = await leadsCollection(teamId)
    .where('status', '==', 'NEW')
    .count()
    .get();
  return snap.data().count;
}

export default async function LeadsPage() {
  const session = await auth();
  const teamId = session?.user?.teamId || '';

  const [leads, newLeadsCount] = teamId
    ? await Promise.all([getLeads(teamId), getNewLeadsCount(teamId)])
    : [[], 0];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Leads"
        description="Manage your business leads with drag-and-drop"
        actions={
          <div className="flex gap-2">
            <ClearNewLeadsButton initialCount={newLeadsCount} />
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
