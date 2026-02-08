import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateSampleSchema = z.object({
  customerQuestion: z.string().min(1).optional(),
  preferredResponse: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
});

// GET /api/ai/samples/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const teamId = session.user.teamId;
    const sample = await prisma.aISampleResponse.findFirst({ where: { id, teamId } });

    if (!sample) {
      return NextResponse.json({ error: 'Sample response not found' }, { status: 404 });
    }

    return NextResponse.json(sample);
  } catch (error) {
    console.error('Error fetching sample response:', error);
    return NextResponse.json({ error: 'Failed to fetch sample response' }, { status: 500 });
  }
}

// PATCH /api/ai/samples/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const teamId = session.user.teamId;
    const body = await request.json();
    const data = updateSampleSchema.parse(body);

    const existingSample = await prisma.aISampleResponse.findFirst({
      where: { id, teamId },
    });

    if (!existingSample) {
      return NextResponse.json({ error: 'Sample response not found' }, { status: 404 });
    }

    const sample = await prisma.aISampleResponse.update({
      where: { id },
      data,
    });

    return NextResponse.json(sample);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating sample response:', error);
    return NextResponse.json({ error: 'Failed to update sample response' }, { status: 500 });
  }
}

// DELETE /api/ai/samples/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const teamId = session.user.teamId;

    const existingSample = await prisma.aISampleResponse.findFirst({
      where: { id, teamId },
    });

    if (!existingSample) {
      return NextResponse.json({ error: 'Sample response not found' }, { status: 404 });
    }

    await prisma.aISampleResponse.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sample response:', error);
    return NextResponse.json({ error: 'Failed to delete sample response' }, { status: 500 });
  }
}
