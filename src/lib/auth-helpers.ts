import { auth } from './auth';

/**
 * Get the teamId from the current session.
 * Throws if no session or no teamId.
 */
export async function getTeamId(): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  if (!session.user.teamId) {
    throw new Error('No team associated with this user');
  }
  return session.user.teamId;
}

/**
 * Get the full authenticated session with teamId.
 * Returns null if not authenticated.
 */
export async function getAuthSession() {
  const session = await auth();
  if (!session?.user) return null;
  return session;
}

/**
 * Require authentication and return session.
 * Throws if not authenticated.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session;
}
