import { ScrapedBusiness, ScrapingParams } from '@/types';
import { Browser, chromium, Page } from 'playwright';
import { sleep } from '../utils';

export interface GoogleMapsScraperConfig {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  maxResults?: number;
  delayBetweenRequests?: number;
}

const DEFAULT_CONFIG: GoogleMapsScraperConfig = {
  headless: true,
  slowMo: 50, // Reduced from 100
  timeout: 20000, // Reduced from 30000
  maxResults: 20,
  delayBetweenRequests: 500, // Reduced from 2000
};

export class GoogleMapsScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: GoogleMapsScraperConfig;

  constructor(config: Partial<GoogleMapsScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-ZA',
      geolocation: { latitude: -26.2041, longitude: 28.0473 }, // Johannesburg
      permissions: ['geolocation'],
    });

    this.page = await context.newPage();
    
    // Set default timeout
    this.page.setDefaultTimeout(this.config.timeout!);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async searchBusinesses(params: ScrapingParams): Promise<ScrapedBusiness[]> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const results: ScrapedBusiness[] = [];
    const searchQuery = `${params.query} ${params.location}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

    try {
      console.log(`Navigating to: ${searchUrl}`);
      // Use domcontentloaded instead of networkidle to avoid timeout
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for results to load (reduced from 2000ms)
      await sleep(1000);

      // Accept cookies if prompted
      try {
        const acceptButton = this.page.locator('button:has-text("Accept all")');
        if (await acceptButton.isVisible({ timeout: 2000 })) {
          await acceptButton.click();
          await sleep(500);
        }
      } catch {
        // No cookie prompt, continue
      }

      // Wait for the results feed
      const feedFound = await this.page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => null);
      if (!feedFound) {
        console.log('Results feed not found');
        return results;
      }

      // Scroll to load more results
      const maxScrolls = Math.ceil((params.maxResults || this.config.maxResults!) / 5);
      for (let i = 0; i < maxScrolls; i++) {
        await this.scrollResultsList();
        await sleep(500);
      }

      // Extract business listings - use the same selector as the working scraper
      const listings = await this.page.locator('a[href*="/maps/place"]').all();
      console.log(`Found ${listings.length} listings`);

      for (const listing of listings.slice(0, params.maxResults || this.config.maxResults)) {
        try {
          const business = await this.extractBusinessDetails(listing);
          if (business && this.isValidBusiness(business, params.minRating)) {
            results.push(business);
          }

          // Rate limiting
          await sleep(this.config.delayBetweenRequests!);
        } catch (error) {
          console.error('Error extracting business details:', error);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error searching businesses:', error);
      
      // If browser/page was closed, throw a special error to signal job should stop
      if (errorMessage.includes('browser has been closed') || 
          errorMessage.includes('Target page, context or browser has been closed') ||
          errorMessage.includes('page has been closed') ||
          errorMessage.includes('Target closed')) {
        throw new Error('BROWSER_CLOSED');
      }
    }

    return results;
  }

  private async scrollResultsList(): Promise<void> {
    if (!this.page) return;

    await this.page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) {
        feed.scrollTop = feed.scrollHeight;
      }
    });
  }

  private async extractBusinessDetails(listing: any): Promise<ScrapedBusiness | null> {
    try {
      // First check if this is a sponsored listing by checking the aria-label
      const ariaLabel = await listing.getAttribute('aria-label').catch(() => '');
      if (ariaLabel?.toLowerCase().includes('sponsored')) {
        console.log('   Skipping sponsored listing');
        return null;
      }

      // Click to open details
      await listing.click().catch(() => {});
      await sleep(1500); // Reduced from 2500ms

      if (!this.page) return null;

      // Wait for the URL to change to include /place/
      let attempts = 0;
      while (!this.page.url().includes('/place/') && attempts < 5) {
        await sleep(500);
        attempts++;
      }

      // Multiple strategies to extract business name
      let name: string | null = null;

      // Strategy 1: Get the h1 with specific class (most reliable)
      try {
        const nameElement = await this.page.locator('h1.DUwDvf').first();
        if (await nameElement.isVisible({ timeout: 2000 })) {
          name = await nameElement.textContent();
        }
      } catch {}

      // Strategy 2: fontHeadlineLarge class
      if (!name || name === 'Results') {
        try {
          const nameElement = await this.page.locator('h1.fontHeadlineLarge').first();
          if (await nameElement.isVisible({ timeout: 1000 })) {
            name = await nameElement.textContent();
          }
        } catch {}
      }

      // Strategy 3: Get from aria-label of the clicked listing
      if (!name || name === 'Results') {
        if (ariaLabel && ariaLabel.length > 2 && ariaLabel.length < 100 && !ariaLabel.toLowerCase().includes('sponsored')) {
          name = ariaLabel;
        }
      }

      // Strategy 4: Look for h1 in the details panel that's not "Results"
      if (!name || name === 'Results') {
        const allH1s = await this.page.locator('h1').all();
        for (const h1 of allH1s) {
          const text = await h1.textContent().catch(() => null);
          if (text && text !== 'Results' && text.length > 2 && text.length < 100 && 
              !text.toLowerCase().includes('sponsored')) {
            name = text;
            break;
          }
        }
      }

      // Strategy 5: Extract from page title
      if (!name || name === 'Results') {
        const title = await this.page.title();
        const titleMatch = title.match(/(.+?)\s*[-–]\s*Google Maps/);
        if (titleMatch && titleMatch[1].length > 2) {
          name = titleMatch[1].trim();
        }
      }

      // If still no valid name, skip this listing
      if (!name || name === 'Results' || name.toLowerCase().includes('sponsored')) {
        console.log('   Could not extract valid business name');
        return null;
      }

      // Clean the name
      name = name.replace(/^Sponsored\s*/i, '').trim();
      if (!name || name.length < 2) {
        console.log('   Name too short after cleaning');
        return null;
      }

      // Extract address with multiple selectors
      let address = await this.page
        .locator('[data-item-id="address"] .fontBodyMedium')
        .textContent()
        .catch(() => null);
      
      if (!address) {
        address = await this.page
          .locator('button[data-item-id="address"]')
          .textContent()
          .catch(() => null);
      }

      // Extract phone with multiple selectors
      let phone = await this.page
        .locator('[data-item-id^="phone:"] .fontBodyMedium')
        .textContent()
        .catch(() => null);
      
      if (!phone) {
        phone = await this.page
          .locator('button[data-item-id^="phone"]')
          .textContent()
          .catch(() => null);
      }

      // Extract website
      let website = await this.page
        .locator('[data-item-id="authority"] a')
        .getAttribute('href')
        .catch(() => null);
      
      if (!website) {
        website = await this.page
          .locator('a[data-item-id="authority"]')
          .getAttribute('href')
          .catch(() => null);
      }

      // Extract rating from multiple possible locations
      let rating: number | undefined;
      let reviewCount: number | undefined;

      // Try aria-label on star images
      const ratingText = await this.page
        .locator('[role="img"][aria-label*="star"]')
        .first()
        .getAttribute('aria-label')
        .catch(() => null);

      if (ratingText) {
        const ratingMatch = ratingText.match(/([\d.]+)\s*star/i);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
        }
      }

      // Try extracting from the rating span
      if (!rating) {
        const ratingSpan = await this.page
          .locator('span[aria-hidden="true"]:has-text(".")')
          .first()
          .textContent()
          .catch(() => null);
        
        if (ratingSpan) {
          const match = ratingSpan.match(/^(\d+\.\d+)$/);
          if (match) {
            rating = parseFloat(match[1]);
          }
        }
      }

      // Extract review count
      const reviewText = await this.page
        .locator('[aria-label*="review"]')
        .first()
        .textContent()
        .catch(() => null);

      if (reviewText) {
        const reviewMatch = reviewText.match(/\(([\d,]+)\)/);
        if (reviewMatch) {
          reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
        }
      }

      // If no review count from aria-label, try extracting from visible text
      if (!reviewCount) {
        const reviewSpan = await this.page
          .locator('span:has-text("review")')
          .first()
          .textContent()
          .catch(() => null);
        
        if (reviewSpan) {
          const match = reviewSpan.match(/([\d,]+)\s*review/i);
          if (match) {
            reviewCount = parseInt(match[1].replace(/,/g, ''));
          }
        }
      }

      const category = await this.page
        .locator('button[jsaction*="category"]')
        .textContent()
        .catch(() => null);

      // Extract place ID from URL
      const finalUrl = this.page.url();
      const placeIdMatch = finalUrl.match(/!1s([^!]+)/);
      const placeId = placeIdMatch ? placeIdMatch[1] : undefined;

      console.log(`   Found: ${name.trim()} (${rating || 'N/A'}⭐, ${reviewCount || 0} reviews)`);

      return {
        name: name.trim(),
        address: address?.trim() || '',
        phone: phone?.trim(),
        website: website?.trim(),
        rating,
        reviewCount,
        googleMapsUrl: finalUrl,
        category: category?.trim(),
        placeId,
      };
    } catch (error) {
      console.error('Error extracting business details:', error);
      return null;
    }
  }

  private isValidBusiness(business: ScrapedBusiness, minRating?: number): boolean {
    // Must have a name and address
    if (!business.name || !business.address) {
      return false;
    }

    // Check rating threshold
    if (minRating && business.rating && business.rating < minRating) {
      return false;
    }

    // We're looking for businesses WITHOUT websites or with low-quality ones
    // So having no website is actually good
    return true;
  }

  async checkWebsiteQuality(url: string): Promise<number> {
    if (!url) return 0;
    
    // Quick check for social/directory sites - these are low quality for our purposes
    const lowQualityPatterns = [
      'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com',
      'yellowpages', 'yelp.com', 'gumtree', 'olx.co.za',
      'wix.com', 'weebly.com', 'squarespace.com', 'wordpress.com',
      'sites.google.com', 'blogspot.com'
    ];
    
    const urlLower = url.toLowerCase();
    if (lowQualityPatterns.some(p => urlLower.includes(p))) {
      return 20; // Low quality - good prospect
    }
    
    // For proper domains, assume medium quality
    // Skip actual page loading to avoid timeouts
    if (url.startsWith('https://')) {
      return 50; // Medium quality
    }
    
    return 40; // HTTP only - slightly lower quality
  }
}

// Factory function for creating scrapers
export function createGoogleMapsScraper(config?: Partial<GoogleMapsScraperConfig>): GoogleMapsScraper {
  return new GoogleMapsScraper(config);
}

// Helper to run a quick search (initializes, searches, and closes)
export async function quickSearch(
  params: ScrapingParams,
  config?: Partial<GoogleMapsScraperConfig>
): Promise<ScrapedBusiness[]> {
  const scraper = createGoogleMapsScraper(config);
  try {
    await scraper.initialize();
    return await scraper.searchBusinesses(params);
  } finally {
    await scraper.close();
  }
}
