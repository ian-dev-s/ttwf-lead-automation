import { Header } from '@/components/layout/Header';
import { LeadDetail } from '@/components/leads/LeadDetail';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { leadDoc, messagesCollection, statusHistoryCollection, userDoc } from '@/lib/firebase/collections';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function getLead(teamId: string, id: string) {
  const leadSnap = await leadDoc(teamId, id).get();
  if (!leadSnap.exists) return null;

  const leadData = leadSnap.data()!;

  // Get messages
  const msgSnap = await messagesCollection(teamId)
    .where('leadId', '==', id)
    .orderBy('createdAt', 'desc')
    .get();
  const messages = msgSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Get status history with user info
  const histSnap = await statusHistoryCollection(teamId)
    .where('leadId', '==', id)
    .orderBy('changedAt', 'desc')
    .get();
  const statusHistory = await Promise.all(
    histSnap.docs.map(async (d) => {
      const hist = d.data();
      let changedBy = null;
      if (hist.changedById) {
        const userSnap = await userDoc(hist.changedById as string).get();
        if (userSnap.exists) {
          const userData = userSnap.data()!;
          changedBy = { name: userData.name, email: userData.email };
        }
      }
      return { id: d.id, ...hist, changedBy };
    })
  );

  // Get createdBy user
  let createdBy = null;
  if (leadData.createdById) {
    const createdBySnap = await userDoc(leadData.createdById as string).get();
    if (createdBySnap.exists) {
      const userData = createdBySnap.data()!;
      createdBy = { name: userData.name, email: userData.email };
    }
  }

  return {
    id,
    ...leadData,
    messages,
    statusHistory,
    createdBy,
  };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const teamId = session?.user?.teamId || '';
  const { id } = await params;

  const lead = teamId ? await getLead(teamId, id) : null;

  if (!lead) {
    notFound();
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Lead Details"
        actions={
          <Link href="/leads">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Leads
            </Button>
          </Link>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <LeadDetail lead={lead} />
      </div>
    </div>
  );
}
