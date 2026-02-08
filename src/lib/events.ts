import Redis from 'ioredis';

// Event types for the application
export type EventType =
  | 'lead:created'
  | 'lead:updated'
  | 'lead:deleted'
  | 'lead:status_changed'
  | 'message:created'
  | 'message:updated'
  | 'message:approved'
  | 'scraper:started'
  | 'scraper:progress'
  | 'scraper:completed'
  | 'scraper:error'
  | 'stats:updated';

export interface AppEvent<T = unknown> {
  type: EventType;
  data: T;
  timestamp: number;
}

export interface LeadEvent {
  id: string;
  businessName?: string;
  status?: string;
  previousStatus?: string;
}

export interface StatsEvent {
  totalLeads?: number;
  newLeads?: number;
  qualifiedLeads?: number;
  contactedLeads?: number;
  convertedLeads?: number;
  pendingMessages?: number;
  weeklyLeads?: number;
}

export interface ScraperEvent {
  jobId: string;
  progress?: number;
  leadsFound?: number;
  message?: string;
  error?: string;
}

const CHANNEL = 'app:events';

// Create Redis clients for pub/sub
// Publisher client - for sending events
let publisherClient: Redis | null = null;
let publisherConnecting = false;
let publisherReady: Promise<Redis | null> | null = null;

// Get or create publisher client - waits for connection to be ready
async function getPublisher(): Promise<Redis | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }
  
  // If we already have a ready publisher, return it
  if (publisherClient && publisherClient.status === 'ready') {
    return publisherClient;
  }
  
  // If we're already waiting for connection, wait for that to complete
  if (publisherReady) {
    return publisherReady;
  }
  
  // Create the promise that will resolve when connected
  publisherReady = new Promise<Redis | null>((resolve) => {
    // Start connecting if not already
    if (!publisherClient && !publisherConnecting) {
      publisherConnecting = true;
      
      publisherClient = new Redis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
        lazyConnect: false, // Connect immediately
        enableOfflineQueue: true, // Queue commands while connecting
        retryStrategy: (times) => {
          if (times > 5) return null;
          return Math.min(times * 1000, 5000);
        },
      });
      
      publisherClient.on('error', (err) => {
        console.error('[Events] Publisher Redis error:', err.message);
      });
      
      publisherClient.on('close', () => {
        console.log('[Events] Publisher Redis disconnected');
        // Reset state so we can reconnect
        publisherConnecting = false;
        publisherReady = null;
      });
      
      publisherClient.on('end', () => {
        console.log('[Events] Publisher Redis connection ended');
        publisherClient = null;
        publisherConnecting = false;
        publisherReady = null;
      });
    }
    
    if (!publisherClient) {
      resolve(null);
      return;
    }
    
    // If already ready, resolve immediately
    if (publisherClient.status === 'ready') {
      console.log('[Events] Publisher Redis already connected');
      resolve(publisherClient);
      return;
    }
    
    // Wait for ready event with timeout
    const timeout = setTimeout(() => {
      console.log('[Events] Publisher connection timeout after 3s');
      resolve(null);
    }, 3000);
    
    const onReady = () => {
      clearTimeout(timeout);
      console.log('[Events] Publisher Redis connected');
      resolve(publisherClient);
    };
    
    const onError = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    
    publisherClient.once('ready', onReady);
    publisherClient.once('error', onError);
  });
  
  return publisherReady;
}

// Create a new subscriber client (each SSE connection needs its own)
export function createSubscriber(): Redis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log('[Events] Creating subscriber client...');
  
  const subscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: false,
    enableOfflineQueue: false,
    retryStrategy: () => null, // Don't retry - let the caller handle it
  });
  
  subscriber.on('ready', () => {
    console.log('[Events] Subscriber Redis connected');
  });
  
  subscriber.on('error', (err) => {
    console.error('[Events] Subscriber Redis error:', err.message);
  });
  
  return subscriber;
}

