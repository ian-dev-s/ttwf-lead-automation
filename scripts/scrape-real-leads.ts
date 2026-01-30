/**
 * Script to scrape REAL South African businesses from Google Maps
 * Run with: npx tsx scripts/scrape-real-leads.ts
 * 
 * Optimized for stability and parallel execution
 */

import { PrismaClient } from '@prisma/client';
import { Browser, BrowserContext, chromium, Page } from 'playwright';

const prisma = new PrismaClient();

// Configuration - reduced for stability
const PARALLEL_WORKERS = 5; // Single worker for debugging
const MAX_RESULTS_PER_SEARCH = 100; // Reduced for testing
const DELAY_BETWEEN_LISTINGS = 1000; // ms between clicking listings
const DELAY_BETWEEN_SEARCHES = 1500; // ms between searches

interface ScrapedBusiness {
  name: string;
  address: string;
  phones: string[];
  emails: string[];
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl: string;
  category?: string;
}

interface WorkItem {
  city: string;
  industry: string;
}

// South African cities to search
const SA_CITIES = [
  'Johannesburg',
  'Cape Town',
  'Durban',
  'Pretoria',
  'Port Elizabeth',
  'Bloemfontein',
  'East London',
  'Pietermaritzburg',
  'Kimberley',
  'Polokwane',
  'Nelspruit',
  'Rustenburg',
  'George',
  'Stellenbosch',
  'Sandton',
];

// Industries that commonly need websites
const INDUSTRIES = [
  'plumber',
  'electrician',
  'mechanic',
  'hair salon',
  'restaurant',
  'dentist',
  'lawyer',
  'accountant',
  'physiotherapist',
  'gym',
  'bakery',
  'butcher',
  'florist',
  'photographer',
  'wedding venue',
  'guest house',
  'bed and breakfast',
  'car wash',
  'dry cleaner',
  'locksmith',
  'pest control',
  'landscaper',
  'painter',
  'tiler',
  'carpenter',
];

// Shared counter for tracking progress across workers
let totalAdded = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function chunkArray<T>(array: T[], numChunks: number): T[][] {
  const chunks: T[][] = Array.from({ length: numChunks }, () => []);
  array.forEach((item, index) => {
    chunks[index % numChunks].push(item);
  });
  return chunks;
}

async function extractBusinessDetails(
  page: Page,
  workerId: number
): Promise<ScrapedBusiness | null> {
  try {
    // Wait for the details panel to load - look for the business info section
    await sleep(500);

    // The business name in Google Maps is in a specific container
    // Try multiple selectors to find the business name
    let name: string | null = null;
    
    // Try the main business title (inside the details panel)
    const titleSelectors = [
      'div[role="main"] h1',
      '[data-attrid="title"] span',
      'h1.DUwDvf',
      'h1[data-attrid="title"]',
    ];
    
    for (const selector of titleSelectors) {
      const text = await page.locator(selector).first().textContent({ timeout: 1000 }).catch(() => null);
      if (text && text.length > 2 && !text.toLowerCase().includes('results')) {
        name = text;
        break;
      }
    }
    
    if (!name) return null;

    // Extract address
    const address = await page
      .locator('[data-item-id="address"] .fontBodyMedium')
      .textContent({ timeout: 2000 })
      .catch(() => null);

    // Extract ALL phone numbers from the Google Maps UI elements only
    const phones: string[] = [];
    try {
      const phoneElements = await page.locator('[data-item-id^="phone:"] .fontBodyMedium').all();
      for (const phoneEl of phoneElements) {
        const phoneText = await phoneEl.textContent({ timeout: 1000 }).catch(() => null);
        if (phoneText) {
          const cleanPhone = phoneText.trim();
          if (cleanPhone && !phones.includes(cleanPhone)) {
            phones.push(cleanPhone);
          }
        }
      }
    } catch {
      // Phone extraction failed, continue
    }

    // Extract website
    const website = await page
      .locator('[data-item-id="authority"] a')
      .getAttribute('href', { timeout: 2000 })
      .catch(() => null);

    // Extract rating
    let rating: number | undefined;
    try {
      const ratingText = await page
        .locator('[role="img"][aria-label*="stars"]')
        .getAttribute('aria-label', { timeout: 2000 });
      if (ratingText) {
        const match = ratingText.match(/([\d.]+)\s*stars?/i);
        if (match) rating = parseFloat(match[1]);
      }
    } catch {
      // Rating extraction failed
    }

    // Extract review count
    let reviewCount: number | undefined;
    try {
      const reviewText = await page
        .locator('[aria-label*="reviews"]')
        .first()
        .textContent({ timeout: 2000 });
      if (reviewText) {
        const match = reviewText.match(/\(([\d,]+)\)/);
        if (match) reviewCount = parseInt(match[1].replace(/,/g, ''));
      }
    } catch {
      // Review count extraction failed
    }

    // Extract category
    const category = await page
      .locator('button[jsaction*="category"]')
      .textContent({ timeout: 2000 })
      .catch(() => null);

    const currentUrl = page.url();

    return {
      name: name.trim(),
      address: address?.trim() || '',
      phones,
      emails: [], // Skip email extraction for now - too heavy
      website: website?.trim(),
      rating,
      reviewCount,
      googleMapsUrl: currentUrl,
      category: category?.trim(),
    };
  } catch (error) {
    console.error(`   [Worker ${workerId}] Error extracting details:`, error);
    return null;
  }
}

