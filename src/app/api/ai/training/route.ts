import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateTrainingSchema = z.object({
  aiTone: z.string().nullable().optional(),
  aiWritingStyle: z.string().nullable().optional(),
  aiCustomInstructions: z.string().nullable().optional(),
});

// GET /api/ai/training - Get AI training/personality configuration
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const settings = await prisma.teamSettings.findUnique({
      where: { teamId },
      select: {
        aiTone: true,
        aiWritingStyle: true,
        aiCustomInstructions: true,
      },
    });

    return NextResponse.json(settings || {
      aiTone: null,
      aiWritingStyle: null,
      aiCustomInstructions: null,
    });
  } catch (error) {
    console.error('Error fetching AI training config:', error);
    return NextResponse.json({ error: 'Failed to fetch AI training config' }, { status: 500 });
  }
}

// PATCH /api/ai/training - Update AI training/personality settings
export async function PATCH(request: NextRequest) {
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
    const data = updateTrainingSchema.parse(body);

    const settings = await prisma.teamSettings.upsert({
      where: { teamId },
      update: data,
      create: {
        teamId,
        ...data,
        targetIndustries: [],
        targetCities: [],
        blacklistedIndustries: [],
      },
    });

    return NextResponse.json({
      aiTone: settings.aiTone,
      aiWritingStyle: settings.aiWritingStyle,
      aiCustomInstructions: settings.aiCustomInstructions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating AI training config:', error);
    return NextResponse.json({ error: 'Failed to update AI training config' }, { status: 500 });
  }
}
