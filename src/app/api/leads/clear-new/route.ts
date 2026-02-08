import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

// DELETE /api/leads/clear-new - Delete all leads with NEW status
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    // Only admins can delete leads in bulk
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can clear leads' },
        { status: 403 }
      );
    }

    // Count leads to be deleted
    const count = await prisma.lead.count({
      where: { status: 'NEW', teamId },
    });

    if (count === 0) {
      return NextResponse.json({
        success: true,
        message: 'No leads with NEW status to delete',
        deletedCount: 0,
      });
    }

    // Delete related messages first
    await prisma.message.deleteMany({
      where: {
        lead: {
          status: 'NEW',
          teamId,
        },
      },
    });

    // Delete status history
    await prisma.statusHistory.deleteMany({
      where: {
        lead: {
          status: 'NEW',
          teamId,
        },
      },
    });

    // Delete the leads
    const result = await prisma.lead.deleteMany({
      where: { status: 'NEW', teamId },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.count} leads with NEW status`,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Error clearing NEW leads:', error);
    return NextResponse.json(
      { error: 'Failed to clear leads' },
      { status: 500 }
    );
  }
}

// GET /api/leads/clear-new - Get count of NEW leads
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const count = await prisma.lead.count({
      where: { status: 'NEW', teamId },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error counting NEW leads:', error);
    return NextResponse.json(
      { error: 'Failed to count leads' },
      { status: 500 }
    );
  }
}
