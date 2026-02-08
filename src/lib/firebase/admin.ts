import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin SDK initialization (server-side only).
 *
 * Emulator detection:
 *   The Admin SDK automatically connects to the emulators when the
 *   environment variables FIRESTORE_EMULATOR_HOST and
 *   FIREBASE_AUTH_EMULATOR_HOST are set (see .env).
 *   No conditional code is needed here.
 */

function createApp() {
  // When running against emulators the project ID is enough — no credentials required.
  const useEmulators = !!process.env.FIRESTORE_EMULATOR_HOST;

  if (useEmulators) {
    return initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'demo-ttwf-leads',
    });
  }

  // Production: use service account credentials
  const serviceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

// Singleton — only initialise once (important for Next.js hot reload)
const app = getApps().length === 0 ? createApp() : getApps()[0];

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
export { app as adminApp };
