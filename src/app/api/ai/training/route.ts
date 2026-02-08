import { auth } from '@/lib/auth';
import { teamSettingsDoc, serverTimestamp, stripUndefined } from '@/lib/firebase/collections';
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

    const docRef = teamSettingsDoc(teamId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({
        aiTone: null,
        aiWritingStyle: null,
        aiCustomInstructions: null,
      });
    }

    const data = docSnap.data() || {};
    return NextResponse.json({
      aiTone: data.aiTone ?? null,
      aiWritingStyle: data.aiWritingStyle ?? null,
      aiCustomInstructions: data.aiCustomInstructions ?? null,
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

    const docRef = teamSettingsDoc(teamId);
    const updatePayload = stripUndefined({
      ...data,
      updatedAt: serverTimestamp(),
    });

    // Upsert: set with merge
    await docRef.set(updatePayload, { merge: true });

    const updatedDoc = await docRef.get();
    const settings = updatedDoc.data()!;

    return NextResponse.json({
      aiTone: settings.aiTone ?? null,
      aiWritingStyle: settings.aiWritingStyle ?? null,
      aiCustomInstructions: settings.aiCustomInstructions ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error updating AI training config:', error);
    return NextResponse.json({ error: 'Failed to update AI training config' }, { status: 500 });
  }
}
