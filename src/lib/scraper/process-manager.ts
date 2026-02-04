/**
 * Process Manager for Lead Gen Scraper
 * 
 * Tracks and manages spawned browser processes across all operating systems.
 * 
 * SAFETY FEATURES:
 * 1. Unique --scraper-id flag to identify our processes
 * 2. JOB-SPECIFIC identifier (--job-id) to track processes per job
 * 3. PID tracking with command line hash for validation
 * 4. Persistent storage in database for crash recovery
 * 5. Safe kill - validates process is ours before terminating
 * 6. Cross-platform process management
 * 
 * KEY PRINCIPLE:
 * Every browser launched includes both:
 * - --scraper-id=ttwf-lead-gen-scraper-v1 (identifies all our processes)
 * - --job-id=<jobId> (identifies processes for a specific job)
 * 
 * This allows us to:
 * - Find ALL our Chrome processes system-wide
 * - Find processes for a SPECIFIC job (even after server restart)
 * - Safely kill only processes we started
 */

import { exec } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Unique identifier for our scraper processes - use a very specific string
// This appears in the command line args and can be detected in process listings
export const SCRAPER_PROCESS_ID = 'ttwf-lead-gen-scraper-v1';
export const SCRAPER_USER_DATA_DIR = path.join(os.tmpdir(), SCRAPER_PROCESS_ID);

/**
 * Process info stored for each spawned browser
 */
export interface TrackedProcessInfo {
  pid: number;
  jobId: string;
  startedAt: string;
  commandLineHash: string; // Hash of command line for validation
  commandLine?: string; // Full command line for debugging
}

// Track spawned browser PIDs globally (in-memory)
const spawnedPids = new Set<number>();

// Track PIDs per job for targeted cancellation (in-memory)
const jobPids = new Map<string, Set<number>>();

// Track full process info for validation
const processInfoMap = new Map<number, TrackedProcessInfo>();

// Cache for process status to avoid hitting the system too frequently
let processStatusCache: {
  data: Awaited<ReturnType<typeof countRunningScraperProcesses>> | null;
  timestamp: number;
} = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 5000; // 5 second cache

/**
 * Generate a hash of the command line for validation
 */
