import { auth } from '@/lib/auth';
import { SUPPORTED_COUNTRIES } from '@/lib/constants';
import { prisma } from '@/lib/db';
import { DEFAULT_COUNTRY_CODE, runScrapingJob, SA_CITIES, scheduleScrapingJob, TARGET_CATEGORIES } from '@/lib/scraper/scheduler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for scheduling a scraping job
const scheduleJobSchema = z.object({
  leadsRequested: z.number().min(1).max(100),
  categories: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  country: z.string().optional(), // Country code (e.g., "ZA")
  minRating: z.number().min(0).max(5).optional(),
  scheduledFor: z.string().datetime().optional(),
  runImmediately: z.boolean().optional(),
});

// GET /api/scraper - Get scraping jobs and available options
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = session.user.teamId;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const countryFilter = searchParams.get('country');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: Record<string, unknown> = { teamId };
    if (status) {
      where.status = status;
    }
    if (countryFilter) {
      where.country = countryFilter;
    }

    const jobs = await prisma.scrapingJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Build list of available countries with their cities
    const availableCountries = Object.entries(SUPPORTED_COUNTRIES).map(([code, config]) => ({
      code,
      name: config.name,
      cities: config.cities,
    }));

    return NextResponse.json({
      jobs,
      availableCategories: TARGET_CATEGORIES,
      availableCities: SA_CITIES, // Default cities (SA) for backwards compatibility
      availableCountries,
      defaultCountry: DEFAULT_COUNTRY_CODE,
    });
  } catch (error) {
    console.error('Error fetching scraping jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scraping jobs' },
      { status: 500 }
    );
  }
}

// POST /api/scraper - Schedule or run a new scraping job
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can run scraping jobs
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can run scraping jobs' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { runImmediately, scheduledFor, country, ...jobData } = scheduleJobSchema.parse(body);

    // Validate country code if provided
    const countryCode = country || DEFAULT_COUNTRY_CODE;
    if (!SUPPORTED_COUNTRIES[countryCode]) {
      return NextResponse.json(
        { error: `Unsupported country code: ${countryCode}. Supported: ${Object.keys(SUPPORTED_COUNTRIES).join(', ')}` },
        { status: 400 }
      );
    }

    // If locations are provided, validate they're in the selected country
    // If not provided, the scheduler will use the country's default cities
    const countryConfig = SUPPORTED_COUNTRIES[countryCode];
    if (jobData.locations && jobData.locations.length > 0) {
      const invalidLocations = jobData.locations.filter(loc => !countryConfig.cities.includes(loc));
      if (invalidLocations.length > 0) {
        console.warn(`Warning: Some locations may not be in ${countryConfig.name}: ${invalidLocations.join(', ')}`);
        // Don't reject - just warn, as users might add custom locations
      }
    }

    const teamId = session.user.teamId;

    // Schedule the job with country
    const jobId = await scheduleScrapingJob({
      teamId,
      ...jobData,
      country: countryCode,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
    });

    // If requested, run immediately (in background)
    if (runImmediately) {
      // Start the job in the background
      runScrapingJob(jobId).catch((error) => {
        console.error('Background scraping job failed:', error);
      });
    }

    const job = await prisma.scrapingJob.findUnique({
      where: { id: jobId },
    });

    return NextResponse.json(
      {
        success: true,
        job,
        message: runImmediately 
          ? `Scraping job started for ${countryConfig.name}` 
          : `Scraping job scheduled for ${countryConfig.name}`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error scheduling scraping job:', error);
    return NextResponse.json(
      { error: 'Failed to schedule scraping job' },
      { status: 500 }
    );
  }
}
