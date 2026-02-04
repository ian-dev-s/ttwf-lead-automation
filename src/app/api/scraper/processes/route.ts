import { auth } from '@/lib/auth';
import { 
  getProcessStatus, 
  killAllScraperProcesses, 
  processManager 
} from '@/lib/scraper/scheduler';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/scraper/processes - Get status of running scraper processes
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getProcessStatus();
    
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Error getting process status:', error);
    return NextResponse.json(
      { error: 'Failed to get process status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scraper/processes - Kill all scraper processes
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can kill processes
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can kill scraper processes' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const killAll = url.searchParams.get('all') === 'true';
    
    let result;
    if (killAll) {
      // Kill ALL headless browsers (use with caution)
      result = await processManager.killAllHeadless();
      return NextResponse.json({
        success: true,
        message: `Killed ${result.killed} headless browser process(es)`,
        ...result,
      });
    } else {
      // Kill only our tracked scraper processes
      result = await killAllScraperProcesses();
      return NextResponse.json({
        success: true,
        message: `Killed ${result.killed} scraper process(es)`,
        ...result,
      });
    }
  } catch (error) {
    console.error('Error killing processes:', error);
    return NextResponse.json(
      { error: 'Failed to kill processes' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scraper/processes/kill/:pid - Kill a specific process
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can kill processes
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only administrators can kill processes' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { pid } = body;
    
    if (!pid || typeof pid !== 'number') {
      return NextResponse.json(
        { error: 'Invalid PID provided' },
        { status: 400 }
      );
    }

    const success = await processManager.killProcess(pid);
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: `Killed process ${pid}`,
      });
    } else {
      return NextResponse.json(
        { error: `Failed to kill process ${pid}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error killing process:', error);
    return NextResponse.json(
      { error: 'Failed to kill process' },
      { status: 500 }
    );
  }
}