function hashCommandLine(commandLine: string): string {
  // Extract the key identifying parts (scraper ID, headless flags)
  const normalized = commandLine.toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Register a spawned browser PID with full tracking info
 */
export function registerBrowserPid(pid: number, jobId?: string, commandLine?: string): void {
  spawnedPids.add(pid);
  
  const info: TrackedProcessInfo = {
    pid,
    jobId: jobId || 'unknown',
    startedAt: new Date().toISOString(),
    commandLineHash: commandLine ? hashCommandLine(commandLine) : '',
  };
  
  processInfoMap.set(pid, info);
  
  // Also track by job if provided
  if (jobId) {
    if (!jobPids.has(jobId)) {
      jobPids.set(jobId, new Set());
    }
    jobPids.get(jobId)!.add(pid);
    console.log(`[ProcessManager] Registered browser PID: ${pid} for job: ${jobId}`);
  } else {
    console.log(`[ProcessManager] Registered browser PID: ${pid}`);
  }
  
  invalidateProcessCache(); // New process, invalidate cache
}

/**
 * Get tracked process info for a PID
 */
export function getProcessInfo(pid: number): TrackedProcessInfo | undefined {
  return processInfoMap.get(pid);
}

/**
 * Get all tracked process info for a job (for persistence)
 */
export function getJobProcessInfo(jobId: string): TrackedProcessInfo[] {
  const pids = jobPids.get(jobId);
  if (!pids) return [];
  
  return Array.from(pids)
    .map(pid => processInfoMap.get(pid))
    .filter((info): info is TrackedProcessInfo => info !== undefined);
}

/**
 * Restore process tracking from persisted data (e.g., after server restart)
 */
export function restoreProcessTracking(processes: TrackedProcessInfo[]): void {
  for (const info of processes) {
    spawnedPids.add(info.pid);
    processInfoMap.set(info.pid, info);
    
    if (info.jobId && info.jobId !== 'unknown') {
      if (!jobPids.has(info.jobId)) {
        jobPids.set(info.jobId, new Set());
      }
      jobPids.get(info.jobId)!.add(info.pid);
    }
  }
  invalidateProcessCache();
  console.log(`[ProcessManager] Restored tracking for ${processes.length} processes`);
}

/**
 * Unregister a browser PID (after it's closed)
 */
export function unregisterBrowserPid(pid: number, jobId?: string): void {
  spawnedPids.delete(pid);
  processInfoMap.delete(pid);
  
  // Remove from job tracking if provided
  if (jobId && jobPids.has(jobId)) {
    jobPids.get(jobId)!.delete(pid);
  } else {
    // Remove from all jobs if no specific job provided
    const allJobPids = Array.from(jobPids.values());
    for (const pids of allJobPids) {
      pids.delete(pid);
    }
  }
  
  invalidateProcessCache(); // Process gone, invalidate cache
  console.log(`[ProcessManager] Unregistered browser PID: ${pid}`);
}

/**
 * Get all registered PIDs
 */
export function getRegisteredPids(): number[] {
  return Array.from(spawnedPids);
}

/**
 * Get PIDs registered for a specific job
 */
export function getJobPids(jobId: string): number[] {
  return Array.from(jobPids.get(jobId) || []);
}

/**
 * Clear all PIDs for a specific job
 */
export function clearJobPids(jobId: string): void {
  const pids = jobPids.get(jobId);
  if (pids) {
    const pidArray = Array.from(pids);
    for (const pid of pidArray) {
      spawnedPids.delete(pid);
      processInfoMap.delete(pid);
    }
    jobPids.delete(jobId);
    invalidateProcessCache();
    console.log(`[ProcessManager] Cleared all PIDs for job: ${jobId}`);
  }
}

/**
 * Get the current OS type
 */
export function getOsType(): 'windows' | 'macos' | 'linux' {
  const platform = os.platform();
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

/**
 * Process info structure
 */
export interface ScraperProcessInfo {
  pid: number;
  name: string;
  commandLine?: string;
  isOurProcess: boolean;
}

/**
 * Count running scraper browser processes
 * Looks for Chrome processes with our unique identifier
 * Uses caching to avoid hitting the system too frequently
 */
export async function countRunningScraperProcesses(skipCache: boolean = false): Promise<{
  total: number;
  registered: number;
  orphaned: number;
  processes: ScraperProcessInfo[];
}> {
  // Return cached result if still valid
  const now = Date.now();
  if (!skipCache && processStatusCache.data && (now - processStatusCache.timestamp) < CACHE_TTL_MS) {
    return processStatusCache.data;
  }
  
  const osType = getOsType();
  const processes: ScraperProcessInfo[] = [];
  
  try {
    let output = '';
    
    if (osType === 'windows') {
      // Windows: Use PowerShell Get-CimInstance (wmic is deprecated)
      // Use -EncodedCommand to avoid shell escaping issues with $_ variable
      const psScript = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -or $_.Name -like '*chromium*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;
      const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      output = stdout.trim();
      
      // Parse PowerShell JSON output
      // Note: PowerShell may include CLIXML prefix/suffix, so we need to extract the JSON
      if (output && output !== '') {
        try {
          // Extract JSON from output (it may be wrapped in CLIXML)
          let jsonStr = '';
          const jsonStart = output.indexOf('[');
          const jsonEnd = output.lastIndexOf(']');
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            jsonStr = output.substring(jsonStart, jsonEnd + 1);
          } else {
            // Try to find a single object
            const objStart = output.indexOf('{');
            const objEnd = output.lastIndexOf('}');
            if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
              jsonStr = output.substring(objStart, objEnd + 1);
            }
          }
          
          // If no JSON found, skip parsing (no Chrome processes running)
          if (!jsonStr) {
            console.log('[ProcessManager] No Chrome processes found in output');
          } else {
            const parsed = JSON.parse(jsonStr);
            // Handle both single object and array
            const items = Array.isArray(parsed) ? parsed : [parsed];
            
            for (const item of items) {
              if (item && item.ProcessId) {
                const pid = item.ProcessId;
                const commandLine = item.CommandLine || '';
                // STRICT identification: must have our exact scraper ID in command line
                // OR be a registered PID (we spawned it)
                const isOurs = commandLine.includes(SCRAPER_PROCESS_ID) || spawnedPids.has(pid);
                processes.push({
                  pid,
                  name: 'chrome',
                  commandLine,
                  isOurProcess: isOurs,
                });
              }
            }
          }
        } catch (parseError) {
          console.log('[ProcessManager] Failed to parse PowerShell output:', parseError);
        }
      }
    } else if (osType === 'macos') {
      // macOS: Use ps with full command
      const { stdout } = await execAsync(
        `ps aux | grep -E "chrome|chromium|Chromium" | grep -v grep`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      output = stdout;
      
      // Parse macOS output
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          const pid = parseInt(parts[1]);
          const commandLine = parts.slice(10).join(' ');
          if (!isNaN(pid)) {
            // STRICT identification: must have our exact scraper ID or be registered
            const isOurs = commandLine.includes(SCRAPER_PROCESS_ID) || spawnedPids.has(pid);
            processes.push({
              pid,
              name: parts[10],
              commandLine,
              isOurProcess: isOurs,
            });
          }
        }
      }
    } else {
      // Linux: Use ps with full command
      const { stdout } = await execAsync(
        `ps aux | grep -E "chrome|chromium" | grep -v grep`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      output = stdout;
      
      // Parse Linux output
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          const pid = parseInt(parts[1]);
          const commandLine = parts.slice(10).join(' ');
          if (!isNaN(pid)) {
            // STRICT identification: must have our exact scraper ID or be registered
            const isOurs = commandLine.includes(SCRAPER_PROCESS_ID) || spawnedPids.has(pid);
            processes.push({
              pid,
              name: parts[10],
              commandLine,
              isOurProcess: isOurs,
            });
          }
        }
      }
    }
  } catch (error) {
    // No processes found or command failed
    console.log('[ProcessManager] No scraper processes found or error:', error);
  }
  
  const ourProcesses = processes.filter(p => p.isOurProcess);
  const registeredPids = getRegisteredPids();
  
  const result = {
    total: ourProcesses.length,
    registered: registeredPids.length,
    orphaned: ourProcesses.filter(p => !registeredPids.includes(p.pid)).length,
    processes: ourProcesses,
  };
  
  // Update cache
  processStatusCache = { data: result, timestamp: Date.now() };
  
  return result;
}

