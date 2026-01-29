import { ScrapedBusiness, ScrapingParams } from '@/types';
import { Browser, chromium, Page } from 'playwright';
import { randomDelay, sleep } from '../utils';

export interface GoogleMapsScraperConfig {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  maxResults?: number;
  delayBetweenRequests?: number;
}

const DEFAULT_CONFIG: GoogleMapsScraperConfig = {
  headless: true,
  slowMo: 100,
  timeout: 30000,
  maxResults: 20,
  delayBetweenRequests: 2000,
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
      await this.page.goto(searchUrl, { waitUntil: 'networkidle' });

      // Wait for results to load
      await sleep(2000);

      // Accept cookies if prompted
      try {
        const acceptButton = this.page.locator('button:has-text("Accept all")');
        if (await acceptButton.isVisible({ timeout: 3000 })) {
          await acceptButton.click();
          await sleep(1000);
        }
      } catch {
        // No cookie prompt, continue
      }

      // Wait for the results feed
      await this.page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => {
        console.log('Results feed not found, trying alternative selector');
      });

      // Scroll to load more results
      const maxScrolls = Math.ceil((params.maxResults || this.config.maxResults!) / 5);
      for (let i = 0; i < maxScrolls; i++) {
        await this.scrollResultsList();
        await sleep(randomDelay(1000, 2000));
      }

      // Extract business listings
      const listings = await this.page.locator('[role="feed"] > div > div > a').all();
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
    } catch (error) {
      console.error('Error searching businesses:', error);
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
      // Get the href which contains place info
      const href = await listing.getAttribute('href');
      if (!href) return null;

      // Click to open details
      await listing.click();
      await sleep(2000);

      if (!this.page) return null;

      // Extract details from the side panel
      const name = await this.page
        .locator('h1')
        .first()
        .textContent()
        .catch(() => null);

      if (!name) return null;

      const address = await this.page
        .locator('[data-item-id="address"] .fontBodyMedium')
        .textContent()
        .catch(() => null);

      const phone = await this.page
        .locator('[data-item-id^="phone:"] .fontBodyMedium')
        .textContent()
        .catch(() => null);

      const website = await this.page
        .locator('[data-item-id="authority"] a')
        .getAttribute('href')
        .catch(() => null);

      const ratingText = await this.page
        .locator('[role="img"][aria-label*="stars"]')
        .getAttribute('aria-label')
        .catch(() => null);

      let rating: number | undefined;
      let reviewCount: number | undefined;

      if (ratingText) {
        const ratingMatch = ratingText.match(/([\d.]+)\s*stars?/i);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
        }
      }

      const reviewText = await this.page
        .locator('[aria-label*="reviews"]')
        .first()
        .textContent()
        .catch(() => null);

      if (reviewText) {
        const reviewMatch = reviewText.match(/\(([\d,]+)\)/);
        if (reviewMatch) {
          reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
        }
      }

      const category = await this.page
        .locator('button[jsaction*="category"]')
        .textContent()
        .catch(() => null);

      // Extract place ID from URL
      const currentUrl = this.page.url();
      const placeIdMatch = currentUrl.match(/!1s([^!]+)/);
      const placeId = placeIdMatch ? placeIdMatch[1] : undefined;

      return {
        name: name.trim(),
        address: address?.trim() || '',
        phone: phone?.trim(),
        website: website?.trim(),
        rating,
        reviewCount,
        googleMapsUrl: currentUrl,
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
    if (!this.page || !url) return 0;

    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Simple quality scoring based on various factors
      let score = 50; // Start with a base score

      // Check if site loads
      const title = await this.page.title().catch(() => '');
      if (!title) score -= 20;

      // Check for HTTPS
      if (url.startsWith('https://')) score += 10;

      // Check for mobile viewport meta
      const hasMobileViewport = await this.page
        .locator('meta[name="viewport"]')
        .count()
        .then((count) => count > 0)
        .catch(() => false);
      if (hasMobileViewport) score += 10;

      // Check for modern design indicators
      const hasModernCSS = await this.page
        .evaluate(() => {
          const styles = getComputedStyle(document.body);
          return styles.display === 'flex' || styles.display === 'grid';
        })
        .catch(() => false);
      if (hasModernCSS) score += 10;

      // Check page load time (approximation)
      const timing = await this.page
        .evaluate(() => {
          const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return perf?.loadEventEnd - perf?.startTime;
        })
        .catch(() => 5000);

      if (timing < 2000) score += 10;
      else if (timing > 5000) score -= 10;

      return Math.max(0, Math.min(100, score));
    } catch {
      // If we can't load the site, it's low quality
      return 10;
    }
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
