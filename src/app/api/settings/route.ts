import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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
});

// GET /api/settings - Get system settings
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create default settings
    let settings = await prisma.systemSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {
          id: 'default',
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
        },
      });
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

    // Only admins can update settings
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can update settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = settingsSchema.parse(body);

    const settings = await prisma.systemSettings.upsert({
      where: { id: 'default' },
      update: validatedData,
      create: {
        id: 'default',
        ...validatedData,
        targetIndustries: validatedData.targetIndustries || [],
        targetCities: validatedData.targetCities || [],
        blacklistedIndustries: validatedData.blacklistedIndustries || [],
      },
    });

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
