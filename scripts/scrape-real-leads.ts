/**
 * Script to scrape REAL South African businesses from Google Maps
 * Run with: npx tsx scripts/scrape-real-leads.ts
 */

import { PrismaClient } from '@prisma/client';
import { chromium, Browser, Page } from 'playwright';

const prisma = new PrismaClient();

interface ScrapedBusiness {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl: string;
  category?: string;
  placeId?: string;
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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clearExistingLeads(): Promise<void> {
  console.log('🗑️  Clearing existing sample leads...');
  
  // Delete related messages first
  await prisma.message.deleteMany({});
  
  // Delete leads
  const result = await prisma.lead.deleteMany({});
  console.log(`   Deleted ${result.count} existing leads\n`);
}

async function scrapeGoogleMaps(
  page: Page,
  query: string,
  location: string,
  maxResults: number = 10
): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const searchQuery = `${query} ${location} South Africa`;
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

  try {
    console.log(`   Searching: "${searchQuery}"...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Accept cookies if prompted
    try {
      const acceptButton = page.locator('button:has-text("Accept all")');
      if (await acceptButton.isVisible({ timeout: 2000 })) {
        await acceptButton.click();
        await sleep(1000);
      }
    } catch {
      // No cookie prompt
    }

    // Wait for results
    await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => null);

    // Scroll to load more results
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });
      await sleep(1500);
    }

    // Get all listings
    const listings = await page.locator('[role="feed"] > div > div > a[href*="/maps/place"]').all();
    console.log(`   Found ${listings.length} listings`);

    for (let i = 0; i < Math.min(listings.length, maxResults); i++) {
      try {
        const listing = listings[i];
        await listing.click();
        await sleep(2000);

        // Extract business details
        const name = await page.locator('h1').first().textContent().catch(() => null);
        if (!name) continue;

        const address = await page
          .locator('[data-item-id="address"] .fontBodyMedium')
          .textContent()
          .catch(() => null);

        const phone = await page
          .locator('[data-item-id^="phone:"] .fontBodyMedium')
          .textContent()
          .catch(() => null);

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
            phone: phone?.trim(),
            website: website?.trim(),
            rating,
            reviewCount,
            googleMapsUrl: currentUrl,
            category: category?.trim() || query,
            placeId: currentUrl.match(/!1s([^!]+)/)?.[1],
          });
          console.log(`   ✓ Added: ${name.trim()} (${rating}⭐)`);
        }

        await sleep(1000);
      } catch (err) {
        // Continue to next listing
      }
    }
  } catch (error) {
    console.error(`   Error searching: ${error}`);
  }

  return results;
}

async function calculateWebsiteScore(website: string | null | undefined): Promise<number> {
  if (!website) return 0; // No website = perfect prospect!
  if (website.includes('facebook.com') || website.includes('instagram.com')) return 20;
  if (website.includes('yellowpages') || website.includes('gumtree')) return 30;
  return 60; // Has some website
}

async function saveLeadToDatabase(business: ScrapedBusiness, industry: string, location: string): Promise<boolean> {
  try {
    // Check if already exists
    const existing = await prisma.lead.findFirst({
      where: {
        OR: [
          { businessName: business.name },
          { googleMapsUrl: business.googleMapsUrl },
        ],
      },
    });

    if (existing) return false;

    const websiteScore = await calculateWebsiteScore(business.website);
    const leadScore = Math.round(
      (business.rating || 4) * 15 + // Rating weight
      Math.min((business.reviewCount || 0) / 10, 20) + // Reviews weight
      (100 - websiteScore) * 0.3 // Website quality (lower = better prospect)
    );

    await prisma.lead.create({
      data: {
        businessName: business.name,
        contactName: null,
        email: null,
        phone: business.phone,
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
        websiteQualityScore: websiteScore,
        leadScore: Math.min(100, Math.max(0, leadScore)),
        notes: `Scraped from Google Maps. ${!business.website ? 'NO WEBSITE - Great prospect!' : `Website: ${business.website}`}`,
      },
    });

    return true;
  } catch (error) {
    console.error(`Error saving lead: ${error}`);
    return false;
  }
}

async function main() {
  console.log('🔍 TTWF Lead Generator - Real Business Scraper\n');
  console.log('================================================\n');

  let browser: Browser | null = null;

  try {
    // Step 1: Clear existing data
    await clearExistingLeads();

    // Step 2: Launch browser
    console.log('🌐 Launching browser...\n');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-ZA',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    // Step 3: Scrape businesses
    let totalAdded = 0;
    const targetLeads = 120; // Aim for 120 to ensure at least 100

    // Shuffle arrays for variety
    const shuffledCities = SA_CITIES.sort(() => Math.random() - 0.5);
    const shuffledIndustries = INDUSTRIES.sort(() => Math.random() - 0.5);

    console.log('🔎 Starting search...\n');

    for (const city of shuffledCities) {
      if (totalAdded >= targetLeads) break;

      for (const industry of shuffledIndustries) {
        if (totalAdded >= targetLeads) break;

        console.log(`\n📍 ${city} - ${industry}:`);

        const businesses = await scrapeGoogleMaps(page, industry, city, 5);

        for (const business of businesses) {
          const saved = await saveLeadToDatabase(business, industry, city);
          if (saved) {
            totalAdded++;
            console.log(`   💾 Saved (${totalAdded}/${targetLeads})`);
          }
        }

        // Rate limiting between searches
        await sleep(2000);
      }
    }

    console.log(`\n================================================`);
    console.log(`✅ Scraping complete! Added ${totalAdded} real leads.`);
    console.log(`================================================\n`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

main();