/**
 * Invalidate the process status cache
 * Call this after killing processes or spawning new ones
 */
export function invalidateProcessCache(): void {
  processStatusCache = { data: null, timestamp: 0 };
}

/**
 * Validate that a process is safe to kill (is our scraper process)
 * Returns the process info if valid, null if not safe to kill
 */
export async function validateProcessForKill(pid: number): Promise<{
  isValid: boolean;
  reason: string;
  processName?: string;
  commandLine?: string;
}> {
  const osType = getOsType();
  
  try {
    let processName = '';
    let commandLine = '';
    
    if (osType === 'windows') {
      // Get process details using PowerShell with encoded command to avoid escaping issues
      const psScript = `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object Name, CommandLine | ConvertTo-Json -Compress`;
      const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`,
        { maxBuffer: 1024 * 1024 }
      );
      
      if (!stdout.trim()) {
        return { isValid: false, reason: 'Process not found' };
      }
      
      // Extract JSON from output (it may be wrapped in CLIXML)
      let jsonStr = stdout.trim();
      const objStart = jsonStr.indexOf('{');
      const objEnd = jsonStr.lastIndexOf('}');
      if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
        jsonStr = jsonStr.substring(objStart, objEnd + 1);
      }
      
      if (!jsonStr || jsonStr === '') {
        return { isValid: false, reason: 'Process not found (empty response)' };
      }
      
      const parsed = JSON.parse(jsonStr);
      processName = parsed.Name || '';
      commandLine = parsed.CommandLine || '';
    } else {
      // Unix: Use ps to get process info
      const { stdout } = await execAsync(`ps -p ${pid} -o comm=,args=`);
      const parts = stdout.trim().split(/\s+/);
      processName = parts[0] || '';
      commandLine = parts.slice(1).join(' ');
    }
    
    // Validation checks:
    // 1. Must be a Chrome/Chromium process
    const isChrome = /chrome|chromium/i.test(processName);
    if (!isChrome) {
      return { 
        isValid: false, 
        reason: `Not a Chrome process (found: ${processName})`,
        processName,
        commandLine 
      };
    }
    
    // 2. Must have our scraper ID in command line OR be in our registered PIDs
    const hasScraperId = commandLine.includes(SCRAPER_PROCESS_ID);
    const isRegistered = spawnedPids.has(pid);
    
    if (!hasScraperId && !isRegistered) {
      return { 
        isValid: false, 
        reason: 'Process does not have our scraper ID and is not registered',
        processName,
        commandLine 
      };
    }
    
    // 3. If we have stored info, validate the command line hash matches
    const storedInfo = processInfoMap.get(pid);
    if (storedInfo && storedInfo.commandLineHash) {
      const currentHash = hashCommandLine(commandLine);
      if (currentHash !== storedInfo.commandLineHash) {
        return { 
          isValid: false, 
          reason: 'Command line hash mismatch - PID may have been reused',
          processName,
          commandLine 
        };
      }
    }
    
    return { 
      isValid: true, 
      reason: 'Process validated as our scraper',
      processName,
      commandLine 
    };
    
  } catch (error) {
    // Process doesn't exist or can't be queried
    return { 
      isValid: false, 
      reason: `Cannot validate process: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Kill a specific process by PID (cross-platform)
 * SAFE: Validates the process is ours before killing
 * On Windows, uses /T flag to kill the entire process tree
 */
export async function killProcess(pid: number, skipValidation: boolean = false): Promise<boolean> {
  const osType = getOsType();
  
  // SAFETY: Validate the process before killing
  if (!skipValidation) {
    const validation = await validateProcessForKill(pid);
    if (!validation.isValid) {
      console.warn(`[ProcessManager] REFUSED to kill PID ${pid}: ${validation.reason}`);
      // Still unregister from our tracking since we won't kill it
      unregisterBrowserPid(pid);
      return false;
    }
    console.log(`[ProcessManager] Validated PID ${pid}: ${validation.reason}`);
  }
  
  try {
    if (osType === 'windows') {
      // /F = Force, /T = Kill process tree (all child processes)
      await execAsync(`taskkill /F /T /PID ${pid}`);
    } else {
      // On Unix, kill the process group if possible
      try {
        await execAsync(`kill -9 -${pid}`); // Kill process group
      } catch {
        await execAsync(`kill -9 ${pid}`); // Fallback to single process
      }
    }
    
    unregisterBrowserPid(pid);
    invalidateProcessCache(); // Invalidate cache after killing
    console.log(`[ProcessManager] Killed process ${pid}`);
    return true;
  } catch (error) {
    console.error(`[ProcessManager] Failed to kill process ${pid}:`, error);
    // Still unregister since the process is likely gone
    unregisterBrowserPid(pid);
    return false;
  }
}

/**
 * Safely kill all processes for a specific job
 * Validates each process before killing
 */
export async function killJobProcesses(jobId: string): Promise<{
  killed: number;
  refused: number;
  notFound: number;
  pids: number[];
}> {
  console.log(`[ProcessManager] killJobProcesses called for job ${jobId}`);
  const pids = getJobPids(jobId);
  const results = { killed: 0, refused: 0, notFound: 0, pids: [] as number[] };
  
  console.log(`[ProcessManager] Found ${pids.length} PIDs for job ${jobId}: ${pids.join(', ')}`);
  
  for (const pid of pids) {
    console.log(`[ProcessManager] Validating process ${pid}...`);
    try {
      const validation = await validateProcessForKill(pid);
      console.log(`[ProcessManager] Validation result for ${pid}: isValid=${validation.isValid}, reason=${validation.reason}`);
      
      if (!validation.isValid) {
        if (validation.reason.includes('not found') || validation.reason.includes('Cannot validate')) {
          results.notFound++;
          console.log(`[ProcessManager] Process ${pid} not found (already terminated)`);
        } else {
          results.refused++;
          console.warn(`[ProcessManager] REFUSED to kill ${pid}: ${validation.reason}`);
        }
        unregisterBrowserPid(pid, jobId);
        continue;
      }
      
      console.log(`[ProcessManager] Killing process ${pid}...`);
      const killed = await killProcess(pid, true); // Skip validation since we just did it
      console.log(`[ProcessManager] Kill result for ${pid}: ${killed}`);
      if (killed) {
        results.killed++;
        results.pids.push(pid);
      }
    } catch (error) {
      console.error(`[ProcessManager] Error processing PID ${pid}:`, error);
      results.notFound++;
      unregisterBrowserPid(pid, jobId);
    }
  }
  
  // Clear job tracking
  clearJobPids(jobId);
  
  console.log(`[ProcessManager] Job ${jobId} cleanup complete: killed=${results.killed}, refused=${results.refused}, notFound=${results.notFound}`);
  return results;
}

/**
 * Kill all scraper browser processes (cross-platform)
 */
export async function killAllScraperProcesses(): Promise<{
  killed: number;
  failed: number;
  pids: number[];
}> {
  const { processes } = await countRunningScraperProcesses();
  const results = { killed: 0, failed: 0, pids: [] as number[] };
  
  for (const proc of processes) {
    const success = await killProcess(proc.pid);
    if (success) {
      results.killed++;
      results.pids.push(proc.pid);
    } else {
      results.failed++;
    }
  }
  
  // Also kill any registered PIDs that weren't found in the process list
  for (const pid of getRegisteredPids()) {
    if (!results.pids.includes(pid)) {
      const success = await killProcess(pid);
      if (success) {
        results.killed++;
        results.pids.push(pid);
      }
    }
  }
  
  // Clear the registered PIDs
  spawnedPids.clear();
  invalidateProcessCache(); // Invalidate cache after killing
  
  console.log(`[ProcessManager] Killed ${results.killed} processes, ${results.failed} failed`);
  return results;
}

/**
 * Kill all Chrome/Chromium headless processes on the system
 * Use with caution - this kills ALL headless browsers, not just ours
 */
export async function killAllHeadlessBrowsers(): Promise<{
  killed: number;
  failed: number;
}> {
  const osType = getOsType();
  const results = { killed: 0, failed: 0 };
  
  try {
    if (osType === 'windows') {
      // Windows: Kill by process name patterns
      const commands = [
        'taskkill /F /IM "chrome-headless-shell.exe"',
        'taskkill /F /IM "chromium.exe" /FI "WINDOWTITLE eq "',
      ];
      
      for (const cmd of commands) {
        try {
          await execAsync(cmd);
          results.killed++;
        } catch {
          // Process might not exist
        }
      }
    } else if (osType === 'macos') {
      // macOS: Use pkill
      try {
        await execAsync('pkill -9 -f "chrome.*--headless"');
        results.killed++;
      } catch {
        // No processes found
      }
      try {
        await execAsync('pkill -9 -f "chromium.*--headless"');
        results.killed++;
      } catch {
        // No processes found
      }
    } else {
      // Linux: Use pkill
      try {
        await execAsync('pkill -9 -f "chrome.*--headless"');
        results.killed++;
      } catch {
        // No processes found
      }
      try {
        await execAsync('pkill -9 -f "chromium.*--headless"');
        results.killed++;
      } catch {
        // No processes found
      }
    }
    
    // Clear all registered PIDs
    spawnedPids.clear();
    invalidateProcessCache(); // Invalidate cache after killing
    
  } catch (error) {
    console.error('[ProcessManager] Error killing headless browsers:', error);
    results.failed++;
  }
  
  return results;
}

/**
 * Get Chrome launch arguments that identify our scraper processes
 * Note: --user-data-dir is NOT used here because Playwright doesn't allow it
 * with chromium.launch() - use launchPersistentContext() if needed
 */
/**
 * Get Chrome args with our identifiers
 * @param jobId - Optional job ID to include in the args for job-specific identification
 */
export function getScraperChromeArgs(jobId?: string): string[] {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    // Custom flag to identify our processes (Chrome ignores unknown flags)
    `--scraper-id=${SCRAPER_PROCESS_ID}`,
  ];
  
  // Add job-specific identifier if provided
  if (jobId) {
    args.push(`--job-id=${jobId}`);
  }
  
  return args;
}

/**
 * Clean up the user data directory
 */
export async function cleanupUserDataDir(): Promise<void> {
  try {
    if (fs.existsSync(SCRAPER_USER_DATA_DIR)) {
      fs.rmSync(SCRAPER_USER_DATA_DIR, { recursive: true, force: true });
      console.log(`[ProcessManager] Cleaned up user data dir: ${SCRAPER_USER_DATA_DIR}`);
    }
  } catch (error) {
    console.error('[ProcessManager] Failed to cleanup user data dir:', error);
  }
}

/**
 * Get a summary of scraper process status
 */
export async function getProcessStatus(): Promise<{
  osType: string;
  registeredPids: number[];
  runningProcesses: ScraperProcessInfo[];
  summary: string;
}> {
  const osType = getOsType();
  const registeredPids = getRegisteredPids();
  const { processes } = await countRunningScraperProcesses();
  
  const summary = [
    `OS: ${osType}`,
    `Registered PIDs: ${registeredPids.length}`,
    `Running scraper processes: ${processes.length}`,
    processes.length > 0 
      ? `PIDs: ${processes.map(p => p.pid).join(', ')}`
      : 'No scraper processes running',
  ].join(' | ');
  
  return {
    osType,
    registeredPids,
    runningProcesses: processes,
    summary,
  };
}

/**
 * Detect newly spawned Chrome processes by comparing before/after snapshots
 * This is a workaround for browser.process() returning null in headless mode
 */
export async function detectNewChromeProcesses(
  beforePids: number[],
  jobId?: string,
  commandLine?: string
): Promise<number[]> {
  // Get current Chrome processes
  const { processes } = await countRunningScraperProcesses(true); // Skip cache
  const currentPids = processes.map(p => p.pid);
  
  // Find new PIDs (in current but not in before)
  const newPids = currentPids.filter(pid => !beforePids.includes(pid));
  
  // Register the new PIDs
  for (const pid of newPids) {
    registerBrowserPid(pid, jobId, commandLine);
    console.log(`[ProcessManager] Detected new Chrome process: ${pid}${jobId ? ` for job ${jobId}` : ''}`);
  }
  
  return newPids;
}

/**
 * Get current Chrome PIDs (for before/after comparison)
 */
export async function getCurrentChromePids(): Promise<number[]> {
  const { processes } = await countRunningScraperProcesses(true); // Skip cache
  return processes.map(p => p.pid);
}

/**
 * Find ALL Chrome processes for a specific job by searching their command lines
 * This works even after a server restart because it searches the actual running processes
 * @param jobId - The job ID to search for in process command lines
 * @returns Array of process info for matching processes
 */
export async function findProcessesForJob(jobId: string): Promise<{
  pid: number;
  commandLine: string;
}[]> {
  const osType = getOsType();
  const results: { pid: number; commandLine: string }[] = [];
  const jobIdArg = `--job-id=${jobId}`;
  
  console.log(`[ProcessManager] Searching for processes with job ID: ${jobId}`);
  
  try {
    if (osType === 'windows') {
      // Windows: Use PowerShell to get ALL Chrome processes
      const psScript = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -or $_.Name -like '*chromium*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;
      const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      
      const output = stdout.trim();
      if (output) {
        // Extract JSON from output
        let jsonStr = '';
        const jsonStart = output.indexOf('[');
        const jsonEnd = output.lastIndexOf(']');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          jsonStr = output.substring(jsonStart, jsonEnd + 1);
        } else {
          const objStart = output.indexOf('{');
          const objEnd = output.lastIndexOf('}');
          if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
            jsonStr = output.substring(objStart, objEnd + 1);
          }
        }
        
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          
          for (const item of items) {
            if (item?.ProcessId && item?.CommandLine) {
              const commandLine = item.CommandLine;
              // Check if this process belongs to our job
              if (commandLine.includes(jobIdArg) && commandLine.includes(SCRAPER_PROCESS_ID)) {
                results.push({
                  pid: item.ProcessId,
                  commandLine,
                });
              }
            }
          }
        }
      }
    } else {
      // Unix: Use ps with grep
      try {
        const { stdout } = await execAsync(
          `ps aux | grep -E "chrome|chromium" | grep "${jobIdArg}" | grep -v grep`,
          { maxBuffer: 10 * 1024 * 1024 }
        );
        
        const lines = stdout.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 11) {
            const pid = parseInt(parts[1]);
            const commandLine = parts.slice(10).join(' ');
            if (!isNaN(pid) && commandLine.includes(SCRAPER_PROCESS_ID)) {
              results.push({ pid, commandLine });
            }
          }
        }
      } catch {
        // grep returns exit code 1 if no matches - that's okay
      }
    }
  } catch (error) {
    console.error(`[ProcessManager] Error finding processes for job ${jobId}:`, error);
  }
  
  console.log(`[ProcessManager] Found ${results.length} processes for job ${jobId}: ${results.map(p => p.pid).join(', ') || 'none'}`);
  return results;
}

