import { auth } from '@/lib/auth';
import { encrypt, maskSecret, decrypt } from '@/lib/crypto';
import { teamApiKeysCollection, teamApiKeyDoc, serverTimestamp } from '@/lib/firebase/collections';
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

    const snapshot = await teamApiKeysCollection(teamId)
      .orderBy('createdAt', 'desc')
      .get();

    // Return masked keys
    const maskedKeys = snapshot.docs.map(doc => {
      const key = doc.data();
      let maskedKey: string | null = null;
      try {
        const decrypted = decrypt(key.encryptedKey);
        maskedKey = maskSecret(decrypted);
      } catch {
        maskedKey = '••••••••';
      }

      return {
        id: doc.id,
        provider: key.provider,
        label: key.label,
        maskedKey,
        isActive: key.isActive,
        createdAt: key.createdAt?.toDate?.() || key.createdAt,
        updatedAt: key.updatedAt?.toDate?.() || key.updatedAt,
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
    const existingKeysSnapshot = await teamApiKeysCollection(teamId)
      .where('provider', '==', data.provider)
      .limit(1)
      .get();

    let keyDocRef;
    if (!existingKeysSnapshot.empty) {
      // Update existing key
      keyDocRef = existingKeysSnapshot.docs[0].ref;
      await keyDocRef.update({
        encryptedKey,
        label: data.label || `${data.provider} API Key`,
        isActive: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Create new key
      keyDocRef = teamApiKeysCollection(teamId).doc();
      await keyDocRef.set({
        teamId,
        provider: data.provider,
        encryptedKey,
        label: data.label || `${data.provider} API Key`,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const keyDoc = await keyDocRef.get();
    const keyData = keyDoc.data()!;

    return NextResponse.json({
      id: keyDoc.id,
      provider: keyData.provider,
      label: keyData.label,
      maskedKey: maskSecret(data.apiKey),
      isActive: keyData.isActive,
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
    const docRef = teamApiKeyDoc(teamId, id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error deleting API key:', error);
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}
