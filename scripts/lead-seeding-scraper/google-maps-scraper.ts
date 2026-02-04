/**
 * Google Maps search and scraping logic
 */

import { Browser, Page } from 'playwright';
import { extractBusinessDetails } from './business-extractor';
import {
    DELAY_BETWEEN_LISTINGS,
    MAX_RESULTS_PER_SEARCH,
    TARGET_LEADS
} from './config';
import { scrapeEmailsFromWebsite } from './email-scraper';
import { isGoodProspect } from './prospect-checker';
import { getTotalAdded, stopAllWorkers } from './state';
import { ScrapedBusinessResult } from './types';
import { sleep } from './utils';
import { isSocialOrDirectory } from './website-classifier';

/**
 * Scrape businesses from Google Maps for a given search query
 */
export async function scrapeGoogleMaps(
  page: Page,
  browser: Browser,
  query: string,
  location: string,
  workerId: number
): Promise<ScrapedBusinessResult[] | null> {
  // Check if we should stop
  if (stopAllWorkers) {
    return null;
  }
  
  const results: ScrapedBusinessResult[] = [];
  // Use configurable country from config (defaults to South Africa)
  const country = process.env.SCRAPER_COUNTRY || 'South Africa';
  const searchQuery = `${query} ${location} ${country}`;
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

  try {
    console.log(`   [Worker ${workerId}] Searching: "${searchQuery}"...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Accept cookies if prompted
    await acceptCookies(page);

    // Wait for results feed to appear
    const feedFound = await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => null);
    if (!feedFound) {
      console.log(`   [Worker ${workerId}] No results feed found`);
      return results;
    }

    // Scroll to load more results
    await scrollFeed(page);

    // Get all listings
    const listings = await page.locator('a[href*="/maps/place"]').all();
    const listingCount = Math.min(listings.length, MAX_RESULTS_PER_SEARCH);
    console.log(`   [Worker ${workerId}] Found ${listings.length} listings, processing ${listingCount}`);

    // Process each listing
    for (let i = 0; i < listingCount; i++) {
      // Check if we should stop - API failure
      if (stopAllWorkers) {
        console.log(`   [Worker ${workerId}] ⛔ Stopping due to API failure`);
        return null;
      }
      
      // Check if target already reached (by this or other workers)
      if (getTotalAdded() >= TARGET_LEADS) {
        console.log(`   [Worker ${workerId}] 🎯 Target already reached, skipping remaining listings`);
        break;
      }
      
      const result = await processListing(page, browser, i, workerId, results.length);
      
      if (result === null) {
        // API failure - stop immediately
        return null;
      }
      
      if (result) {
        results.push(result);
        
        // Check if adding this result will reach/exceed target
        // Note: We check >= since saveLeadToDatabase might skip duplicates
        if (getTotalAdded() >= TARGET_LEADS) {
          console.log(`   [Worker ${workerId}] 🎯 Target of ${TARGET_LEADS} leads reached!`);
          break;
        }
      }
    }
  } catch (error) {
    console.error(`   [Worker ${workerId}] Error searching: ${error}`);
  }

  return results;
}

async function acceptCookies(page: Page): Promise<void> {
  try {
    const acceptButton = page.locator('button:has-text("Accept all")');
    if (await acceptButton.isVisible({ timeout: 2000 })) {
      await acceptButton.click();
      await sleep(500);
    }
  } catch {
    // No cookie prompt
  }
}

async function scrollFeed(page: Page): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) feed.scrollTop = feed.scrollHeight;
    });
    await sleep(500);
  }
}

async function processListing(
  page: Page,
  browser: Browser,
  index: number,
  workerId: number,
  currentResultsCount: number
): Promise<ScrapedBusinessResult | null | undefined> {
  try {
    // Re-query listings each time as DOM may change after clicks
    const currentListings = await page.locator('a[href*="/maps/place"]').all();
    if (index >= currentListings.length) return undefined;
    
    const listing = currentListings[index];
    
    // Click on the listing
    await listing.click().catch(() => {});
    await sleep(DELAY_BETWEEN_LISTINGS + 200);
    
    // Wait for h1 to appear (business name)
    const h1Visible = await page.locator('h1').first().isVisible({ timeout: 3000 }).catch(() => false);
    if (!h1Visible) {
      console.log(`   [Worker ${workerId}] Listing ${index + 1}: No details panel`);
      return undefined;
    }

    // Extract business details
    const business = await extractBusinessDetails(page, workerId);
    if (!business) {
      console.log(`   [Worker ${workerId}] Listing ${index + 1}: Extraction failed`);
      return undefined;
    }

    // Check if this is a good prospect
    const prospectCheck = await isGoodProspect(business.website, workerId);
    
    // Check if API failed
    if (prospectCheck.shouldStop) {
      console.log(`   [Worker ${workerId}] ⛔ Stopping due to API failure`);
      return null;
    }

    // Include if: good prospect AND has decent rating (3.0+)
    if (prospectCheck.isGood && business.rating && business.rating >= 3.0) {
      // Scrape emails from website if available
      if (business.website && !isSocialOrDirectory(business.website)) {
        const scrapedEmails = await scrapeEmailsFromWebsite(browser, business.website, workerId);
        const allEmails = [...business.emails, ...scrapedEmails];
        business.emails = allEmails.filter((email, idx) => allEmails.indexOf(email) === idx);
      }
      
      const scoreInfo = prospectCheck.qualityScore !== undefined 
        ? ` (Quality: ${prospectCheck.qualityScore}/100)` 
        : '';
      const emailInfo = business.emails.length > 0 
        ? `, ${business.emails.length} email(s)` 
        : '';
      
      console.log(`   [Worker ${workerId}] ✓ Found: ${business.name} (${business.rating}⭐, ${business.phones.length} phones${emailInfo}) [${prospectCheck.reason}]${scoreInfo}`);
      
      return {
        business,
        qualityScore: prospectCheck.qualityScore,
        qualityDetails: prospectCheck.qualityDetails,
      };
    } else if (!prospectCheck.isGood) {
      const scoreInfo = prospectCheck.qualityScore !== undefined 
        ? ` (Quality: ${prospectCheck.qualityScore}/100)` 
        : '';
      console.log(`   [Worker ${workerId}] Skip: ${business.name} - ${prospectCheck.reason}${scoreInfo}`);
    } else {
      console.log(`   [Worker ${workerId}] Skip: ${business.name} - Low rating (${business.rating || 'N/A'})`);
    }
    
    return undefined;
  } catch (err: any) {
    console.log(`   [Worker ${workerId}] Listing ${index + 1}: Error - ${err?.message || err}`);
    return undefined;
  }
}
