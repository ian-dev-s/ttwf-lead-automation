import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/history - Get analyzed businesses history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const filter = searchParams.get('filter') || 'all'; // 'all', 'prospects', 'skipped', 'converted'
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    // Build where clause based on filters
    const where: any = { teamId };
    
    if (filter === 'prospects') {
      where.isGoodProspect = true;
      where.wasConverted = false;
    } else if (filter === 'skipped') {
      where.isGoodProspect = false;
    } else if (filter === 'converted') {
      where.wasConverted = true;
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count for pagination
    const totalCount = await prisma.analyzedBusiness.count({ where });

    // Get analyzed businesses
    const businesses = await prisma.analyzedBusiness.findMany({
      where,
      orderBy: { analyzedAt: 'desc' },
      skip,
      take: limit,
    });

    // Get statistics
    const stats = await prisma.analyzedBusiness.groupBy({
      where: { teamId },
      by: ['isGoodProspect', 'wasConverted'],
      _count: true,
    });

    const statistics = {
      total: totalCount,
      prospects: stats.filter(s => s.isGoodProspect && !s.wasConverted).reduce((sum, s) => sum + s._count, 0),
      skipped: stats.filter(s => !s.isGoodProspect).reduce((sum, s) => sum + s._count, 0),
      converted: stats.filter(s => s.wasConverted).reduce((sum, s) => sum + s._count, 0),
    };

    return NextResponse.json({
      businesses,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      statistics,
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

// DELETE /api/history - Clear all history
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const olderThan = searchParams.get('olderThan'); // Days

    const where: Record<string, unknown> = { teamId };
    
    if (olderThan) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(olderThan));
      where.analyzedAt = { lt: daysAgo };
    }

    const deleted = await prisma.analyzedBusiness.deleteMany({ where });

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    return NextResponse.json(
      { error: 'Failed to clear history' },
      { status: 500 }
    );
  }
}
