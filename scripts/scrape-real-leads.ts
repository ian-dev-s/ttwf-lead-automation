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
): Promise<{ business: ScrapedBusiness; qualityScore?: number; qualityIssues?: string[] }[]> {
  const results: { business: ScrapedBusiness; qualityScore?: number; qualityIssues?: string[] }[] = [];
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

        // Check if this is a good prospect based on website quality
        const prospectCheck = await isGoodProspect(business.website, browser, workerId);

        // Include if: good prospect AND has decent rating (3.0+)
        if (prospectCheck.isGood && business.rating && business.rating >= 3.0) {
          results.push({
            business,
            qualityScore: prospectCheck.qualityScore,
            qualityIssues: prospectCheck.issues,
          });
          const scoreInfo = prospectCheck.qualityScore !== undefined ? ` (Quality: ${prospectCheck.qualityScore}/100)` : '';
          console.log(`   [Worker ${workerId}] ✓ Found: ${business.name} (${business.rating}⭐, ${business.phones.length} phones) [${prospectCheck.reason}]${scoreInfo}`);
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

// Website quality analysis result
interface WebsiteQualityResult {
  score: number; // 0-100 (lower = worse quality = better prospect)
  issues: string[];
  loadTime: number;
  hasSSL: boolean;
  hasMobileViewport: boolean;
  hasProperTitle: boolean;
  hasDescription: boolean;
  hasImages: boolean;
  hasContactInfo: boolean;
  isResponsive: boolean;
  error?: string;
}

// Actually visit and analyze website quality
async function analyzeWebsiteQuality(
  browser: Browser,
  websiteUrl: string,
  workerId: number
): Promise<WebsiteQualityResult> {
  const result: WebsiteQualityResult = {
    score: 50, // Default middle score
    issues: [],
    loadTime: 0,
    hasSSL: false,
    hasMobileViewport: false,
    hasProperTitle: false,
    hasDescription: false,
    hasImages: false,
    hasContactInfo: false,
    isResponsive: false,
  };

  let context: BrowserContext | null = null;
  
  try {
    // Ensure URL has protocol
    let url = websiteUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Check SSL
    result.hasSSL = url.startsWith('https://');
    if (!result.hasSSL) {
      result.issues.push('No SSL certificate (HTTP only)');
    }

    // Create a new context for website analysis
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(10000);

    // Measure load time
    const startTime = Date.now();
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      result.error = 'Failed to load website';
      result.issues.push('Website failed to load or timed out');
      result.score = 20; // Poor score for non-loading sites
      return result;
    }
    
    result.loadTime = Date.now() - startTime;
    
    // Slow load time is a bad sign
    if (result.loadTime > 5000) {
      result.issues.push(`Slow load time (${(result.loadTime / 1000).toFixed(1)}s)`);
    }

    // Check for mobile viewport meta tag
    const viewportMeta = await page.locator('meta[name="viewport"]').count();
    result.hasMobileViewport = viewportMeta > 0;
    if (!result.hasMobileViewport) {
      result.issues.push('No mobile viewport meta tag');
    }

    // Check title
    const title = await page.title();
    result.hasProperTitle = title.length > 10 && title.length < 100;
    if (!result.hasProperTitle) {
      result.issues.push('Missing or poor page title');
    }

    // Check meta description
    const description = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
    result.hasDescription = !!description && description.length > 20;
    if (!result.hasDescription) {
      result.issues.push('Missing meta description');
    }

    // Check for images
    const imageCount = await page.locator('img').count();
    result.hasImages = imageCount > 0;
    if (imageCount === 0) {
      result.issues.push('No images on the page');
    }

    // Check for contact information (phone, email patterns)
    const pageContent = await page.content();
    const hasPhone = /(\+27|0\d{2})[\s.-]?\d{3}[\s.-]?\d{4}/.test(pageContent);
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(pageContent);
    result.hasContactInfo = hasPhone || hasEmail;
    if (!result.hasContactInfo) {
      result.issues.push('No visible contact information');
    }

    // Check for modern CSS/responsiveness indicators
    const hasModernCSS = await page.evaluate(() => {
      const styles = Array.from(document.styleSheets).some(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          return rules.some(rule => 
            rule.cssText?.includes('flex') || 
            rule.cssText?.includes('grid') ||
            rule.cssText?.includes('@media')
          );
        } catch { return false; }
      });
      
      // Also check inline styles
      const elements = document.querySelectorAll('[style]');
      const hasInlineFlex = Array.from(elements).some(el => 
        el.getAttribute('style')?.includes('flex') ||
        el.getAttribute('style')?.includes('grid')
      );
      
      return styles || hasInlineFlex;
    });
    
    result.isResponsive = hasModernCSS && result.hasMobileViewport;
    if (!result.isResponsive) {
      result.issues.push('Website may not be responsive/mobile-friendly');
    }

    // Check for outdated indicators
    const hasOutdatedIndicators = await page.evaluate(() => {
      // Check for tables used for layout (old school)
      const layoutTables = document.querySelectorAll('table[width], table[bgcolor]');
      // Check for old HTML elements
      const oldElements = document.querySelectorAll('font, center, marquee, blink');
      // Check for Flash
      const hasFlash = document.querySelectorAll('object[type*="flash"], embed[type*="flash"]').length > 0;
      
      return layoutTables.length > 2 || oldElements.length > 0 || hasFlash;
    });
    
    if (hasOutdatedIndicators) {
      result.issues.push('Website uses outdated HTML/design patterns');
    }

    // Check for broken images
    const brokenImages = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      let broken = 0;
      images.forEach(img => {
        if (!img.complete || img.naturalWidth === 0) broken++;
      });
      return broken;
    });
    
    if (brokenImages > 0) {
      result.issues.push(`${brokenImages} broken image(s)`);
    }

    // Calculate final score based on issues
    // Start at 100, deduct points for each issue
    let score = 100;
    
    if (!result.hasSSL) score -= 15;
    if (!result.hasMobileViewport) score -= 20;
    if (!result.hasProperTitle) score -= 10;
    if (!result.hasDescription) score -= 10;
    if (!result.hasImages) score -= 5;
    if (!result.hasContactInfo) score -= 10;
    if (!result.isResponsive) score -= 15;
    if (result.loadTime > 5000) score -= 10;
    if (result.loadTime > 10000) score -= 10;
    if (hasOutdatedIndicators) score -= 20;
    if (brokenImages > 0) score -= 5 * Math.min(brokenImages, 3);

    result.score = Math.max(0, Math.min(100, score));
    
    console.log(`   [Worker ${workerId}] 🔍 Website analysis: ${websiteUrl} - Score: ${result.score}/100, Issues: ${result.issues.length}`);

  } catch (error: any) {
    result.error = error?.message || 'Unknown error';
    result.issues.push('Error analyzing website');
    result.score = 25; // Give benefit of doubt - probably a bad site
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  return result;
}

