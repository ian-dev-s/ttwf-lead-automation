import { getProviderStatus, type SimpleProvider } from '@/lib/ai/providers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for AI config
const aiConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.string().min(1, 'Provider is required'),
  model: z.string().min(1, 'Model is required'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(4000).optional(),
  systemPrompt: z.string().optional(),
  requestsPerDay: z.number().min(1).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/ai/config - Get all AI configurations
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const configs = await prisma.aIConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Get status for OpenRouter
    const providers: SimpleProvider[] = ['OPENROUTER'];
    const providerStatuses = providers.map(p => getProviderStatus(p));

    return NextResponse.json({
      configs,
      providerStatuses,
    });
  } catch (error) {
    console.error('Error fetching AI configs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI configurations' },
      { status: 500 }
    );
  }
}

// POST /api/ai/config - Create a new AI configuration
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create AI configs
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can manage AI configurations' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = aiConfigSchema.parse(body);

    // If this config is set as active, deactivate others
    if (validatedData.isActive) {
      await prisma.aIConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const config = await prisma.aIConfig.create({
      data: {
        name: validatedData.name,
        provider: validatedData.provider as any,
        model: validatedData.model,
        temperature: validatedData.temperature ?? 0.7,
        maxTokens: validatedData.maxTokens ?? 1000,
        isActive: validatedData.isActive ?? false,
      },
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating AI config:', error);
    return NextResponse.json(
      { error: 'Failed to create AI configuration' },
      { status: 500 }
    );
  }
}

// PATCH /api/ai/config - Update an AI configuration (expects id in body)
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can manage AI configurations' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Config ID is required' }, { status: 400 });
    }

    const validatedData = aiConfigSchema.partial().parse(updateData);

    // If setting as active, deactivate others
    if (validatedData.isActive) {
      await prisma.aIConfig.updateMany({
        where: { isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }

    const config = await prisma.aIConfig.update({
      where: { id },
      data: validatedData as any,
    });

    return NextResponse.json(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating AI config:', error);
    return NextResponse.json(
      { error: 'Failed to update AI configuration' },
      { status: 500 }
    );
  }
}

// DELETE /api/ai/config - Delete an AI configuration
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can manage AI configurations' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Config ID is required' }, { status: 400 });
    }

    await prisma.aIConfig.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting AI config:', error);
    return NextResponse.json(
      { error: 'Failed to delete AI configuration' },
      { status: 500 }
    );
  }
}
