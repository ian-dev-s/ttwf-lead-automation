import { auth } from '@/lib/auth';
import { createSubscriber, subscribeToEvents, AppEvent } from '@/lib/events';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/events - Server-Sent Events endpoint
export async function GET(request: NextRequest) {
  // Verify authentication
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let isActive = true;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Helper to safely enqueue messages
      const safeEnqueue = (message: string) => {
        if (!isActive) return false;
        try {
          controller.enqueue(encoder.encode(message));
          return true;
        } catch {
          // Controller closed
          cleanup();
          return false;
        }
      };

      // Cleanup function
      const cleanup = () => {
        isActive = false;
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch {
            // Ignore cleanup errors
          }
          unsubscribe = null;
        }
      };

      // Send initial connection message
      safeEnqueue(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

      // Set up heartbeat to keep connection alive (every 30 seconds)
      heartbeatInterval = setInterval(() => {
        if (!safeEnqueue(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)) {
          cleanup();
        }
      }, 30000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      // Try to connect to Redis for real-time events (non-blocking)
      (async () => {
        if (!isActive) return;
        
        try {
          const subscriber = createSubscriber();
          
          // Wait for connection or timeout
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Redis connection timeout'));
            }, 5000);
            
            subscriber.once('ready', () => {
              clearTimeout(timeout);
              resolve();
            });
            
            subscriber.once('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          });

          if (!isActive) {
            subscriber.quit();
            return;
          }

          unsubscribe = await subscribeToEvents(subscriber, (event: AppEvent) => {
            if (!isActive) return;
            safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
          });

          // Notify client that Redis is connected
          safeEnqueue(`data: ${JSON.stringify({ type: 'redis_connected', timestamp: Date.now() })}\n\n`);
        } catch {
          // Redis not available - that's fine, heartbeats will keep connection alive
          if (isActive) {
            safeEnqueue(`data: ${JSON.stringify({ type: 'redis_unavailable', timestamp: Date.now() })}\n\n`);
          }
        }
      })();
    },
    cancel() {
      isActive = false;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // Ignore
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
