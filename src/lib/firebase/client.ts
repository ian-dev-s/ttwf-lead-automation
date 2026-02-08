'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-key',
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'demo-ttwf-leads.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-ttwf-leads',
};

// Singleton — only initialise once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const clientAuth = getAuth(app);
export const clientDb = getFirestore(app);

// Connect to emulators in development
// The flag is checked once on module load; the connect* helpers are idempotent-ish
// but we guard with a module-level boolean to be safe.
let _emulatorsConnected = false;

export function connectEmulators() {
  if (_emulatorsConnected) return;
  if (process.env.NEXT_PUBLIC_USE_EMULATORS !== 'true') return;

  try {
    connectAuthEmulator(clientAuth, 'http://localhost:9099', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(clientDb, 'localhost', 8080);
    _emulatorsConnected = true;
    console.log('[Firebase] Connected to local emulators');
  } catch {
    // Already connected — ignore
  }
}

// Auto-connect on import in development
if (typeof window !== 'undefined') {
  connectEmulators();
}
