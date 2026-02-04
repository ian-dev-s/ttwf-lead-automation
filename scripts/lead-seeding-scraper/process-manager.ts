/**
 * Process Manager for Standalone Lead Seeding Scraper
 * 
 * Tracks and manages spawned browser processes across all operating systems.
 * Provides commands to check and kill scraper processes.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';

const execAsync = promisify(exec);

// Unique identifier for our scraper processes
export const SCRAPER_PROCESS_ID = 'lead-gen-seeder';
export const SCRAPER_USER_DATA_DIR = path.join(os.tmpdir(), SCRAPER_PROCESS_ID);

// Track spawned browser PIDs
const spawnedPids = new Set<number>();

/**
 * Register a spawned browser PID
 */
export function registerBrowserPid(pid: number): void {
  spawnedPids.add(pid);
  console.log(`[ProcessManager] Registered browser PID: ${pid}`);
}

/**
 * Unregister a browser PID (after it's closed)
 */
export function unregisterBrowserPid(pid: number): void {
  spawnedPids.delete(pid);
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
 */
export async function countRunningScraperProcesses(): Promise<{
  total: number;
  registered: number;
  orphaned: number;
  processes: ScraperProcessInfo[];
}> {
  const osType = getOsType();
  const processes: ScraperProcessInfo[] = [];
  
  try {
    let output = '';
    
    if (osType === 'windows') {
      const { stdout } = await execAsync(
        `wmic process where "name like '%chrome%' or name like '%chromium%'" get processid,commandline /format:csv`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      output = stdout;
      
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines.slice(1)) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          const commandLine = parts.slice(1, -1).join(',');
          const pid = parseInt(parts[parts.length - 1]);
          if (!isNaN(pid)) {
            const isOurs = commandLine.includes(SCRAPER_PROCESS_ID) || 
                          commandLine.includes('lead-gen') ||
                          spawnedPids.has(pid);
            processes.push({
              pid,
              name: 'chrome',
              commandLine,
              isOurProcess: isOurs,
            });
          }
        }
      }
    } else if (osType === 'macos') {
      const { stdout } = await execAsync(
        `ps aux | grep -E "chrome|chromium|Chromium" | grep -v grep`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      output = stdout;
      
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          const pid = parseInt(parts[1]);
          const commandLine = parts.slice(10).join(' ');
          if (!isNaN(pid)) {
            const isOurs = commandLine.includes(SCRAPER_PROCESS_ID) ||
                          commandLine.includes('lead-gen') ||
                          spawnedPids.has(pid);
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
      const { stdout } = await execAsync(
        `ps aux | grep -E "chrome|chromium" | grep -v grep`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      output = stdout;
      
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          const pid = parseInt(parts[1]);
          const commandLine = parts.slice(10).join(' ');
          if (!isNaN(pid)) {
            const isOurs = commandLine.includes(SCRAPER_PROCESS_ID) ||
                          commandLine.includes('lead-gen') ||
                          spawnedPids.has(pid);
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
  } catch {
    // No processes found or command failed
  }
  
  const ourProcesses = processes.filter(p => p.isOurProcess);
  const registeredPids = getRegisteredPids();
  
  return {
    total: ourProcesses.length,
    registered: registeredPids.length,
    orphaned: ourProcesses.filter(p => !registeredPids.includes(p.pid)).length,
    processes: ourProcesses,
  };
}

/**
 * Kill a specific process by PID (cross-platform)
 */
export async function killProcess(pid: number): Promise<boolean> {
  const osType = getOsType();
  
  try {
    if (osType === 'windows') {
      await execAsync(`taskkill /F /PID ${pid}`);
    } else {
      await execAsync(`kill -9 ${pid}`);
    }
    
    unregisterBrowserPid(pid);
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
  
  for (const pid of getRegisteredPids()) {
    if (!results.pids.includes(pid)) {
      const success = await killProcess(pid);
      if (success) {
        results.killed++;
        results.pids.push(pid);
      }
    }
  }
  
  spawnedPids.clear();
  
  console.log(`[ProcessManager] Killed ${results.killed} processes, ${results.failed} failed`);
  return results;
}

/**
 * Kill all Chrome/Chromium headless processes on the system
 */
export async function killAllHeadlessBrowsers(): Promise<{
  killed: number;
  failed: number;
}> {
  const osType = getOsType();
  const results = { killed: 0, failed: 0 };
  
  try {
    if (osType === 'windows') {
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
    
    spawnedPids.clear();
    
  } catch (error) {
    console.error('[ProcessManager] Error killing headless browsers:', error);
    results.failed++;
  }
  
  return results;
}

/**
 * Get Chrome launch arguments that identify our scraper processes
 */
export function getScraperChromeArgs(): string[] {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    `--user-data-dir=${SCRAPER_USER_DATA_DIR}`,
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

/**
 * Print process status to console
 */
export async function printProcessStatus(): Promise<void> {
  const status = await getProcessStatus();
  console.log('\n========================================');
  console.log('  Scraper Process Status');
  console.log('========================================');
  console.log(`  OS Type: ${status.osType}`);
  console.log(`  Registered PIDs: ${status.registeredPids.length}`);
  console.log(`  Running Processes: ${status.runningProcesses.length}`);
  
  if (status.runningProcesses.length > 0) {
    console.log('\n  Active Processes:');
    for (const proc of status.runningProcesses) {
      console.log(`    - PID ${proc.pid}: ${proc.name}${proc.isOurProcess ? ' (ours)' : ''}`);
    }
  }
  console.log('========================================\n');
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
  printStatus: printProcessStatus,
  PROCESS_ID: SCRAPER_PROCESS_ID,
};
