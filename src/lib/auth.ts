import { adminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import type { UserRole } from '@/types';

export const SESSION_COOKIE_NAME = '__session';
const SESSION_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ─── Session types ─────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  teamId: string;
}

export interface Session {
  user: SessionUser;
}

// ─── Server-side auth (API routes / RSC) ───────────────────

/**
 * Get the current session from the Firebase session cookie.
 * Returns null if no valid session exists.
 */
export async function auth(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return null;
    }

    // Verify the session cookie with Firebase Admin
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    // Extract custom claims
    const role = (decoded.role as UserRole) || 'USER';
    const teamId = (decoded.teamId as string) || '';

    return {
      user: {
        id: decoded.uid,
        email: decoded.email || '',
        name: (decoded.name as string) || null,
        role,
        teamId,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Create a Firebase session cookie from an ID token.
 * Call this from the /api/auth/session endpoint after client-side login.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRY_MS,
  });
}

/**
 * Revoke the session (sign out server-side).
 */
export async function revokeSession(sessionCookie: string): Promise<void> {
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie);
    await adminAuth.revokeRefreshTokens(decoded.uid);
  } catch {
    // Ignore errors — cookie may already be invalid
  }
}

// ─── Role-based access control helpers ─────────────────────

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function canManageLeads(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'USER';
}

export function canViewLeads(_role: UserRole): boolean {
  return true; // All roles can view
}
