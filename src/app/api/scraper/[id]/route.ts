import { auth } from '@/lib/auth';
import { scrapingJobDoc } from '@/lib/firebase/collections';
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

    const teamId = session.user.teamId;

    const jobDoc = await scrapingJobDoc(teamId, params.id).get();

    if (!jobDoc.exists) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = { id: jobDoc.id, ...jobDoc.data() };

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

    const teamId = session.user.teamId;

    const jobDoc = await scrapingJobDoc(teamId, params.id).get();

    if (!jobDoc.exists) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = { id: jobDoc.id, ...jobDoc.data() };

    // If job is running, cancel it first
    if (job.status === 'RUNNING') {
      await cancelJob(teamId, params.id);
      console.log(`Cancelled running job: ${params.id}`);
    }

    // Delete the job
    await deleteJob(teamId, params.id);
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

    // Parse body safely - default to cancel action if body is empty
    let body: { action?: string } = { action: 'cancel' };
    try {
      const text = await request.text();
      if (text && text.trim()) {
        body = JSON.parse(text);
      }
    } catch {
      // If JSON parsing fails, default to cancel action
      body = { action: 'cancel' };
    }
    
    const teamId = session.user.teamId;

    if (body.action === 'cancel') {
      const jobDoc = await scrapingJobDoc(teamId, params.id).get();

      if (!jobDoc.exists) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      const job = { id: jobDoc.id, ...jobDoc.data() };

      // Allow cancelling RUNNING or SCHEDULED jobs
      if (job.status !== 'RUNNING' && job.status !== 'SCHEDULED') {
        return NextResponse.json(
          { error: 'Job is not running or scheduled' },
          { status: 400 }
        );
      }

      // For SCHEDULED jobs that haven't started, just update the DB directly
      // Mark as COMPLETED (cancelled jobs are considered complete)
      if (job.status === 'SCHEDULED') {
        await scrapingJobDoc(teamId, params.id).update({
          status: 'COMPLETED',
          completedAt: new Date(),
          error: 'Job cancelled by user before starting',
        });
        console.log(`Cancelled scheduled job: ${params.id} (marked as COMPLETED)`);
        return NextResponse.json({
          success: true,
          message: 'Scheduled job cancelled',
        });
      }

      // For RUNNING jobs, use the full cancellation flow
      console.log(`[API] Calling cancelJob for ${params.id}...`);
      try {
        const cancelled = await cancelJob(teamId, params.id);
        console.log(`[API] cancelJob returned: ${cancelled}`);
        
        if (cancelled) {
          return NextResponse.json({
            success: true,
            message: 'Job cancelled',
          });
        } else {
          console.error(`[API] cancelJob returned false for ${params.id}`);
          return NextResponse.json(
            { error: 'Failed to cancel job' },
            { status: 500 }
          );
        }
      } catch (cancelError) {
        console.error(`[API] cancelJob threw error for ${params.id}:`, cancelError);
        return NextResponse.json(
          { error: 'Failed to cancel job: ' + (cancelError instanceof Error ? cancelError.message : 'Unknown error') },
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