// Publish an event (fire and forget - don't block if Redis is down)
// When teamId is provided, external notifications (Telegram, Slack, etc.) are also dispatched.
export async function publishEvent<T>(type: EventType, data: T, teamId?: string): Promise<void> {
  const event: AppEvent<T> = {
    type,
    data,
    timestamp: Date.now(),
  };

  try {
    const publisher = await getPublisher();
    if (!publisher) {
      console.log(`[Events] No publisher available, skipping event: ${type}`);
    } else if (publisher.status !== 'ready') {
      console.log(`[Events] Redis not ready (status: ${publisher.status}), skipping event: ${type}`);
    } else {
      // Use a short timeout to avoid blocking
      await Promise.race([
        publisher.publish(CHANNEL, JSON.stringify(event)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
      ]);
      console.log(`[Events] Published event: ${type}`);
    }
  } catch (err) {
    // Log but don't throw - real-time updates are optional
    console.error(`[Events] Failed to publish event ${type}:`, err instanceof Error ? err.message : err);
  }

  // Dispatch to external notification providers (non-blocking)
  if (teamId) {
    import('@/lib/notifications/manager').then(({ notify }) => {
      notify(teamId, event).catch((err) => {
        console.error(`[Events] Notification dispatch error for ${type}:`, err);
      });
    }).catch(() => {
      // Ignore dynamic import failures
    });
  }
}

// Subscribe to events (returns unsubscribe function)
export async function subscribeToEvents(
  subscriber: Redis,
  callback: (event: AppEvent) => void
): Promise<() => void> {
  await subscriber.subscribe(CHANNEL);
  
  const messageHandler = (channel: string, message: string) => {
    if (channel === CHANNEL) {
      try {
        const event = JSON.parse(message) as AppEvent;
        callback(event);
      } catch {
        // Ignore parse errors
      }
    }
  };
  
  subscriber.on('message', messageHandler);
  
  return () => {
    try {
      subscriber.unsubscribe(CHANNEL);
      subscriber.removeListener('message', messageHandler);
      subscriber.quit();
    } catch {
      // Ignore cleanup errors
    }
  };
}

// Helper functions for common events
// Each helper accepts an optional trailing `teamId` to trigger external notifications.
export const events = {
  leadCreated: (lead: LeadEvent, teamId?: string) =>
    publishEvent('lead:created', lead, teamId),
  leadUpdated: (lead: LeadEvent, teamId?: string) =>
    publishEvent('lead:updated', lead, teamId),
  leadDeleted: (id: string, teamId?: string) =>
    publishEvent('lead:deleted', { id }, teamId),
  leadStatusChanged: (lead: LeadEvent, teamId?: string) =>
    publishEvent('lead:status_changed', lead, teamId),
  messageCreated: (messageId: string, leadId: string, teamId?: string) =>
    publishEvent('message:created', { messageId, leadId }, teamId),
  messageUpdated: (messageId: string, teamId?: string) =>
    publishEvent('message:updated', { messageId }, teamId),
  messageApproved: (messageId: string, data?: Record<string, unknown>, teamId?: string) =>
    publishEvent('message:approved', { messageId, ...data }, teamId),
  scraperStarted: (event: ScraperEvent, teamId?: string) =>
    publishEvent('scraper:started', event, teamId),
  scraperProgress: (event: ScraperEvent, teamId?: string) =>
    publishEvent('scraper:progress', event, teamId),
  scraperCompleted: (event: ScraperEvent, teamId?: string) =>
    publishEvent('scraper:completed', event, teamId),
  scraperError: (event: ScraperEvent, teamId?: string) =>
    publishEvent('scraper:error', event, teamId),
  statsUpdated: (stats: StatsEvent) =>
    publishEvent('stats:updated', stats),
};

// Initialize publisher eagerly on module load (non-blocking)
// This ensures the publisher is ready when events need to be published
if (typeof window === 'undefined' && process.env.REDIS_URL) {
  getPublisher().catch(() => {
    // Ignore errors - publisher will retry when needed
  });
}
