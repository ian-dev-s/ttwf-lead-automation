/**
 * Process Manager for Lead Gen Scraper
 * 
 * Tracks and manages spawned browser processes across all operating systems.
 * Since Chrome process names can't be changed, we use:
 * 1. A unique --user-data-dir suffix to identify our processes
 * 2. PID tracking when browsers are spawned
 * 3. Cross-platform process management
 */

import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';

const execAsync = promisify(exec);

// Unique identifier for our scraper processes - use a very specific string
// This appears in the command line args and can be detected in process listings
export const SCRAPER_PROCESS_ID = 'ttwf-lead-gen-scraper-v1';
export const SCRAPER_USER_DATA_DIR = path.join(os.tmpdir(), SCRAPER_PROCESS_ID);

// Track spawned browser PIDs
const spawnedPids = new Set<number>();

// Cache for process status to avoid hitting the system too frequently
let processStatusCache: {
  data: Awaited<ReturnType<typeof countRunningScraperProcesses>> | null;
  timestamp: number;
} = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 5000; // 5 second cache

/**
 * Register a spawned browser PID
 */
export function registerBrowserPid(pid: number): void {
  spawnedPids.add(pid);
  invalidateProcessCache(); // New process, invalidate cache
  console.log(`[ProcessManager] Registered browser PID: ${pid}`);
}

/**
 * Unregister a browser PID (after it's closed)
 */
export function unregisterBrowserPid(pid: number): void {
  spawnedPids.delete(pid);
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
      const { stdout } = await execAsync(
        `powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -or $_.Name -like '*chromium*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      output = stdout.trim();
      
      // Parse PowerShell JSON output
      if (output && output !== '') {
        try {
          const parsed = JSON.parse(output);
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
 * Kill a specific process by PID (cross-platform)
 * On Windows, uses /T flag to kill the entire process tree
 */
export async function killProcess(pid: number): Promise<boolean> {
  const osType = getOsType();
  
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
    return false;
  }
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
export function getScraperChromeArgs(): string[] {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    // Custom flag to identify our processes (Chrome ignores unknown flags)
    `--scraper-id=${SCRAPER_PROCESS_ID}`,
  ];
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

// Export a singleton for easy access
export const processManager = {
  register: registerBrowserPid,
  unregister: unregisterBrowserPid,
  getRegisteredPids,
  countRunning: countRunningScraperProcesses,
  killProcess,
  killAllScraperProcesses,
  killAllHeadless: killAllHeadlessBrowsers,
  getChromeArgs: getScraperChromeArgs,
  cleanup: cleanupUserDataDir,
  getStatus: getProcessStatus,
  PROCESS_ID: SCRAPER_PROCESS_ID,
};