// Quality threshold - websites scoring below this are good prospects
const WEBSITE_QUALITY_THRESHOLD = 60;

// Determine if this is a good prospect based on website quality
async function isGoodProspect(
  website: string | undefined,
  browser: Browser | null,
  workerId: number
): Promise<{ isGood: boolean; reason: string; qualityScore?: number; issues?: string[] }> {
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
  
  // Has a proper domain - need to analyze the actual website quality
  if (browser) {
    const qualityResult = await analyzeWebsiteQuality(browser, website, workerId);
    
    // If website failed to load or has many issues, it's a good prospect
    if (qualityResult.error || qualityResult.score < WEBSITE_QUALITY_THRESHOLD) {
      return { 
        isGood: true, 
        reason: 'POOR_QUALITY_WEBSITE',
        qualityScore: qualityResult.score,
        issues: qualityResult.issues
      };
    }
    
    // Website is decent quality - skip this lead
    return { 
      isGood: false, 
      reason: 'HAS_QUALITY_WEBSITE',
      qualityScore: qualityResult.score
    };
  }
  
  // No browser available for analysis - assume it's a decent website
  return { isGood: false, reason: 'HAS_WEBSITE_UNANALYZED' };
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
  qualityIssues?: string[]
): Promise<boolean> {
  try {
    const websiteScore = calculateWebsiteScore(business.website, qualityScore);
    
    const leadScore = Math.round(
      (business.rating || 4) * 15 +
      Math.min((business.reviewCount || 0) / 10, 20) +
      (100 - websiteScore) * 0.4 // Increased weight for website quality
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

    // Determine prospect type for notes
    let prospectNote = '';
    if (!business.website) {
      prospectNote = '🎯 NO WEBSITE - Perfect prospect!';
    } else if (isSocialOrDirectory(business.website)) {
      prospectNote = '📱 Only has social media/directory listing - Great prospect!';
    } else if (isDIYWebsiteUrl(business.website)) {
      prospectNote = '🔧 Has DIY website platform - Good prospect for upgrade!';
    } else if (qualityScore !== undefined && qualityScore < WEBSITE_QUALITY_THRESHOLD) {
      prospectNote = `⚠️ Website quality score: ${qualityScore}/100 - Needs improvement!`;
      if (qualityIssues && qualityIssues.length > 0) {
        prospectNote += ` Issues: ${qualityIssues.join(', ')}`;
      }
    } else {
      prospectNote = `Website: ${business.website}`;
    }
    
    const notes = [
      `Scraped from Google Maps.`,
      prospectNote,
      business.phones.length > 1 ? `📞 Additional phones: ${business.phones.slice(1).join(', ')}` : '',
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
          websiteAnalysis: qualityScore !== undefined ? {
            score: qualityScore,
            issues: qualityIssues || [],
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
        const activePage = await ensurePage();
        const businessResults = await scrapeGoogleMaps(activePage, browser, industry, city, workerId);
        consecutiveErrors = 0; // Reset on success

        for (const { business, qualityScore, qualityIssues } of businessResults) {
          const saved = await saveLeadToDatabase(business, industry, city, workerId, qualityScore, qualityIssues);
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
