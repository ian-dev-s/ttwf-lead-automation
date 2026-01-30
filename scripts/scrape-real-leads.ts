/**
 * Script to scrape REAL South African businesses from Google Maps
 * Run with: npx tsx scripts/scrape-real-leads.ts
 * 
 * Optimized for parallel execution with multiple browser contexts
 */

import { PrismaClient } from '@prisma/client';
import { Browser, BrowserContext, chromium, Page } from 'playwright';

const prisma = new PrismaClient();

// Configuration
const PARALLEL_WORKERS = 4; // Number of parallel browser contexts
const MAX_RESULTS_PER_SEARCH = 100; // Max results per search query

interface ScrapedBusiness {
  name: string;
  address: string;
  phones: string[];  // All phone numbers (cell, landline, etc.)
  emails: string[];  // All email addresses found
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl: string;
  category?: string;
  placeId?: string;
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

async function scrapeGoogleMaps(
  page: Page,
  query: string,
  location: string,
  workerId: number,
  maxResults: number = MAX_RESULTS_PER_SEARCH
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
      }
    } catch {
      // No cookie prompt
    }

    // Wait for results feed to appear
    await page.waitForSelector('[role="feed"]', { timeout: 15000 }).catch(() => null);

    // Scroll to load more results - use a timeout instead of networkidle
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });
      // Brief wait for content to load after scroll
      await page.waitForTimeout(500);
    }

    // Get all listings
    const listings = await page.locator('[role="feed"] > div > div > a[href*="/maps/place"]').all();
    console.log(`   [Worker ${workerId}] Found ${listings.length} listings`);

    for (let i = 0; i < Math.min(listings.length, maxResults); i++) {
      try {
        const listing = listings[i];
        await listing.click();
        
        // Wait for the details panel to load
        await page.waitForSelector('h1', { timeout: 5000 }).catch(() => null);

        // Extract business details
        const name = await page.locator('h1').first().textContent().catch(() => null);
        if (!name) continue;

        const address = await page
          .locator('[data-item-id="address"] .fontBodyMedium')
          .textContent()
          .catch(() => null);

        // Extract ALL phone numbers (cell, landline, fax, etc.)
        const phoneElements = await page.locator('[data-item-id^="phone:"] .fontBodyMedium').all();
        const phones: string[] = [];
        for (const phoneEl of phoneElements) {
          const phoneText = await phoneEl.textContent().catch(() => null);
          if (phoneText) {
            const cleanPhone = phoneText.trim();
            if (cleanPhone && !phones.includes(cleanPhone)) {
              phones.push(cleanPhone);
            }
          }
        }

        // Also check for additional contact info in the about section
        const additionalPhones = await page.evaluate(() => {
          const phoneRegex = /(?:\+27|0)[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g;
          const pageText = document.body.innerText;
          const matches = pageText.match(phoneRegex) || [];
          return Array.from(new Set(matches));
        });
        for (const phone of additionalPhones) {
          const cleanPhone = phone.trim();
          if (cleanPhone && !phones.includes(cleanPhone)) {
            phones.push(cleanPhone);
          }
        }

        // Extract email addresses from the page
        const emails: string[] = [];
        const emailFromPage = await page.evaluate(() => {
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const pageText = document.body.innerText;
          const matches = pageText.match(emailRegex) || [];
          // Filter out common false positives
          return Array.from(new Set(matches)).filter(email => 
            !email.includes('google.com') && 
            !email.includes('gstatic.com') &&
            !email.includes('schema.org') &&
            !email.includes('example.com')
          );
        });
        for (const email of emailFromPage) {
          if (!emails.includes(email)) {
            emails.push(email);
          }
        }

        const website = await page
          .locator('[data-item-id="authority"] a')
          .getAttribute('href')
          .catch(() => null);

        // Get rating
        const ratingText = await page
          .locator('[role="img"][aria-label*="stars"]')
          .getAttribute('aria-label')
          .catch(() => null);

        let rating: number | undefined;
        if (ratingText) {
          const match = ratingText.match(/([\d.]+)\s*stars?/i);
          if (match) rating = parseFloat(match[1]);
        }

        // Get review count
        const reviewText = await page
          .locator('[aria-label*="reviews"]')
          .first()
          .textContent()
          .catch(() => null);

        let reviewCount: number | undefined;
        if (reviewText) {
          const match = reviewText.match(/\(([\d,]+)\)/);
          if (match) reviewCount = parseInt(match[1].replace(/,/g, ''));
        }

        const category = await page
          .locator('button[jsaction*="category"]')
          .textContent()
          .catch(() => null);

        const currentUrl = page.url();

        // We want businesses WITHOUT websites or with low-quality ones
        // Only include if no website or it looks like a bad one
        const isGoodProspect = !website || 
          website.includes('facebook.com') || 
          website.includes('instagram.com') ||
          website.includes('yellowpages') ||
          website.includes('gumtree');

        if (isGoodProspect && rating && rating >= 3.5) {
          results.push({
            name: name.trim(),
            address: address?.trim() || location,
            phones,
            emails,
            website: website?.trim(),
            rating,
            reviewCount,
            googleMapsUrl: currentUrl,
            category: category?.trim() || query,
            placeId: currentUrl.match(/!1s([^!]+)/)?.[1],
          });
          console.log(`   [Worker ${workerId}] ✓ Found: ${name.trim()} (${rating}⭐, ${phones.length} phones, ${emails.length} emails)`);
        }
      } catch (err) {
        // Continue to next listing
      }
    }
  } catch (error) {
    console.error(`   [Worker ${workerId}] Error searching: ${error}`);
  }

  return results;
}

