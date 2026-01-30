/**
 * Script to scrape REAL South African businesses from Google Maps
 * Run with: npx tsx scripts/scrape-real-leads.ts
 * 
 * Uses Google PageSpeed Insights API for website quality analysis
 * With exponential backoff retry logic for API rate limits
 */

import { PrismaClient } from '@prisma/client';
import { Browser, BrowserContext, chromium, Page } from 'playwright';

const prisma = new PrismaClient();

// Configuration
const PARALLEL_WORKERS = 1; // Single worker to avoid rate limits
const MAX_RESULTS_PER_SEARCH = 10; // Limit per search
const DELAY_BETWEEN_LISTINGS = 1000; // ms between clicking listings
const DELAY_BETWEEN_SEARCHES = 2000; // ms between searches
const TARGET_LEADS = 50; // Stop after this many leads are added

// PageSpeed API retry configuration
const PAGESPEED_MAX_RETRIES = 5;
const PAGESPEED_INITIAL_BACKOFF_MS = 60000; // 1 minute initial backoff
const DELAY_BETWEEN_API_CALLS = 2000; // 2 seconds between API calls

// Flag to stop all workers if API fails permanently
let stopAllWorkers = false;

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

// Scrape emails from a website
async function scrapeEmailsFromWebsite(
  browser: Browser,
  websiteUrl: string,
  workerId: number
): Promise<string[]> {
  const emails: string[] = [];
  let context: BrowserContext | null = null;
  
  try {
    // Ensure URL has protocol
    let url = websiteUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    console.log(`   [Worker ${workerId}] 📧 Scraping emails from: ${url}`);
    
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    
    // Navigate to the website
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1000); // Let page settle
    
    // Get page content and extract emails
    const pageContent = await page.content();
    
    // Email regex pattern
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const foundEmails = pageContent.match(emailPattern) || [];
    
    // Filter and deduplicate
    for (const email of foundEmails) {
      const cleanEmail = email.toLowerCase().trim();
      // Filter out common false positives
      if (
        !cleanEmail.includes('example.com') &&
        !cleanEmail.includes('sentry.io') &&
        !cleanEmail.includes('wixpress') &&
        !cleanEmail.includes('@2x') &&
        !cleanEmail.includes('.png') &&
        !cleanEmail.includes('.jpg') &&
        !cleanEmail.includes('.svg') &&
        !emails.includes(cleanEmail)
      ) {
        emails.push(cleanEmail);
      }
    }
    
    // Also check for mailto: links
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      if (href) {
        const emailMatch = href.match(/mailto:([^?]+)/);
        if (emailMatch && emailMatch[1]) {
          const email = emailMatch[1].toLowerCase().trim();
          if (!emails.includes(email)) {
            emails.push(email);
          }
        }
      }
    }
    
    // Try to find contact page and scrape from there too
    const contactLinks = await page.locator('a[href*="contact"], a[href*="Contact"], a:has-text("Contact")').all();
    if (contactLinks.length > 0) {
      try {
        await contactLinks[0].click();
        await sleep(2000);
        
        const contactContent = await page.content();
        const contactEmails = contactContent.match(emailPattern) || [];
        
        for (const email of contactEmails) {
          const cleanEmail = email.toLowerCase().trim();
          if (
            !cleanEmail.includes('example.com') &&
            !cleanEmail.includes('sentry.io') &&
            !cleanEmail.includes('wixpress') &&
            !emails.includes(cleanEmail)
          ) {
            emails.push(cleanEmail);
          }
        }
      } catch {
        // Contact page navigation failed, continue with what we have
      }
    }
    
    if (emails.length > 0) {
      console.log(`   [Worker ${workerId}] ✉️ Found ${emails.length} email(s): ${emails.slice(0, 3).join(', ')}${emails.length > 3 ? '...' : ''}`);
    } else {
      console.log(`   [Worker ${workerId}] 📭 No emails found on website`);
    }
    
  } catch (error: any) {
    console.log(`   [Worker ${workerId}] ⚠️ Email scrape failed: ${error?.message || error}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
  
  return emails;
}

async function extractBusinessDetails(
  page: Page,
  workerId: number
): Promise<ScrapedBusiness | null> {
  try {
    // Wait for panel to stabilize
    await sleep(800);

    // Extract business name - try multiple approaches
    let name: string | null = null;
    
    // Method 1: Look for the first h1 that's not "Results"
    const h1Elements = await page.locator('h1').all();
    for (const h1 of h1Elements) {
      const text = await h1.textContent({ timeout: 500 }).catch(() => null);
      if (text && text.length > 2 && text.length < 100 && 
          !text.toLowerCase().includes('results') &&
          !text.toLowerCase().includes('google maps')) {
        name = text.trim();
        break;
      }
    }
    
    // Method 2: Try to get name from the URL
    if (!name) {
      const url = page.url();
      const placeMatch = url.match(/\/place\/([^\/]+)/);
      if (placeMatch) {
        name = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
      }
    }
    
    if (!name) return null;

    // Extract address - try multiple selectors
    let address: string | null = null;
    const addressSelectors = [
      '[data-item-id="address"] .fontBodyMedium',
      '[data-item-id="address"]',
      'button[data-item-id="address"]',
    ];
    for (const sel of addressSelectors) {
      address = await page.locator(sel).first().textContent({ timeout: 1000 }).catch(() => null);
      if (address) break;
    }

    // Extract ALL phone numbers
    const phones: string[] = [];
    try {
      // Method 1: From phone elements
      const phoneElements = await page.locator('[data-item-id^="phone:"]').all();
      for (const phoneEl of phoneElements) {
        const phoneText = await phoneEl.textContent({ timeout: 500 }).catch(() => null);
        if (phoneText) {
          // Extract just the phone number part
          const cleanPhone = phoneText.replace(/[^0-9+\-\s()]/g, '').trim();
          if (cleanPhone && cleanPhone.length >= 10 && !phones.includes(cleanPhone)) {
            phones.push(cleanPhone);
          }
        }
      }
      
      // Method 2: Look for phone patterns in aria-labels
      const phoneLinks = await page.locator('a[data-item-id^="phone:"], button[data-item-id^="phone:"]').all();
      for (const link of phoneLinks) {
        const ariaLabel = await link.getAttribute('aria-label').catch(() => null);
        if (ariaLabel) {
          const phoneMatch = ariaLabel.match(/[\d\s+()-]{10,}/);
          if (phoneMatch && !phones.includes(phoneMatch[0].trim())) {
            phones.push(phoneMatch[0].trim());
          }
        }
      }
    } catch {
      // Phone extraction failed, continue with empty array
    }

    // Extract website
    let website: string | null = null;
    try {
      website = await page.locator('[data-item-id="authority"] a').getAttribute('href', { timeout: 1500 }).catch(() => null);
      if (!website) {
        // Try alternative selector
        website = await page.locator('a[data-item-id="authority"]').getAttribute('href', { timeout: 1000 }).catch(() => null);
      }
    } catch {
      // Website extraction failed
    }

    // Extract rating from aria-label
    let rating: number | undefined;
    try {
      const ratingElements = await page.locator('[aria-label*="star"]').all();
      for (const el of ratingElements) {
        const ariaLabel = await el.getAttribute('aria-label').catch(() => null);
        if (ariaLabel) {
          const match = ariaLabel.match(/([\d.]+)\s*star/i);
          if (match) {
            rating = parseFloat(match[1]);
            break;
          }
        }
      }
    } catch {
      // Rating extraction failed
    }

    // Extract review count
    let reviewCount: number | undefined;
    try {
      const reviewElements = await page.locator('[aria-label*="review"]').all();
      for (const el of reviewElements) {
        const text = await el.textContent().catch(() => null);
        if (text) {
          const match = text.match(/\(([\d,]+)\)/);
          if (match) {
            reviewCount = parseInt(match[1].replace(/,/g, ''));
            break;
          }
        }
      }
    } catch {
      // Review count extraction failed
    }

    // Extract category
    const category = await page
      .locator('button[jsaction*="category"]')
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => null);

    const currentUrl = page.url();

    return {
      name: name.trim(),
      address: address?.trim() || '',
      phones,
      emails: [],
      website: website?.trim(),
      rating,
      reviewCount,
      googleMapsUrl: currentUrl,
      category: category?.trim(),
    };
  } catch (error) {
    // Silently fail - don't log every extraction error
    return null;
  }
}

async function scrapeGoogleMaps(
  page: Page,
  browser: Browser,
  query: string,
  location: string,
  workerId: number
): Promise<{ business: ScrapedBusiness; qualityScore?: number; qualityDetails?: WebsiteQualityResult }[] | null> {
  // Check if we should stop
  if (stopAllWorkers) {
    return null;
  }
  
  const results: { business: ScrapedBusiness; qualityScore?: number; qualityDetails?: WebsiteQualityResult }[] = [];
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
    for (let i = 0; i < 2; i++) {
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
      // Check if we should stop
      if (stopAllWorkers) {
        console.log(`   [Worker ${workerId}] ⛔ Stopping due to API failure`);
        return null;
      }
      
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

        // Check if this is a good prospect based on website quality (uses Google PageSpeed API)
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
            business.emails = allEmails.filter((email, index) => allEmails.indexOf(email) === index);
          }
          
          results.push({
            business,
            qualityScore: prospectCheck.qualityScore,
            qualityDetails: prospectCheck.qualityDetails,
          });
          const scoreInfo = prospectCheck.qualityScore !== undefined ? ` (Quality: ${prospectCheck.qualityScore}/100)` : '';
          const emailInfo = business.emails.length > 0 ? `, ${business.emails.length} email(s)` : '';
          console.log(`   [Worker ${workerId}] ✓ Found: ${business.name} (${business.rating}⭐, ${business.phones.length} phones${emailInfo}) [${prospectCheck.reason}]${scoreInfo}`);
          
          // Check if we've reached target leads
          if (totalAdded + results.length >= TARGET_LEADS) {
            console.log(`   [Worker ${workerId}] 🎯 Target of ${TARGET_LEADS} leads reached!`);
            break;
          }
        } else if (!prospectCheck.isGood) {
          const scoreInfo = prospectCheck.qualityScore !== undefined ? ` (Quality: ${prospectCheck.qualityScore}/100)` : '';
          console.log(`   [Worker ${workerId}] Skip: ${business.name} - ${prospectCheck.reason}${scoreInfo}`);
        } else {
          console.log(`   [Worker ${workerId}] Skip: ${business.name} - Low rating (${business.rating || 'N/A'})`);
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

// Check if website is a social media or directory listing (always good prospects)
function isSocialOrDirectory(website: string): boolean {
  const socialPatterns = [
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'linkedin.com',
    'yellowpages',
    'gumtree',
    'locanto',
    'hotfrog',
    'cylex',
    'brabys',
    'findit',
    'snupit',
    'yell.com',
    'yelp.com',
  ];
  return socialPatterns.some(pattern => website.toLowerCase().includes(pattern));
}

// Check if website URL indicates a DIY/template site
function isDIYWebsiteUrl(website: string): boolean {
  const diyPatterns = [
    'wix.com', 'wixsite.com', 'weebly.com', 'wordpress.com',
    'squarespace.com', 'webnode.com', 'jimdo.com', 'site123.com',
    'webs.com', 'yola.com', 'strikingly.com', 'carrd.co',
    'webflow.io', 'netlify.app', 'vercel.app', 'herokuapp.com',
    'blogspot.com', 'blogger.com', 'tumblr.com',
    'sites.google.com', 'google.com/site',
    'co.za.com', 'mweb.co.za/sites',
  ];
  return diyPatterns.some(pattern => website.toLowerCase().includes(pattern));
}

// Website quality analysis result from Google PageSpeed Insights
interface WebsiteQualityResult {
  score: number; // 0-100 overall score
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  issues: string[];
  error?: string;
}

// Use Google PageSpeed Insights API with retry and exponential backoff
async function analyzeWebsiteQuality(
  websiteUrl: string,
  workerId: number
): Promise<WebsiteQualityResult> {
  const result: WebsiteQualityResult = {
    score: 50,
    performance: 0,
    accessibility: 0,
    bestPractices: 0,
    seo: 0,
    issues: [],
  };

  // Ensure URL has protocol
  let url = websiteUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Google PageSpeed Insights API - completely FREE
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=mobile`;
  
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= PAGESPEED_MAX_RETRIES; attempt++) {
    try {
      console.log(`   [Worker ${workerId}] 🔍 PageSpeed API call (attempt ${attempt}/${PAGESPEED_MAX_RETRIES}): ${url}`);
      
      // Add delay between API calls
      if (attempt > 1) {
        const backoffMs = PAGESPEED_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 2); // Exponential backoff
        console.log(`   [Worker ${workerId}] ⏳ Waiting ${Math.round(backoffMs / 1000)}s before retry...`);
        await sleep(backoffMs);
      } else {
        await sleep(DELAY_BETWEEN_API_CALLS); // Standard delay between calls
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.status === 429) {
        lastError = 'Rate limited (429)';
        console.log(`   [Worker ${workerId}] ⚠️ Rate limited, will retry...`);
        continue; // Retry with backoff
      }
      
      if (!response.ok) {
        lastError = `API returned ${response.status}`;
        console.log(`   [Worker ${workerId}] ⚠️ API error ${response.status}, will retry...`);
        continue; // Retry
      }
      
      const data = await response.json();
      
      // Extract scores (they're 0-1, multiply by 100)
      const categories = data.lighthouseResult?.categories;
      if (categories) {
        result.performance = Math.round((categories.performance?.score || 0) * 100);
        result.accessibility = Math.round((categories.accessibility?.score || 0) * 100);
        result.bestPractices = Math.round((categories['best-practices']?.score || 0) * 100);
        result.seo = Math.round((categories.seo?.score || 0) * 100);
        
        // Calculate overall score (weighted average)
        result.score = Math.round(
          (result.performance * 0.25) +
          (result.accessibility * 0.25) +
          (result.bestPractices * 0.25) +
          (result.seo * 0.25)
        );
      }
      
      // Extract specific issues/audits that failed
      const audits = data.lighthouseResult?.audits;
      if (audits) {
        if (audits['is-on-https']?.score === 0) result.issues.push('No HTTPS');
        if (audits['viewport']?.score === 0) result.issues.push('No viewport meta tag');
        if (audits['document-title']?.score === 0) result.issues.push('Missing page title');
        if (audits['meta-description']?.score === 0) result.issues.push('Missing meta description');
        if (audits['image-alt']?.score === 0) result.issues.push('Images missing alt text');
        if (audits['color-contrast']?.score === 0) result.issues.push('Poor color contrast');
        if (audits['tap-targets']?.score === 0) result.issues.push('Tap targets too small');
        if (audits['font-size']?.score === 0) result.issues.push('Font too small for mobile');
        if (result.performance < 50) result.issues.push('Poor performance');
        if (result.seo < 50) result.issues.push('Poor SEO');
      }
      
      console.log(`   [Worker ${workerId}] ✅ PageSpeed: Overall=${result.score} | Perf=${result.performance} | A11y=${result.accessibility} | BP=${result.bestPractices} | SEO=${result.seo}`);
      
      return result; // Success!
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        lastError = 'Request timeout';
      } else {
        lastError = error?.message || 'Unknown error';
      }
      console.log(`   [Worker ${workerId}] ⚠️ Attempt ${attempt} failed: ${lastError}`);
    }
  }
  
  // All retries exhausted - this is a fatal error
  console.error(`\n❌ [Worker ${workerId}] FATAL: PageSpeed API failed after ${PAGESPEED_MAX_RETRIES} retries: ${lastError}`);
  console.error(`❌ Cannot guarantee lead quality - stopping process.\n`);
  
  result.error = `API failed after ${PAGESPEED_MAX_RETRIES} retries: ${lastError}`;
  stopAllWorkers = true; // Signal all workers to stop
  
  return result;
}

