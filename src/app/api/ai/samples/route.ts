import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSampleSchema = z.object({
  customerQuestion: z.string().min(1),
  preferredResponse: z.string().min(1),
  category: z.string().optional().nullable(),
});

// GET /api/ai/samples - List sample responses
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const samples = await prisma.aISampleResponse.findMany({
      where: {
        teamId,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(samples);
  } catch (error) {
    console.error('Error fetching sample responses:', error);
    return NextResponse.json({ error: 'Failed to fetch sample responses' }, { status: 500 });
  }
}

// POST /api/ai/samples - Create a sample response
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const teamId = session.user.teamId;

    const body = await request.json();
    const data = createSampleSchema.parse(body);

    const sample = await prisma.aISampleResponse.create({
      data: {
        ...data,
        teamId,
      },
    });

    return NextResponse.json(sample, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error creating sample response:', error);
    return NextResponse.json({ error: 'Failed to create sample response' }, { status: 500 });
  }
}
