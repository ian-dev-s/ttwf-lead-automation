import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cancelJob, deleteJob } from '@/lib/scraper/scheduler';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/scraper/[id] - Get a specific scraping job
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const job = await prisma.scrapingJob.findUnique({
      where: { id: params.id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error('Error fetching scraping job:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scraping job' },
      { status: 500 }
    );
  }
}

// DELETE /api/scraper/[id] - Cancel and delete a scraping job
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete scraping jobs
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can delete scraping jobs' },
        { status: 403 }
      );
    }

    const job = await prisma.scrapingJob.findUnique({
      where: { id: params.id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // If job is running, cancel it first
    if (job.status === 'RUNNING') {
      await cancelJob(params.id);
      console.log(`Cancelled running job: ${params.id}`);
    }

    // Delete the job
    await deleteJob(params.id);
    console.log(`Deleted job: ${params.id}`);

    return NextResponse.json({
      success: true,
      message: job.status === 'RUNNING' 
        ? 'Job cancelled and deleted' 
        : 'Job deleted',
    });
  } catch (error) {
    console.error('Error deleting scraping job:', error);
    return NextResponse.json(
      { error: 'Failed to delete scraping job' },
      { status: 500 }
    );
  }
}

// PATCH /api/scraper/[id] - Cancel a running job (without deleting)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can cancel scraping jobs
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can cancel scraping jobs' },
        { status: 403 }
      );
    }

    const body = await request.json();
    
    if (body.action === 'cancel') {
      const job = await prisma.scrapingJob.findUnique({
        where: { id: params.id },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      if (job.status !== 'RUNNING') {
        return NextResponse.json(
          { error: 'Job is not running' },
          { status: 400 }
        );
      }

      const cancelled = await cancelJob(params.id);
      
      if (cancelled) {
        return NextResponse.json({
          success: true,
          message: 'Job cancelled',
        });
      } else {
        return NextResponse.json(
          { error: 'Failed to cancel job' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating scraping job:', error);
    return NextResponse.json(
      { error: 'Failed to update scraping job' },
      { status: 500 }
    );
  }
}
