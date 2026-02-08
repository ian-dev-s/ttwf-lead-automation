/**
 * Cancellation Token System
 * 
 * Provides a way to signal cancellation to all parts of a scraping job.
 * Works similar to .NET's CancellationToken pattern.
 */

// Store for active cancellation tokens by job ID
const cancellationTokens = new Map<string, CancellationToken>();

/**
 * Custom error thrown when a job is cancelled
 */
export class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = 'JobCancelledError';
  }
}

/**
 * Cancellation Token - passed to functions to check for cancellation
 */
export class CancellationToken {
  private _isCancelled: boolean = false;
  private readonly jobId: string;
  private abortController: AbortController;

  constructor(jobId: string) {
    this.jobId = jobId;
    this.abortController = new AbortController();
  }

  /**
   * Check if cancellation has been requested
   */
  get isCancelled(): boolean {
    return this._isCancelled;
  }

  /**
   * Get the job ID this token belongs to
   */
  get id(): string {
    return this.jobId;
  }

  /**
   * Get an AbortSignal for fetch requests
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Trigger cancellation
   */
  cancel(): void {
    if (!this._isCancelled) {
      this._isCancelled = true;
      this.abortController.abort();
      console.log(`🛑 [CancellationToken] Job ${this.jobId} cancellation triggered`);
    }
  }

  /**
   * Throw if cancelled - use this at checkpoint locations
   */
  throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new JobCancelledError(this.jobId);
    }
  }

  /**
   * Check cancellation and return true if should stop
   */
  shouldStop(): boolean {
    return this._isCancelled;
  }
}

/**
 * Create a new cancellation token for a job
 */
export function createCancellationToken(jobId: string): CancellationToken {
  // Clean up any existing token for this job
  const existing = cancellationTokens.get(jobId);
  if (existing) {
    existing.cancel();
  }
  
  const token = new CancellationToken(jobId);
  cancellationTokens.set(jobId, token);
  return token;
}

/**
 * Get the cancellation token for a job
 */
export function getCancellationToken(jobId: string): CancellationToken | undefined {
  return cancellationTokens.get(jobId);
}

/**
 * Cancel a job by ID
 */
export function cancelJobToken(jobId: string): boolean {
  const token = cancellationTokens.get(jobId);
  if (token) {
    token.cancel();
    return true;
  }
  return false;
}

/**
 * Remove a cancellation token (cleanup after job completes)
 */
export function removeCancellationToken(jobId: string): void {
  cancellationTokens.delete(jobId);
}

/**
 * Check if a job is cancelled
 */
export function isJobCancelled(jobId: string): boolean {
  const token = cancellationTokens.get(jobId);
  return token?.isCancelled ?? false;
}

/**
 * Helper to wrap async operations with cancellation check
 */
export async function withCancellation<T>(
  token: CancellationToken | undefined,
  operation: () => Promise<T>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _operationName: string = 'operation'
): Promise<T> {
  // Check before starting
  if (token?.isCancelled) {
    throw new JobCancelledError(token.id);
  }
  
  try {
    const result = await operation();
    
    // Check after completing
    if (token?.isCancelled) {
      throw new JobCancelledError(token.id);
    }
    
    return result;
  } catch (error) {
    // If it's already a cancellation error, rethrow
    if (error instanceof JobCancelledError) {
      throw error;
    }
    
    // Check if abort was triggered
    if (error instanceof Error && error.name === 'AbortError') {
      throw new JobCancelledError(token?.id || 'unknown');
    }
    
    // Check if cancelled during operation
    if (token?.isCancelled) {
      throw new JobCancelledError(token.id);
    }
    
    // Otherwise rethrow original error
    throw error;
  }
}

/**
 * Sleep with cancellation support
 */
export async function sleepWithCancellation(
  ms: number, 
  token?: CancellationToken
): Promise<void> {
  if (token?.isCancelled) {
    throw new JobCancelledError(token.id);
  }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (token?.isCancelled) {
        reject(new JobCancelledError(token.id));
      } else {
        resolve();
      }
    }, ms);
    
    // If token gets cancelled during sleep, reject immediately
    if (token) {
      const checkInterval = setInterval(() => {
        if (token.isCancelled) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          reject(new JobCancelledError(token.id));
        }
      }, 100); // Check every 100ms
      
      // Clean up interval when sleep completes
      setTimeout(() => clearInterval(checkInterval), ms + 100);
    }
  });
}

/**
 * Fetch with cancellation support
 */
export async function fetchWithCancellation(
  url: string,
  options: RequestInit = {},
  token?: CancellationToken
): Promise<Response> {
  if (token?.isCancelled) {
    throw new JobCancelledError(token.id);
  }
  
  // Merge our abort signal with any existing one
  const controller = new AbortController();
  
  // If token is cancelled, abort immediately
  if (token) {
    // Check periodically if token is cancelled
    const checkInterval = setInterval(() => {
      if (token.isCancelled) {
        controller.abort();
        clearInterval(checkInterval);
      }
    }, 100);
    
    // Clean up after fetch completes (success or failure)
    setTimeout(() => clearInterval(checkInterval), 60000);
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    if (token?.isCancelled) {
      throw new JobCancelledError(token.id);
    }
    
    return response;
  } catch (error) {
    if (token?.isCancelled) {
      throw new JobCancelledError(token.id);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new JobCancelledError(token?.id || 'unknown');
    }
    throw error;
  }
}