// Quality threshold - websites scoring below this are good prospects
const WEBSITE_QUALITY_THRESHOLD = 60;

// Determine if this is a good prospect based on website quality
async function isGoodProspect(
  website: string | undefined,
  workerId: number
): Promise<{ isGood: boolean; reason: string; qualityScore?: number; qualityDetails?: WebsiteQualityResult; shouldStop?: boolean }> {
  // Check if we should stop
  if (stopAllWorkers) {
    return { isGood: false, reason: 'STOPPED', shouldStop: true };
  }
  
  // No website = perfect prospect
  if (!website) {
    return { isGood: true, reason: 'NO_WEBSITE' };
  }
  
  // Social media or directory = good prospect
  if (isSocialOrDirectory(website)) {
    return { isGood: true, reason: 'SOCIAL_OR_DIRECTORY' };
  }
  
  // DIY website URL patterns = good prospect
  if (isDIYWebsiteUrl(website)) {
    return { isGood: true, reason: 'DIY_WEBSITE_PLATFORM' };
  }
  
  // Has a proper domain - analyze using Google PageSpeed Insights API
  const qualityResult = await analyzeWebsiteQuality(website, workerId);
  
  // Check if API failed fatally
  if (stopAllWorkers) {
    return { isGood: false, reason: 'API_FAILED', shouldStop: true };
  }
  
  // If website has poor score, it's a good prospect
  if (qualityResult.score < WEBSITE_QUALITY_THRESHOLD) {
    return { 
      isGood: true, 
      reason: 'POOR_QUALITY_WEBSITE',
      qualityScore: qualityResult.score,
      qualityDetails: qualityResult
    };
  }
  
  // Website is decent quality - skip this lead
  return { 
    isGood: false, 
    reason: 'HAS_QUALITY_WEBSITE',
    qualityScore: qualityResult.score,
    qualityDetails: qualityResult
  };
}

