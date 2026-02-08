'use client';

import { clientAuth } from '@/lib/firebase/client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import type { UserRole } from '@/types';

interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  teamId: string;
}

interface SessionContextValue {
  user: SessionUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  status: 'loading',
  signOut: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(clientAuth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        // Get custom claims from the ID token
        const tokenResult = await firebaseUser.getIdTokenResult();
        const claims = tokenResult.claims;

        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || null,
          role: (claims.role as UserRole) || 'USER',
          teamId: (claims.teamId as string) || '',
        });
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      // Clear server-side session cookie
      await fetch('/api/auth/session', { method: 'DELETE' });
      // Sign out of Firebase client
      await clientAuth.signOut();
    } catch {
      // Still try to sign out client-side
      await clientAuth.signOut();
    }
  };

  return (
    <SessionContext.Provider value={{ user, status, signOut: handleSignOut }}>
      {children}
    </SessionContext.Provider>
  );
}
