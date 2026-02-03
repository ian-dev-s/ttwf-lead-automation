/**
 * Job Logger - Real-time logging for scraping jobs
 * Stores logs in memory and allows streaming to clients via SSE
 * 
 * Uses globalThis to persist state across Next.js hot reloads
 */

export interface JobLogEntry {
  timestamp: Date;
  level: 'info' | 'success' | 'warning' | 'error' | 'progress';
  message: string;
  details?: Record<string, unknown>;
}

interface JobLogStore {
  logs: JobLogEntry[];
  listeners: Set<(log: JobLogEntry) => void>;
  maxLogs: number;
}

// Maximum logs to keep per job
const MAX_LOGS_PER_JOB = 500;

// Use globalThis to persist state across Next.js hot reloads
// This ensures the scheduler and SSE endpoint share the same Map
const globalForJobLogs = globalThis as unknown as {
  jobLogs: Map<string, JobLogStore> | undefined;
};

// In-memory store for job logs - persisted across hot reloads
const jobLogs = globalForJobLogs.jobLogs ?? new Map<string, JobLogStore>();
globalForJobLogs.jobLogs = jobLogs;

/**
 * Initialize log store for a job
 */
export function initJobLogs(jobId: string): void {
  if (!jobLogs.has(jobId)) {
    jobLogs.set(jobId, {
      logs: [],
      listeners: new Set(),
      maxLogs: MAX_LOGS_PER_JOB,
    });
  }
}

/**
 * Add a log entry for a job
 */
export function addJobLog(
  jobId: string,
  level: JobLogEntry['level'],
  message: string,
  details?: Record<string, unknown>
): void {
  const store = jobLogs.get(jobId);
  if (!store) {
    initJobLogs(jobId);
    return addJobLog(jobId, level, message, details);
  }

  const entry: JobLogEntry = {
    timestamp: new Date(),
    level,
    message,
    details,
  };

  // Add to logs array
  store.logs.push(entry);
  
  // Debug: Log to console that we added a log
  console.log(`[JobLog] Added log for ${jobId}: [${level}] ${message} (total: ${store.logs.length}, listeners: ${store.listeners.size})`);

  // Trim if too many logs
  if (store.logs.length > store.maxLogs) {
    store.logs.shift();
  }

  // Notify all listeners
  store.listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch (e) {
      // Ignore listener errors
      console.log(`[JobLog] Listener error for ${jobId}:`, e);
    }
  });
}

/**
 * Get all logs for a job
 */
export function getJobLogs(jobId: string): JobLogEntry[] {
  const store = jobLogs.get(jobId);
  return store?.logs || [];
}

/**
 * Subscribe to log updates for a job
 */
export function subscribeToJobLogs(
  jobId: string,
  callback: (log: JobLogEntry) => void
): () => void {
  let store = jobLogs.get(jobId);
  console.log(`[JobLog] Subscribe called for ${jobId}, store exists: ${!!store}, current logs: ${store?.logs.length || 0}`);
  
  if (!store) {
    console.log(`[JobLog] Creating new store for ${jobId} during subscribe`);
    initJobLogs(jobId);
    store = jobLogs.get(jobId)!;
  }

  store.listeners.add(callback);
  console.log(`[JobLog] Added listener for ${jobId}, total listeners: ${store.listeners.size}`);

  // Return unsubscribe function
  return () => {
    console.log(`[JobLog] Removing listener for ${jobId}`);
    store?.listeners.delete(callback);
  };
}

/**
 * Clear logs for a job
 */
export function clearJobLogs(jobId: string): void {
  const store = jobLogs.get(jobId);
  if (store) {
    store.logs = [];
  }
}

/**
 * Remove job logs entirely (cleanup after job completes)
 */
export function removeJobLogs(jobId: string): void {
  jobLogs.delete(jobId);
}

/**
 * Check if a job has any logs
 */
export function hasJobLogs(jobId: string): boolean {
  return jobLogs.has(jobId);
}

/**
 * Get count of active listeners for a job
 */
export function getListenerCount(jobId: string): number {
  const store = jobLogs.get(jobId);
  return store?.listeners.size || 0;
}

// Helper functions for common log types
export const jobLog = {
  info: (jobId: string, message: string, details?: Record<string, unknown>) =>
    addJobLog(jobId, 'info', message, details),
  
  success: (jobId: string, message: string, details?: Record<string, unknown>) =>
    addJobLog(jobId, 'success', message, details),
  
  warning: (jobId: string, message: string, details?: Record<string, unknown>) =>
    addJobLog(jobId, 'warning', message, details),
  
  error: (jobId: string, message: string, details?: Record<string, unknown>) =>
    addJobLog(jobId, 'error', message, details),
  
  progress: (jobId: string, message: string, details?: Record<string, unknown>) =>
    addJobLog(jobId, 'progress', message, details),
};
