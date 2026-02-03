/**
 * Google Search Enricher
 * Searches Google for additional business information like social media URLs
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { sleep } from './utils';

export interface GoogleSearchResult {
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  website?: string;
  additionalInfo?: string;
}

/**
 * Search Google for business social media profiles and additional info
 */
export async function enrichFromGoogleSearch(
  browser: Browser,
  businessName: string,
  city: string,
  existingWebsite?: string,
  workerId: number = 1
): Promise<GoogleSearchResult> {
  const result: GoogleSearchResult = {};
  let context: BrowserContext | null = null;

  try {
    console.log(`   [Worker ${workerId}] 🔍 Google Search: "${businessName}" "${city}"`);

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Search for the business with exact match
    const searchQuery = `"${businessName}" "${city}" South Africa`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500);

    // Accept cookies if prompted
    await acceptGoogleCookies(page);

    // Extract all links from search results
    const links = await extractSearchLinks(page);

    // Categorize links
    for (const link of links) {
      const lowerLink = link.toLowerCase();

      // Facebook
      if (!result.facebookUrl && lowerLink.includes('facebook.com/') && !lowerLink.includes('facebook.com/sharer')) {
        if (await verifyFacebookPage(page, link, businessName)) {
          result.facebookUrl = link;
          console.log(`   [Worker ${workerId}] 📘 Found Facebook: ${link}`);
        }
      }

      // Instagram
      if (!result.instagramUrl && lowerLink.includes('instagram.com/') && !lowerLink.includes('/p/')) {
        result.instagramUrl = link;
        console.log(`   [Worker ${workerId}] 📸 Found Instagram: ${link}`);
      }

      // Twitter/X
      if (!result.twitterUrl && (lowerLink.includes('twitter.com/') || lowerLink.includes('x.com/'))) {
        if (!lowerLink.includes('/status/')) {
          result.twitterUrl = link;
          console.log(`   [Worker ${workerId}] 🐦 Found Twitter: ${link}`);
        }
      }

      // LinkedIn
      if (!result.linkedinUrl && lowerLink.includes('linkedin.com/company/')) {
        result.linkedinUrl = link;
        console.log(`   [Worker ${workerId}] 💼 Found LinkedIn: ${link}`);
      }

      // Website (if not already known)
      if (!existingWebsite && !result.website && isLikelyBusinessWebsite(link, businessName)) {
        result.website = link;
        console.log(`   [Worker ${workerId}] 🌐 Found Website: ${link}`);
      }
    }

    // If we didn't find Facebook, try a specific Facebook search
    if (!result.facebookUrl) {
      const fbResult = await searchFacebookDirectly(page, businessName, city);
      if (fbResult) {
        result.facebookUrl = fbResult;
        console.log(`   [Worker ${workerId}] 📘 Found Facebook (direct): ${fbResult}`);
      }
    }

  } catch (error: any) {
    console.log(`   [Worker ${workerId}] ⚠️ Google Search failed: ${error?.message || error}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  return result;
}

/**
 * Accept Google cookies if prompted
 */
async function acceptGoogleCookies(page: Page): Promise<void> {
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

/**
 * Extract all links from Google search results
 */
async function extractSearchLinks(page: Page): Promise<string[]> {
  const links: string[] = [];

  try {
    // Get all anchor tags in search results
    const anchors = await page.locator('#search a[href]').all();

    for (const anchor of anchors) {
      const href = await anchor.getAttribute('href').catch(() => null);
      if (href && href.startsWith('http') && !href.includes('google.com')) {
        // Clean Google redirect URLs
        const cleanUrl = cleanGoogleUrl(href);
        if (cleanUrl && !links.includes(cleanUrl)) {
          links.push(cleanUrl);
        }
      }
    }

    // Also check the knowledge panel on the right
    const knowledgeLinks = await page.locator('[data-attrid] a[href]').all();
    for (const anchor of knowledgeLinks) {
      const href = await anchor.getAttribute('href').catch(() => null);
      if (href && href.startsWith('http') && !href.includes('google.com')) {
        const cleanUrl = cleanGoogleUrl(href);
        if (cleanUrl && !links.includes(cleanUrl)) {
          links.push(cleanUrl);
        }
      }
    }
  } catch {
    // Link extraction failed
  }

  return links;
}

/**
 * Clean Google redirect URLs
 */
function cleanGoogleUrl(url: string): string | null {
  try {
    if (url.includes('/url?')) {
      const urlObj = new URL(url);
      const actualUrl = urlObj.searchParams.get('url') || urlObj.searchParams.get('q');
      return actualUrl;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Verify a Facebook page belongs to the business
 */
async function verifyFacebookPage(page: Page, fbUrl: string, businessName: string): Promise<boolean> {
  try {
    // Extract the page name from URL
    const urlParts = fbUrl.split('/');
    const pageName = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];

    if (!pageName) return false;

    // Simple name matching - check if business name words appear in FB page name
    const businessWords = businessName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const pageNameLower = pageName.toLowerCase().replace(/[^a-z0-9]/g, '');

    return businessWords.some(word => pageNameLower.includes(word.replace(/[^a-z0-9]/g, '')));
  } catch {
    return false;
  }
}

/**
 * Check if a URL is likely the business's own website
 */
function isLikelyBusinessWebsite(url: string, businessName: string): boolean {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();

    // Exclude social media and directories
    const excludePatterns = [
      'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com',
      'youtube.com', 'tiktok.com', 'pinterest.com',
      'yellowpages', 'yelp.com', 'tripadvisor', 'google.com',
      'wikipedia.org', 'gumtree', 'olx', 'locanto'
    ];

    if (excludePatterns.some(p => domain.includes(p))) {
      return false;
    }

    // Check if business name appears in domain
    const businessWords = businessName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return businessWords.some(word => domain.includes(word.replace(/[^a-z0-9]/g, '')));
  } catch {
    return false;
  }
}

/**
 * Search Facebook directly for the business
 */
async function searchFacebookDirectly(page: Page, businessName: string, city: string): Promise<string | null> {
  try {
    const fbSearchQuery = `site:facebook.com "${businessName}" "${city}"`;
    const fbSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(fbSearchQuery)}`;

    await page.goto(fbSearchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(1000);

    // Get first Facebook result
    const fbLinks = await page.locator('#search a[href*="facebook.com"]').all();

    for (const link of fbLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      if (href) {
        const cleanUrl = cleanGoogleUrl(href);
        if (cleanUrl && cleanUrl.includes('facebook.com/') && 
            !cleanUrl.includes('/sharer') && 
            !cleanUrl.includes('/share')) {
          return cleanUrl;
        }
      }
    }
  } catch {
    // Facebook search failed
  }

  return null;
}
