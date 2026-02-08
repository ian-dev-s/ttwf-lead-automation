/**
 * Firebase Seed Script
 *
 * Seeds the Firestore emulator (or production) with:
 *   - A default team
 *   - An admin user (created in Firebase Auth + Firestore)
 *   - Default team settings
 *   - Default email templates
 *
 * Usage:
 *   npm run seed:firebase
 *
 * Prerequisites:
 *   - Firebase emulators must be running (npm run dev:firebase)
 *   - FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST env vars set
 */

import 'dotenv/config';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
function createApp() {
  const useEmulators = !!process.env.FIRESTORE_EMULATOR_HOST;

  if (useEmulators) {
    return initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'demo-ttwf-leads',
    });
  }

  const serviceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };

  return initializeApp({ credential: cert(serviceAccount) });
}

const app = getApps().length === 0 ? createApp() : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);

// Default email templates
const DEFAULT_TEMPLATES = [
  {
    name: 'Initial Outreach',
    description: 'First contact email for new leads',
    purpose: 'outreach',
    systemPrompt: `You are an expert copywriter for a web design agency. Write a personalized outreach email to a business that could benefit from a professional website.

Guidelines:
- Be warm, professional, and genuine
- Reference specific details about their business
- Highlight their strengths
- Present the offer clearly (free draft website, no obligation)
- Use HTML formatting (NOT markdown)
- Include a subject line on the first line`,
    bodyTemplate: null,
    subjectLine: null,
    isActive: true,
    isDefault: true,
    tone: 'professional',
    maxLength: 1500,
    mustInclude: ['free draft', 'no obligation'],
    avoidTopics: ['competitors', 'negative reviews'],
  },
  {
    name: 'Follow-Up',
    description: 'Follow-up email for leads who have not responded',
    purpose: 'follow_up',
    systemPrompt: `You are an expert copywriter. Write a polite follow-up email referencing a previous outreach.

Guidelines:
- Be shorter and more concise
- Reference the previous outreach naturally
- Maintain professionalism and warmth
- Use HTML formatting (NOT markdown)
- Include a subject line on the first line`,
    bodyTemplate: null,
    subjectLine: null,
    isActive: true,
    isDefault: true,
    tone: 'friendly',
    maxLength: 800,
    mustInclude: ['previous email'],
    avoidTopics: ['competitors'],
  },
  {
    name: 'Re-Engagement',
    description: 'Re-engagement email for cold leads',
    purpose: 're_engagement',
    systemPrompt: `You are an expert copywriter. Write a re-engagement email to a lead who has gone cold.

Guidelines:
- Offer something new or valuable
- Be brief and respectful of their time
- Use HTML formatting (NOT markdown)
- Include a subject line on the first line`,
    bodyTemplate: null,
    subjectLine: null,
    isActive: true,
    isDefault: true,
    tone: 'warm',
    maxLength: 600,
    mustInclude: [],
    avoidTopics: ['why they did not respond'],
  },
];

async function seed() {
  console.log('Starting Firebase seed...\n');

  const useEmulators = !!process.env.FIRESTORE_EMULATOR_HOST;
  console.log(
    useEmulators
      ? 'Connected to Firebase Emulators'
      : 'WARNING: Connected to PRODUCTION Firebase!'
  );

  // 1. Create team
  const teamId = 'default-team';
  const now = new Date();

  console.log('\n1. Creating default team...');
  await db.collection('teams').doc(teamId).set({
    name: 'Default Team',
    slug: 'default',
    createdAt: now,
    updatedAt: now,
  });
  console.log('   Team created: default-team');

  // 2. Create admin user in Firebase Auth
  console.log('\n2. Creating admin user...');
  const email = 'admin@ttwf.local';
  const password = 'password123';

  let userId: string;
  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: 'Admin',
    });
    userId = userRecord.uid;
  } catch (error: any) {
    if (error?.code === 'auth/email-already-exists') {
      const existingUser = await auth.getUserByEmail(email);
      userId = existingUser.uid;
      console.log('   User already exists, reusing...');
    } else {
      throw error;
    }
  }

  // Set custom claims
  await auth.setCustomUserClaims(userId, {
    role: 'ADMIN',
    teamId,
  });

  // Create Firestore user doc
  await db.collection('users').doc(userId).set({
    email,
    name: 'Admin',
    role: 'ADMIN',
    teamId,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`   Admin user created: ${email} / ${password}`);
  console.log(`   Firebase UID: ${userId}`);

  // 3. Create default team settings
  console.log('\n3. Creating default team settings...');
  await db
    .collection('teams')
    .doc(teamId)
    .collection('settings')
    .doc('default')
    .set({
      dailyLeadTarget: 10,
      leadGenerationEnabled: false,
      scrapeDelayMs: 500,
      maxLeadsPerRun: 20,
      searchRadiusKm: 50,
      minGoogleRating: 3.5,
      targetIndustries: [],
      blacklistedIndustries: [],
      targetCities: [],
      autoGenerateMessages: true,
      companyName: 'The Tiny Web Factory',
      companyWebsite: 'https://thetinywebfactory.com',
      companyTagline: 'Professional websites for growing businesses',
      logoUrl: null,
      bannerUrl: null,
      whatsappPhone: null,
      socialFacebookUrl: null,
      socialInstagramUrl: null,
      socialLinkedinUrl: null,
      socialTwitterUrl: null,
      socialTiktokUrl: null,
      aiTone: null,
      aiWritingStyle: null,
      aiCustomInstructions: null,
      smtpHost: null,
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: null,
      smtpPass: null,
      emailFrom: null,
      emailDebugMode: false,
      emailDebugAddress: null,
      imapHost: null,
      imapPort: 993,
      imapSecure: true,
      imapUser: null,
      imapPass: null,
      updatedAt: now,
    });
  console.log('   Team settings created');

  // 4. Create default email templates
  console.log('\n4. Creating default email templates...');
  for (const template of DEFAULT_TEMPLATES) {
    await db
      .collection('teams')
      .doc(teamId)
      .collection('emailTemplates')
      .doc()
      .set({
        ...template,
        createdAt: now,
        updatedAt: now,
      });
    console.log(`   Template created: ${template.name}`);
  }

  console.log('\n--- Seed complete! ---');
  console.log(`\nLogin credentials:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`\nEmulator UI: http://localhost:4000`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
