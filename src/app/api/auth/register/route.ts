import { adminAuth } from '@/lib/firebase/admin';
import { userDoc, teamsCollection, usersCollection } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

// POST /api/auth/register - Register a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = registerSchema.parse(body);

    // Check if this is the first user (make them admin)
    const usersSnapshot = await usersCollection().limit(1).get();
    const isFirstUser = usersSnapshot.empty;
    const role = isFirstUser ? 'ADMIN' : 'USER';

    // Find a default team to assign the user to
    const teamsSnapshot = await teamsCollection().limit(1).get();
    const defaultTeamId = teamsSnapshot.empty ? null : teamsSnapshot.docs[0].id;

    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // Set custom claims (teamId and role)
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role,
      teamId: defaultTeamId || '',
    });

    // Create Firestore user document
    const now = new Date();
    await userDoc(userRecord.uid).set({
      email,
      name,
      role: role as 'ADMIN' | 'USER',
      teamId: defaultTeamId,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: userRecord.uid,
          email,
          name,
          role,
          createdAt: now,
        },
        message:
          role === 'ADMIN'
            ? 'Admin account created successfully'
            : 'Account created successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    // Firebase Auth error for duplicate email
    if (error?.code === 'auth/email-already-exists') {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    console.error('Error registering user:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
