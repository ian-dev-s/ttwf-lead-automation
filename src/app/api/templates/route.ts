import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

    // Build where clause
    const where: any = { teamId };
    if (purpose) {
      where.purpose = purpose;
    }

    const templates = await prisma.emailTemplate.findMany({
      where,
      orderBy: [
        { purpose: 'asc' },
        { name: 'asc' },
      ],
    });

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

    // If isDefault is true, unset isDefault on all other templates with the same purpose
    if (validatedData.isDefault) {
      await prisma.emailTemplate.updateMany({
        where: {
          teamId,
          purpose: validatedData.purpose,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.emailTemplate.create({
      data: {
        teamId,
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
      },
    });

    return NextResponse.json(template, { status: 201 });
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
