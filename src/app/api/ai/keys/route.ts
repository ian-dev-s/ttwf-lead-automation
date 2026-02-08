import { auth } from '@/lib/auth';
import { encrypt, maskSecret, decrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createKeySchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  apiKey: z.string().min(1, 'API key is required'),
  label: z.string().optional(),
});

const deleteKeySchema = z.object({
  id: z.string().min(1, 'Key ID is required'),
});

// GET /api/ai/keys - List team API keys (masked)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const keys = await prisma.teamApiKey.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });

    // Return masked keys
    const maskedKeys = keys.map(key => {
      let maskedKey: string | null = null;
      try {
        const decrypted = decrypt(key.encryptedKey);
        maskedKey = maskSecret(decrypted);
      } catch {
        maskedKey = '••••••••';
      }

      return {
        id: key.id,
        provider: key.provider,
        label: key.label,
        maskedKey,
        isActive: key.isActive,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      };
    });

    return NextResponse.json(maskedKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

// POST /api/ai/keys - Add a new API key
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can manage API keys' }, { status: 403 });
    }

    const teamId = session.user.teamId;
    const body = await request.json();
    const data = createKeySchema.parse(body);

    // Encrypt the API key
    const encryptedKey = encrypt(data.apiKey);

    // Upsert - replace existing key for the same provider
    const key = await prisma.teamApiKey.upsert({
      where: {
        teamId_provider: {
          teamId,
          provider: data.provider,
        },
      },
      update: {
        encryptedKey,
        label: data.label || `${data.provider} API Key`,
        isActive: true,
      },
      create: {
        teamId,
        provider: data.provider,
        encryptedKey,
        label: data.label || `${data.provider} API Key`,
        isActive: true,
      },
    });

    return NextResponse.json({
      id: key.id,
      provider: key.provider,
      label: key.label,
      maskedKey: maskSecret(data.apiKey),
      isActive: key.isActive,
      success: true,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

// DELETE /api/ai/keys - Remove an API key
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can manage API keys' }, { status: 403 });
    }

    const teamId = session.user.teamId;
    const body = await request.json();
    const { id } = deleteKeySchema.parse(body);

    // Verify the key belongs to this team
    const key = await prisma.teamApiKey.findFirst({
      where: { id, teamId },
    });

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await prisma.teamApiKey.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error deleting API key:', error);
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}