/**
 * Find and IMMEDIATELY kill all Chrome processes for a specific job
 * This is the most reliable way to kill processes - it searches by job ID in command line
 * Works even after server restart because it doesn't rely on in-memory tracking
 * @param jobId - The job ID whose processes should be killed
 * @returns Object with counts of killed/failed processes
 */
export async function findAndKillJobProcesses(jobId: string): Promise<{
  found: number;
  killed: number;
  failed: number;
  pids: number[];
}> {
  const results = { found: 0, killed: 0, failed: 0, pids: [] as number[] };
  
  // Find all processes with this job's ID in their command line
  const processes = await findProcessesForJob(jobId);
  results.found = processes.length;
  
  if (processes.length === 0) {
    console.log(`[ProcessManager] No processes found for job ${jobId}`);
    return results;
  }
  
  console.log(`[ProcessManager] Killing ${processes.length} processes for job ${jobId}`);
  
  // Kill each process
  for (const proc of processes) {
    try {
      const osType = getOsType();
      if (osType === 'windows') {
        // /F = Force, /T = Kill process tree (all child processes)
        await execAsync(`taskkill /F /T /PID ${proc.pid}`);
      } else {
        try {
          await execAsync(`kill -9 -${proc.pid}`); // Kill process group
        } catch {
          await execAsync(`kill -9 ${proc.pid}`); // Fallback to single process
        }
      }
      
      results.killed++;
      results.pids.push(proc.pid);
      console.log(`[ProcessManager] Killed process ${proc.pid} for job ${jobId}`);
      
      // Clean up tracking
      unregisterBrowserPid(proc.pid, jobId);
    } catch (error) {
      results.failed++;
      console.error(`[ProcessManager] Failed to kill process ${proc.pid}:`, error);
    }
  }
  
  // Invalidate cache since we killed processes
  invalidateProcessCache();
  
  console.log(`[ProcessManager] Job ${jobId} cleanup complete: found=${results.found}, killed=${results.killed}, failed=${results.failed}`);
  return results;
}

