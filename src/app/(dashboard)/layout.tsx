import { Sidebar } from '@/components/layout/Sidebar';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if initial setup is needed (no teams exist)
  const teamCount = await prisma.team.count();
  if (teamCount === 0) {
    redirect('/setup');
  }

  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
    </div>
  );
}