function calculateWebsiteScore(website: string | null | undefined): number {
  if (!website) return 0; // No website = perfect prospect!
  if (website.includes('facebook.com') || website.includes('instagram.com')) return 20;
  if (website.includes('yellowpages') || website.includes('gumtree')) return 30;
  return 60; // Has some website
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
      (business.rating || 4) * 15 + // Rating weight
      Math.min((business.reviewCount || 0) / 10, 20) + // Reviews weight
      (100 - websiteScore) * 0.3 // Website quality (lower = better prospect)
    );

    // Primary phone and email (first found)
    const primaryPhone = business.phones[0] || null;
    const primaryEmail = business.emails[0] || null;

    // Check if lead already exists to prevent duplicates
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

    // Build notes with all contact info
    const contactNotes = [];
    if (business.phones.length > 1) {
      contactNotes.push(`Additional phones: ${business.phones.slice(1).join(', ')}`);
    }
    if (business.emails.length > 1) {
      contactNotes.push(`Additional emails: ${business.emails.slice(1).join(', ')}`);
    }

    // Create the lead with all contact info in metadata
    await prisma.lead.create({
      data: {
        businessName: business.name,
        email: primaryEmail,
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
        notes: [
          `Scraped from Google Maps.`,
          !business.website ? 'NO WEBSITE - Great prospect!' : `Website: ${business.website}`,
          ...contactNotes,
        ].join(' '),
        // Store ALL phones and emails in metadata for easy access
        metadata: {
          phones: business.phones,
          emails: business.emails,
          category: business.category,
          placeId: business.placeId,
        },
      },
    });

    return true;
  } catch (error: any) {
    // Handle unique constraint violations (duplicate entries)
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
  
  console.log(`\n🚀 [Worker ${workerId}] Starting with ${workItems.length} search tasks`);
  
  const context = await createBrowserContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    for (const { city, industry } of workItems) {
      console.log(`\n📍 [Worker ${workerId}] ${city} - ${industry}:`);

      const businesses = await scrapeGoogleMaps(page, industry, city, workerId);

      for (const business of businesses) {
        const saved = await saveLeadToDatabase(business, industry, city, workerId);
        if (saved) {
          totalAdded++;
          workerAdded++;
          console.log(`   [Worker ${workerId}] 💾 Saved (total: ${totalAdded})`);
        }
      }
    }
  } catch (error) {
    console.error(`[Worker ${workerId}] Fatal error:`, error);
  } finally {
    await context.close();
  }

  console.log(`\n✅ [Worker ${workerId}] Finished - added ${workerAdded} leads`);
  return workerAdded;
}

async function main() {
  console.log('🔍 TTWF Lead Generator - Real Business Scraper (Parallel Mode)\n');
  console.log('================================================================\n');
  console.log(`⚙️  Configuration:`);
  console.log(`   - Parallel workers: ${PARALLEL_WORKERS}`);
  console.log(`   - Max results per search: ${MAX_RESULTS_PER_SEARCH}\n`);

  let browser: Browser | null = null;

  try {
    // Count existing leads
    const existingCount = await prisma.lead.count();
    console.log(`📊 Existing leads in database: ${existingCount}\n`);

    // Step 1: Launch browser
    console.log('🌐 Launching browser...\n');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Step 2: Build work queue
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

    // Step 3: Distribute work across workers
    const workChunks = chunkArray(workQueue, PARALLEL_WORKERS);

    // Step 4: Run workers in parallel
    console.log('🔎 Starting parallel scraping...\n');
    console.log('================================================================\n');

    const startTime = Date.now();
    
    const results = await Promise.all(
      workChunks.map((chunk, index) => 
        workerTask(browser!, chunk, index + 1)
      )
    );

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    // Step 5: Report results
    console.log(`\n================================================================`);
    console.log(`✅ Scraping complete!`);
    console.log(`================================================================`);
    console.log(`   Total leads added: ${totalAdded}`);
    console.log(`   By worker: ${results.map((r, i) => `Worker ${i + 1}: ${r}`).join(', ')}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log(`   Final database count: ${await prisma.lead.count()}`);
    console.log(`================================================================\n`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

main();