function calculateWebsiteScore(website: string | null | undefined, qualityScore?: number): number {
  if (!website) return 0; // No website = best prospect
  if (isSocialOrDirectory(website)) return 15; // Social only = great prospect
  if (isDIYWebsiteUrl(website)) return 25; // DIY platform = great prospect
  if (qualityScore !== undefined) {
    // Invert the quality score - lower quality = better prospect score
    return Math.round(qualityScore * 0.7); // Max 70 for analyzed sites
  }
  return 70; // Default for unanalyzed proper websites
}

async function saveLeadToDatabase(
  business: ScrapedBusiness, 
  industry: string, 
  location: string,
  workerId: number,
  qualityScore?: number,
  qualityDetails?: WebsiteQualityResult
): Promise<boolean> {
  try {
    const websiteScore = calculateWebsiteScore(business.website, qualityScore);
    
    const leadScore = Math.round(
      (business.rating || 4) * 15 +
      Math.min((business.reviewCount || 0) / 10, 20) +
      (100 - websiteScore) * 0.4 // Increased weight for website quality
    );

    const primaryPhone = business.phones[0] || null;
    const primaryEmail = business.emails[0] || null;

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

    // Determine prospect type for notes
    let prospectNote = '';
    if (!business.website) {
      prospectNote = '🎯 NO WEBSITE - Perfect prospect!';
    } else if (isSocialOrDirectory(business.website)) {
      prospectNote = '📱 Only has social media/directory listing - Great prospect!';
    } else if (isDIYWebsiteUrl(business.website)) {
      prospectNote = '🔧 Has DIY website platform - Good prospect for upgrade!';
    } else if (qualityDetails) {
      prospectNote = `📊 PageSpeed Score: ${qualityScore}/100 (Perf: ${qualityDetails.performance}, SEO: ${qualityDetails.seo}, A11y: ${qualityDetails.accessibility})`;
      if (qualityDetails.issues.length > 0) {
        prospectNote += ` | Issues: ${qualityDetails.issues.slice(0, 3).join(', ')}`;
      }
    } else {
      prospectNote = `Website: ${business.website}`;
    }
    
    const notes = [
      `Scraped from Google Maps.`,
      prospectNote,
      business.phones.length > 1 ? `📞 Additional phones: ${business.phones.slice(1).join(', ')}` : '',
      business.emails.length > 0 ? `✉️ Emails found: ${business.emails.join(', ')}` : '',
    ].filter(Boolean).join(' ');

    // Create the lead
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
        notes,
        metadata: {
          phones: business.phones,
          emails: business.emails,
          category: business.category,
          pageSpeedAnalysis: qualityDetails ? {
            overallScore: qualityDetails.score,
            performance: qualityDetails.performance,
            accessibility: qualityDetails.accessibility,
            bestPractices: qualityDetails.bestPractices,
            seo: qualityDetails.seo,
            issues: qualityDetails.issues,
          } : undefined,
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
        // Check if we should stop
        if (stopAllWorkers) {
          console.log(`   [Worker ${workerId}] ⛔ Stopping due to API failure`);
          break;
        }
        
        // Check if we've reached target
        if (totalAdded >= TARGET_LEADS) {
          console.log(`   [Worker ${workerId}] 🎯 Target reached, stopping worker`);
          break;
        }
        
        const activePage = await ensurePage();
        const businessResults = await scrapeGoogleMaps(activePage, browser, industry, city, workerId);
        
        // Check if scraping was stopped due to API failure
        if (businessResults === null) {
          console.log(`   [Worker ${workerId}] ⛔ Stopping due to API failure`);
          break;
        }
        
        consecutiveErrors = 0; // Reset on success

        for (const { business, qualityScore, qualityDetails } of businessResults) {
          if (totalAdded >= TARGET_LEADS || stopAllWorkers) break;
          
          const saved = await saveLeadToDatabase(business, industry, city, workerId, qualityScore, qualityDetails);
          if (saved) {
            totalAdded++;
            workerAdded++;
            console.log(`   [Worker ${workerId}] 💾 Saved (total: ${totalAdded}/${TARGET_LEADS})`);
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
