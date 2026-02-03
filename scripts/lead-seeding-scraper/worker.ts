/**
 * Worker task for parallel scraping
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { WorkItem } from './types';
import { sleep } from './utils';
import { 
  stopAllWorkers, 
  getTotalAdded, 
  incrementTotalAdded 
} from './state';
import { DELAY_BETWEEN_SEARCHES, TARGET_LEADS } from './config';
import { scrapeGoogleMaps } from './google-maps-scraper';
import { saveLeadToDatabase } from './database';

/**
 * Create a new browser context with appropriate settings
 */
export async function createBrowserContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-ZA',
  });
}

/**
 * Worker task that processes a list of work items
 */
export async function workerTask(
  browser: Browser,
  workItems: WorkItem[],
  workerId: number
): Promise<number> {
  let workerAdded = 0;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;
  
  console.log(`\n🚀 [Worker ${workerId}] Starting with ${workItems.length} search tasks`);

  // Helper to create/recreate browser context
  const ensurePage = async (): Promise<Page> => {
    if (page) {
      try {
        await page.evaluate(() => true);
        return page;
      } catch {
        console.log(`   [Worker ${workerId}] 🔄 Recreating browser context...`);
      }
    }
    
    if (context) {
      await context.close().catch(() => {});
    }
    
    context = await createBrowserContext(browser);
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    return page;
  };

  try {
    for (const { city, industry } of workItems) {
      // Check if we should stop
      if (stopAllWorkers) {
        console.log(`   [Worker ${workerId}] ⛔ Stopping due to API failure`);
        break;
      }
      
      // Check if we've reached target
      if (getTotalAdded() >= TARGET_LEADS) {
        console.log(`   [Worker ${workerId}] 🎯 Target reached, stopping worker`);
        break;
      }
      
      console.log(`\n📍 [Worker ${workerId}] ${city} - ${industry}:`);

      try {
        const activePage = await ensurePage();
        const businessResults = await scrapeGoogleMaps(activePage, browser, industry, city, workerId);
        
        // Check if scraping was stopped due to API failure
        if (businessResults === null) {
          console.log(`   [Worker ${workerId}] ⛔ Stopping due to API failure`);
          break;
        }
        
        consecutiveErrors = 0;

        for (const { business, qualityScore, qualityDetails } of businessResults) {
          if (getTotalAdded() >= TARGET_LEADS || stopAllWorkers) break;
          
          const saved = await saveLeadToDatabase(
            business, 
            industry, 
            city, 
            workerId, 
            qualityScore, 
            qualityDetails
          );
          
          if (saved) {
            const total = incrementTotalAdded();
            workerAdded++;
            console.log(`   [Worker ${workerId}] 💾 Saved (total: ${total}/${TARGET_LEADS})`);
            
            // Check immediately after saving if we've hit the target
            if (total >= TARGET_LEADS) {
              console.log(`   [Worker ${workerId}] 🎯 Target of ${TARGET_LEADS} leads reached! Stopping immediately.`);
              break;
            }
          }
        }
        
        // Check again before sleeping to avoid unnecessary delay when target is reached
        if (getTotalAdded() >= TARGET_LEADS) {
          console.log(`   [Worker ${workerId}] 🛑 Stopping - target reached`);
          break;
        }

        await sleep(DELAY_BETWEEN_SEARCHES);
        
      } catch (error) {
        consecutiveErrors++;
        console.error(`   [Worker ${workerId}] Error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);
        
        page = null;
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`   [Worker ${workerId}] Too many consecutive errors, stopping worker`);
          break;
        }
        
        await sleep(2000);
      }
    }
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  console.log(`\n✅ [Worker ${workerId}] Finished - added ${workerAdded} leads`);
  return workerAdded;
}
