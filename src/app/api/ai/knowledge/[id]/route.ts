import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateKnowledgeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
});

// GET /api/ai/knowledge/[id]
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
    const item = await prisma.aIKnowledgeItem.findFirst({ where: { id, teamId } });

    if (!item) {
      return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching knowledge item:', error);
    return NextResponse.json({ error: 'Failed to fetch knowledge item' }, { status: 500 });
  }
}

// PATCH /api/ai/knowledge/[id]
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
    const data = updateKnowledgeSchema.parse(body);

    const existingItem = await prisma.aIKnowledgeItem.findFirst({
      where: { id, teamId },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 });
    }

    const item = await prisma.aIKnowledgeItem.update({
      where: { id },
      data,
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating knowledge item:', error);
    return NextResponse.json({ error: 'Failed to update knowledge item' }, { status: 500 });
  }
}

// DELETE /api/ai/knowledge/[id]
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

    const existingItem = await prisma.aIKnowledgeItem.findFirst({
      where: { id, teamId },
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Knowledge item not found' }, { status: 404 });
    }

    await prisma.aIKnowledgeItem.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting knowledge item:', error);
    return NextResponse.json({ error: 'Failed to delete knowledge item' }, { status: 500 });
  }
}
