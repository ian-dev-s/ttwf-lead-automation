/**
 * Lead Seeding Scraper - Main Entry Point
 * 
 * Scrapes South African businesses from Google Maps and evaluates
 * them as potential leads based on website quality.
 * 
 * Run with: npx tsx scripts/lead-seeding-scraper/index.ts
 */

import { chromium, Browser } from 'playwright';
import { WorkItem } from './types';
import { shuffleArray, chunkArray } from './utils';
import { resetState, getTotalAdded, stopAllWorkers } from './state';
import { 
  PARALLEL_WORKERS, 
  MAX_RESULTS_PER_SEARCH,
  DELAY_BETWEEN_LISTINGS,
  DELAY_BETWEEN_SEARCHES,
  TARGET_LEADS,
  SA_CITIES,
  INDUSTRIES,
} from './config';
import { getLeadCount, disconnectDatabase } from './database';
import { workerTask } from './worker';
import { 
  getScraperChromeArgs, 
  registerBrowserPid, 
  unregisterBrowserPid,
  printProcessStatus,
  killAllScraperProcesses,
} from './process-manager';

// Handle graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(browser: Browser | null) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('\n\n🛑 Received shutdown signal - cleaning up...');
  
  // Unregister and close browser
  if (browser) {
    const browserProcess = browser.process();
    if (browserProcess?.pid) {
      unregisterBrowserPid(browserProcess.pid);
    }
    try {
      await browser.close();
    } catch {
      // Ignore close errors
    }
  }
  
  // Kill any orphaned processes
  console.log('🧹 Cleaning up any orphaned processes...');
  await killAllScraperProcesses();
  
  // Disconnect database
  await disconnectDatabase();
  
  console.log('✅ Cleanup complete\n');
  process.exit(0);
}

async function main() {
  console.log('🔍 TTWF Lead Generator - Lead Seeding Scraper\n');
  console.log('================================================\n');
  console.log(`⚙️  Configuration:`);
  console.log(`   - Parallel workers: ${PARALLEL_WORKERS}`);
  console.log(`   - Max results per search: ${MAX_RESULTS_PER_SEARCH}`);
  console.log(`   - Delay between listings: ${DELAY_BETWEEN_LISTINGS}ms`);
  console.log(`   - Delay between searches: ${DELAY_BETWEEN_SEARCHES}ms`);
  console.log(`   - Target leads: ${TARGET_LEADS}\n`);

  // Reset shared state
  resetState();

  let browser: Browser | null = null;

  // Set up signal handlers for graceful shutdown
  process.on('SIGINT', () => gracefulShutdown(browser));
  process.on('SIGTERM', () => gracefulShutdown(browser));

  try {
    // Show current process status
    await printProcessStatus();
    
    // Count existing leads
    const existingCount = await getLeadCount();
    console.log(`📊 Existing leads in database: ${existingCount}\n`);

    // Launch browser with identifiable args
    console.log('🌐 Launching browser...\n');
    browser = await chromium.launch({
      headless: true,
      args: getScraperChromeArgs(),
    });
    
    // Register browser PID for tracking
    const browserProcess = browser.process();
    if (browserProcess?.pid) {
      registerBrowserPid(browserProcess.pid);
      console.log(`📋 Browser PID: ${browserProcess.pid}\n`);
    }

    // Build work queue
    const workQueue: WorkItem[] = [];
    const shuffledCities = shuffleArray(SA_CITIES);
    const shuffledIndustries = shuffleArray(INDUSTRIES);

    for (const city of shuffledCities) {
      for (const industry of shuffledIndustries) {
        workQueue.push({ city, industry });
      }
    }

    console.log(`📋 Total search combinations: ${workQueue.length}`);
    console.log(`   Distributing across ${PARALLEL_WORKERS} workers...\n`);

    // Distribute work across workers
    const workChunks = chunkArray(workQueue, PARALLEL_WORKERS);

    // Run workers in parallel
    console.log('🔎 Starting parallel scraping...\n');
    console.log('================================================\n');

    const startTime = Date.now();
    
    const results = await Promise.all(
      workChunks.map((chunk, index) => 
        workerTask(browser!, chunk, index + 1)
      )
    );

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    // Report results
    console.log(`\n================================================`);
    
    if (stopAllWorkers) {
      console.log(`⛔ Scraping stopped due to API failure!`);
      console.log(`   Cannot guarantee lead quality.`);
    } else {
      console.log(`✅ Scraping complete!`);
    }
    
    console.log(`================================================`);
    console.log(`   Total leads added: ${getTotalAdded()}`);
    console.log(`   By worker: ${results.map((r, i) => `Worker ${i + 1}: ${r}`).join(', ')}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log(`   Final database count: ${await getLeadCount()}`);
    console.log(`================================================`);
    console.log(`\n🛑 Script finished. Run manually to start another batch.\n`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    // Unregister browser PID before closing
    if (browser) {
      const browserProcess = browser.process();
      if (browserProcess?.pid) {
        unregisterBrowserPid(browserProcess.pid);
      }
      await browser.close();
    }
    
    // Show final process status
    await printProcessStatus();
    
    await disconnectDatabase();
    process.exit(0); // Ensure clean exit
  }
}

main();
