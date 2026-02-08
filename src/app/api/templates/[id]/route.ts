import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for updating a template (all fields optional)
const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  purpose: z.enum(['outreach', 'follow_up', 're_engagement']).optional(),
  systemPrompt: z.string().min(1).optional(),
  bodyTemplate: z.string().optional(),
  subjectLine: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  tone: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  mustInclude: z.array(z.string()).optional(),
  avoidTopics: z.array(z.string()).optional(),
}).partial();

// GET /api/templates/[id] - Get a single template by ID
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

    const template = await prisma.emailTemplate.findFirst({
      where: { id, teamId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// PATCH /api/templates/[id] - Update a template
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
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const teamId = session.user.teamId;
    const body = await request.json();
    const validatedData = updateTemplateSchema.parse(body);

    // Get current template to check purpose if isDefault is being set
    const currentTemplate = await prisma.emailTemplate.findFirst({
      where: { id, teamId },
    });

    if (!currentTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // If isDefault is being set to true, unset isDefault on all other templates with the same purpose
    if (validatedData.isDefault === true) {
      const purpose = validatedData.purpose ?? currentTemplate.purpose;
      await prisma.emailTemplate.updateMany({
        where: {
          teamId,
          purpose,
          isDefault: true,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Prepare update data
    const updateData: any = { ...validatedData };
    
    // Handle nullable fields - only set to null if explicitly provided as null/empty
    if ('description' in body) {
      updateData.description = validatedData.description ?? null;
    }
    if ('bodyTemplate' in body) {
      updateData.bodyTemplate = validatedData.bodyTemplate ?? null;
    }
    if ('subjectLine' in body) {
      updateData.subjectLine = validatedData.subjectLine ?? null;
    }
    if ('tone' in body) {
      updateData.tone = validatedData.tone ?? null;
    }
    if ('maxLength' in body) {
      updateData.maxLength = validatedData.maxLength ?? null;
    }

    const template = await prisma.emailTemplate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

// DELETE /api/templates/[id] - Delete a template
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
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const teamId = session.user.teamId;

    // Get the template to check its purpose and if it's default
    const template = await prisma.emailTemplate.findFirst({
      where: { id, teamId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Check if this is the last active template for this purpose
    const activeTemplatesForPurpose = await prisma.emailTemplate.count({
      where: {
        teamId,
        purpose: template.purpose,
        isActive: true,
      },
    });

    if (template.isActive && activeTemplatesForPurpose === 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last active template for this purpose' },
        { status: 400 }
      );
    }

    // If deleting the default template for a purpose, set the next available active template as default
    if (template.isDefault) {
      const nextActiveTemplate = await prisma.emailTemplate.findFirst({
        where: {
          teamId,
          purpose: template.purpose,
          isActive: true,
          id: { not: id },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (nextActiveTemplate) {
        await prisma.emailTemplate.update({
          where: { id: nextActiveTemplate.id },
          data: { isDefault: true },
        });
      }
    }

    await prisma.emailTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
