import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runScrapingJob, SA_CITIES, scheduleScrapingJob, TARGET_CATEGORIES } from '@/lib/scraper/scheduler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for scheduling a scraping job
const scheduleJobSchema = z.object({
  leadsRequested: z.number().min(1).max(100),
  categories: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
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

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '10');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const jobs = await prisma.scrapingJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      jobs,
      availableCategories: TARGET_CATEGORIES,
      availableCities: SA_CITIES,
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
    const { runImmediately, scheduledFor, ...jobData } = scheduleJobSchema.parse(body);

    // Schedule the job
    const jobId = await scheduleScrapingJob({
      ...jobData,
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
          ? 'Scraping job started' 
          : 'Scraping job scheduled',
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
