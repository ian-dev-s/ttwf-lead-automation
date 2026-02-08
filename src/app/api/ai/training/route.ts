import { auth } from '@/lib/auth';
import { serverTimestamp, stripUndefined, teamSettingsDoc } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Default AI training values for The Tiny Web Factory
const DEFAULT_AI_TONE = 'professional-friendly';
const DEFAULT_AI_WRITING_STYLE = 'persuasive';
const DEFAULT_AI_CUSTOM_INSTRUCTIONS = 'Use South African English spelling (e.g., "favour" not "favor", "colour" not "color"). Always mention our free draft website offer. Focus on how a professional website can help grow their business. Be warm and genuine - never pushy or salesy. Reference The Tiny Web Factory as the company name and include our website link: https://thetinywebfactory.com';

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
      // Return seeded defaults for new teams
      return NextResponse.json({
        aiTone: DEFAULT_AI_TONE,
        aiWritingStyle: DEFAULT_AI_WRITING_STYLE,
        aiCustomInstructions: DEFAULT_AI_CUSTOM_INSTRUCTIONS,
      });
    }

    const data = docSnap.data() || {};
    return NextResponse.json({
      aiTone: data.aiTone ?? DEFAULT_AI_TONE,
      aiWritingStyle: data.aiWritingStyle ?? DEFAULT_AI_WRITING_STYLE,
      aiCustomInstructions: data.aiCustomInstructions ?? DEFAULT_AI_CUSTOM_INSTRUCTIONS,
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