/**
 * Register newly launched browser processes for a job
 * Polls for new Chrome processes with the job's ID in their command line
 * @param jobId - The job ID to search for
 * @param maxWaitMs - Maximum time to wait for processes to appear (default: 5000ms)
 * @returns Array of found process PIDs
 */
export async function waitForAndRegisterJobProcesses(
  jobId: string,
  maxWaitMs: number = 5000
): Promise<number[]> {
  const startTime = Date.now();
  let lastPids: number[] = [];
  
  console.log(`[ProcessManager] Waiting for processes to spawn for job ${jobId}...`);
  
  // Poll until we find processes or timeout
  while (Date.now() - startTime < maxWaitMs) {
    const processes = await findProcessesForJob(jobId);
    const pids = processes.map(p => p.pid);
    
    if (pids.length > 0) {
      // Found processes - register them
      for (const proc of processes) {
        if (!spawnedPids.has(proc.pid)) {
          registerBrowserPid(proc.pid, jobId, proc.commandLine);
        }
      }
      
      lastPids = pids;
      
      // Wait a bit more to catch any late-spawning child processes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check again for any new processes
      const laterProcesses = await findProcessesForJob(jobId);
      for (const proc of laterProcesses) {
        if (!spawnedPids.has(proc.pid)) {
          registerBrowserPid(proc.pid, jobId, proc.commandLine);
          if (!lastPids.includes(proc.pid)) {
            lastPids.push(proc.pid);
          }
        }
      }
      
      console.log(`[ProcessManager] Registered ${lastPids.length} processes for job ${jobId}: ${lastPids.join(', ')}`);
      return lastPids;
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.warn(`[ProcessManager] Timeout waiting for processes for job ${jobId}`);
  return lastPids;
}

/**
 * Register Chrome processes for a job that are currently running
 * Simpler version of waitForAndRegisterJobProcesses - doesn't wait/poll
 * @param jobId - The job ID to search for
 * @returns Number of processes registered
 */
export async function registerJobProcesses(jobId: string): Promise<number> {
  const processes = await findProcessesForJob(jobId);
  let registered = 0;
  
  for (const proc of processes) {
    if (!spawnedPids.has(proc.pid)) {
      registerBrowserPid(proc.pid, jobId, proc.commandLine);
      registered++;
    }
  }
  
  if (registered > 0) {
    console.log(`[ProcessManager] Registered ${registered} processes for job ${jobId}`);
  }
  
  return registered;
}

// Export a singleton for easy access
export const processManager = {
  register: registerBrowserPid,
  unregister: unregisterBrowserPid,
  getRegisteredPids,
  getJobPids,
  getProcessInfo,
  getJobProcessInfo,
  restoreProcessTracking,
  validateProcessForKill,
  countRunning: countRunningScraperProcesses,
  killProcess,
  killJobProcesses,
  killAllScraperProcesses,
  killAllHeadless: killAllHeadlessBrowsers,
  getChromeArgs: getScraperChromeArgs,
  cleanup: cleanupUserDataDir,
  getStatus: getProcessStatus,
  getCurrentChromePids,
  detectNewChromeProcesses,
  findProcessesForJob,
  findAndKillJobProcesses,
  waitForAndRegisterJobProcesses,
  PROCESS_ID: SCRAPER_PROCESS_ID,
};
