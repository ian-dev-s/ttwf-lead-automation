import { auth } from '@/lib/auth';
import { teamSettingsDoc, stripUndefined } from '@/lib/firebase/collections';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for settings
const settingsSchema = z.object({
  dailyLeadTarget: z.number().min(1).max(100).optional(),
  leadGenerationEnabled: z.boolean().optional(),
  scrapeDelayMs: z.number().min(500).max(10000).optional(),
  maxLeadsPerRun: z.number().min(1).max(50).optional(),
  searchRadiusKm: z.number().min(5).max(200).optional(),
  minGoogleRating: z.number().min(0).max(5).optional(),
  targetIndustries: z.array(z.string()).optional(),
  blacklistedIndustries: z.array(z.string()).optional(),
  targetCities: z.array(z.string()).optional(),
  autoGenerateMessages: z.boolean().optional(),
  // Branding settings
  companyName: z.string().optional(),
  companyWebsite: z.string().url().optional(),
  companyTagline: z.string().optional(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  whatsappPhone: z.string().nullable().optional(),
  socialFacebookUrl: z.string().url().nullable().optional(),
  socialInstagramUrl: z.string().url().nullable().optional(),
  socialLinkedinUrl: z.string().url().nullable().optional(),
  socialTwitterUrl: z.string().url().nullable().optional(),
  socialTiktokUrl: z.string().url().nullable().optional(),
  // AI Training settings
  aiTone: z.string().nullable().optional(),
  aiWritingStyle: z.string().nullable().optional(),
  aiCustomInstructions: z.string().nullable().optional(),
});

// GET /api/settings - Get system settings
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    // Get or create default settings
    const docRef = teamSettingsDoc(teamId);
    const docSnap = await docRef.get();

    let settings;

    if (!docSnap.exists) {
      // Create default settings
      const defaultSettings = {
        dailyLeadTarget: 10,
        leadGenerationEnabled: true,
        scrapeDelayMs: 2000,
        maxLeadsPerRun: 20,
        searchRadiusKm: 50,
        minGoogleRating: 4.0,
        targetIndustries: [
          'Plumber',
          'Electrician',
          'Painter',
          'Landscaper',
          'Cleaner',
          'Caterer',
          'Photographer',
          'Personal Trainer',
          'Beauty Salon',
          'Auto Mechanic',
        ],
        targetCities: [
          'Johannesburg',
          'Cape Town',
          'Durban',
          'Pretoria',
          'Port Elizabeth',
        ],
        blacklistedIndustries: [],
        autoGenerateMessages: false,
        companyName: '',
        companyWebsite: '',
        companyTagline: '',
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
        updatedAt: new Date(),
      };

      await docRef.set(defaultSettings);
      settings = defaultSettings;
    } else {
      settings = docSnap.data();
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PATCH /api/settings - Update system settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    // Only admins can update settings
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can update settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = settingsSchema.parse(body);

    const docRef = teamSettingsDoc(teamId);
    
    const updateData = stripUndefined({
      ...validatedData,
      targetIndustries: validatedData.targetIndustries || [],
      targetCities: validatedData.targetCities || [],
      blacklistedIndustries: validatedData.blacklistedIndustries || [],
      updatedAt: new Date(),
    });

    // Use set with merge for upsert behavior
    await docRef.set(updateData, { merge: true });

    const updatedDoc = await docRef.get();
    const settings = updatedDoc.data();

    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
