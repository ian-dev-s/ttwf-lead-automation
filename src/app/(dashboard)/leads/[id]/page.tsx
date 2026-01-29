import { Header } from '@/components/layout/Header';
import { LeadDetail } from '@/components/leads/LeadDetail';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/db';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

async function getLead(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
      },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        include: {
          changedBy: {
            select: { name: true, email: true },
          },
        },
      },
      createdBy: {
        select: { name: true, email: true },
      },
    },
  });
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await getLead(id);

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
