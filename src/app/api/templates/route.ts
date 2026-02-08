import { auth } from '@/lib/auth';
import { emailTemplatesCollection } from '@/lib/firebase/collections';
import { adminDb } from '@/lib/firebase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for creating a template
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  purpose: z.enum(['outreach', 'follow_up', 're_engagement']).optional().default('outreach'),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  bodyTemplate: z.string().optional(),
  subjectLine: z.string().optional(),
  isActive: z.boolean().optional().default(false),
  isDefault: z.boolean().optional().default(false),
  tone: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  mustInclude: z.array(z.string()).optional().default([]),
  avoidTopics: z.array(z.string()).optional().default([]),
});

// GET /api/templates - List all templates
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const searchParams = request.nextUrl.searchParams;
    const purpose = searchParams.get('purpose');

    // Build query - apply where first, then orderBy
    let query: FirebaseFirestore.Query<any> = emailTemplatesCollection(teamId);
    
    if (purpose) {
      query = query.where('purpose', '==', purpose).orderBy('name', 'asc');
    } else {
      query = query.orderBy('purpose', 'asc').orderBy('name', 'asc');
    }

    const snapshot = await query.get();
    const templates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST /api/templates - Create a new template
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createTemplateSchema.parse(body);

    const teamId = session.user.teamId;
    const now = new Date();

    // If isDefault is true, unset isDefault on all other templates with the same purpose
    if (validatedData.isDefault) {
      const batch = adminDb.batch();
      const existingSnapshot = await emailTemplatesCollection(teamId)
        .where('purpose', '==', validatedData.purpose)
        .where('isDefault', '==', true)
        .get();

      existingSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isDefault: false });
      });

      await batch.commit();
    }

    const templateRef = emailTemplatesCollection(teamId).doc();
    const templateData = {
      name: validatedData.name,
      description: validatedData.description ?? null,
      purpose: validatedData.purpose,
      systemPrompt: validatedData.systemPrompt,
      bodyTemplate: validatedData.bodyTemplate ?? null,
      subjectLine: validatedData.subjectLine ?? null,
      isActive: validatedData.isActive ?? false,
      isDefault: validatedData.isDefault ?? false,
      tone: validatedData.tone ?? null,
      maxLength: validatedData.maxLength ?? null,
      mustInclude: validatedData.mustInclude ?? [],
      avoidTopics: validatedData.avoidTopics ?? [],
      createdAt: now,
      updatedAt: now,
    };

    await templateRef.set(templateData);

    return NextResponse.json({ id: templateRef.id, ...templateData }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