async function scrapeGoogleMaps(
  page: Page,
  query: string,
  location: string,
  workerId: number
): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const searchQuery = `${query} ${location} South Africa`;
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

  try {
    console.log(`   [Worker ${workerId}] Searching: "${searchQuery}"...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Accept cookies if prompted
    try {
      const acceptButton = page.locator('button:has-text("Accept all")');
      if (await acceptButton.isVisible({ timeout: 2000 })) {
        await acceptButton.click();
        await sleep(500);
      }
    } catch {
      // No cookie prompt
    }

    // Wait for results feed to appear
    const feedFound = await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => null);
    if (!feedFound) {
      console.log(`   [Worker ${workerId}] No results feed found`);
      return results;
    }

    // Scroll to load more results
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });
      await sleep(500);
    }

    // Get all listings using a simpler selector
    const listings = await page.locator('a[href*="/maps/place"]').all();
    const listingCount = Math.min(listings.length, MAX_RESULTS_PER_SEARCH);
    console.log(`   [Worker ${workerId}] Found ${listings.length} listings, processing ${listingCount}`);

    for (let i = 0; i < listingCount; i++) {
      try {
        // Re-query listings each time as DOM may change after clicks
        const currentListings = await page.locator('a[href*="/maps/place"]').all();
        if (i >= currentListings.length) break;
        
        const listing = currentListings[i];
        
        // Click on the listing
        await listing.click().catch(() => {});
        await sleep(DELAY_BETWEEN_LISTINGS + 200);
        
        // Wait for h1 to appear (business name)
        const h1Visible = await page.locator('h1').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (!h1Visible) {
          console.log(`   [Worker ${workerId}] Listing ${i+1}: No details panel`);
          continue;
        }

        // Extract business details
        const business = await extractBusinessDetails(page, workerId);
        if (!business) {
          console.log(`   [Worker ${workerId}] Listing ${i+1}: Extraction failed`);
          continue;
        }

        // Check if this is a good prospect (no website or low-quality site)
        const isGoodProspect = !business.website || 
          business.website.includes('facebook.com') || 
          business.website.includes('instagram.com') ||
          business.website.includes('yellowpages') ||
          business.website.includes('gumtree');

        // Only include businesses with good ratings that need websites
        if (isGoodProspect && business.rating && business.rating >= 3.5) {
          results.push(business);
          console.log(`   [Worker ${workerId}] ✓ Found: ${business.name} (${business.rating}⭐, ${business.phones.length} phones)`);
        } else {
          console.log(`   [Worker ${workerId}] Listing ${i+1}: ${business.name} - skipped (has website or low rating)`);
        }
      } catch (err: any) {
        console.log(`   [Worker ${workerId}] Listing ${i+1}: Error - ${err?.message || err}`);
        continue;
      }
    }
  } catch (error) {
    console.error(`   [Worker ${workerId}] Error searching: ${error}`);
  }

  return results;
}

function calculateWebsiteScore(website: string | null | undefined): number {
  if (!website) return 0;
  if (website.includes('facebook.com') || website.includes('instagram.com')) return 20;
  if (website.includes('yellowpages') || website.includes('gumtree')) return 30;
  return 60;
}

async function saveLeadToDatabase(
  business: ScrapedBusiness, 
  industry: string, 
  location: string,
  workerId: number
): Promise<boolean> {
  try {
    const websiteScore = calculateWebsiteScore(business.website);
    const leadScore = Math.round(
      (business.rating || 4) * 15 +
      Math.min((business.reviewCount || 0) / 10, 20) +
      (100 - websiteScore) * 0.3
    );

    const primaryPhone = business.phones[0] || null;

    // Check if lead already exists
    const existing = await prisma.lead.findFirst({
      where: {
        OR: [
          { businessName: business.name, location: location },
          { googleMapsUrl: business.googleMapsUrl },
          ...(primaryPhone ? [{ businessName: business.name, phone: primaryPhone }] : []),
        ],
      },
    });

    if (existing) {
      console.log(`   [Worker ${workerId}] ⏭️  Skipped existing: ${business.name}`);
      return false;
    }

    // Build notes
    const notes = [
      `Scraped from Google Maps.`,
      !business.website ? 'NO WEBSITE - Great prospect!' : `Website: ${business.website}`,
      business.phones.length > 1 ? `Additional phones: ${business.phones.slice(1).join(', ')}` : '',
    ].filter(Boolean).join(' ');

    // Create the lead
    await prisma.lead.create({
      data: {
        businessName: business.name,
        email: null,
        phone: primaryPhone,
        website: business.website,
        address: business.address,
        location: location,
        industry: industry,
        source: 'GOOGLE_MAPS',
        status: 'NEW',
        googleRating: business.rating,
        reviewCount: business.reviewCount,
        googleMapsUrl: business.googleMapsUrl,
        facebookUrl: business.website?.includes('facebook.com') ? business.website : null,
        websiteQuality: websiteScore,
        score: Math.min(100, Math.max(0, leadScore)),
        notes,
        metadata: {
          phones: business.phones,
          emails: business.emails,
          category: business.category,
        },
      },
    });

    return true;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      console.log(`   [Worker ${workerId}] ⏭️  Skipped duplicate: ${business.name}`);
      return false;
    }
    console.error(`   [Worker ${workerId}] Error saving lead: ${error}`);
    return false;
  }
}

async function createBrowserContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-ZA',
  });
}

async function workerTask(
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
        // Test if page is still alive
        await page.evaluate(() => true);
        return page;
      } catch {
        // Page is dead, recreate
        console.log(`   [Worker ${workerId}] 🔄 Recreating browser context...`);
      }
    }
    
    // Close old context if exists
    if (context) {
      await context.close().catch(() => {});
    }
    
    // Create new context and page
    context = await createBrowserContext(browser);
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    return page;
  };

  try {
    for (const { city, industry } of workItems) {
      console.log(`\n📍 [Worker ${workerId}] ${city} - ${industry}:`);

      try {
        const activePage = await ensurePage();
        const businesses = await scrapeGoogleMaps(activePage, industry, city, workerId);
        consecutiveErrors = 0; // Reset on success

        for (const business of businesses) {
          const saved = await saveLeadToDatabase(business, industry, city, workerId);
          if (saved) {
            totalAdded++;
            workerAdded++;
            console.log(`   [Worker ${workerId}] 💾 Saved (total: ${totalAdded})`);
          }
        }

        // Small delay between searches
        await sleep(DELAY_BETWEEN_SEARCHES);
        
      } catch (error) {
        consecutiveErrors++;
        console.error(`   [Worker ${workerId}] Error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);
        
        // Force page recreation on next iteration
        page = null;
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`   [Worker ${workerId}] Too many consecutive errors, stopping worker`);
          break;
        }
        
        await sleep(2000); // Wait before retry
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

async function main() {
  console.log('🔍 TTWF Lead Generator - Real Business Scraper\n');
  console.log('================================================\n');
  console.log(`⚙️  Configuration:`);
  console.log(`   - Parallel workers: ${PARALLEL_WORKERS}`);
  console.log(`   - Max results per search: ${MAX_RESULTS_PER_SEARCH}`);
  console.log(`   - Delay between listings: ${DELAY_BETWEEN_LISTINGS}ms`);
  console.log(`   - Delay between searches: ${DELAY_BETWEEN_SEARCHES}ms\n`);

  let browser: Browser | null = null;

  try {
    // Count existing leads
    const existingCount = await prisma.lead.count();
    console.log(`📊 Existing leads in database: ${existingCount}\n`);

    // Launch browser
    console.log('🌐 Launching browser...\n');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

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
    console.log(`✅ Scraping complete!`);
    console.log(`================================================`);
    console.log(`   Total leads added: ${totalAdded}`);
    console.log(`   By worker: ${results.map((r, i) => `Worker ${i + 1}: ${r}`).join(', ')}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log(`   Final database count: ${await prisma.lead.count()}`);
    console.log(`================================================\n`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

main();
