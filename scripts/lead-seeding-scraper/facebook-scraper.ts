/**
 * Facebook Page Scraper
 * Extracts business information from Facebook business pages
 */

import { Browser, BrowserContext } from 'playwright';
import { sleep } from './utils';

export interface FacebookBusinessInfo {
  description?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  hours?: string;
  category?: string;
}

/**
 * Scrape business information from a Facebook page
 */
export async function scrapeFromFacebook(
  browser: Browser,
  facebookUrl: string,
  workerId: number = 1
): Promise<FacebookBusinessInfo> {
  const result: FacebookBusinessInfo = {};
  let context: BrowserContext | null = null;

  try {
    console.log(`   [Worker ${workerId}] 📘 Scraping Facebook: ${facebookUrl}`);

    // Ensure URL points to the about page for more info
    let aboutUrl = facebookUrl;
    if (!aboutUrl.includes('/about')) {
      aboutUrl = aboutUrl.replace(/\/$/, '') + '/about';
    }

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Navigate to the Facebook page
    await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);

    // Handle login popup if it appears (close it)
    try {
      const closeButton = page.locator('[aria-label="Close"]').first();
      if (await closeButton.isVisible({ timeout: 2000 })) {
        await closeButton.click();
        await sleep(500);
      }
    } catch {
      // No popup
    }

    // Get page content
    const pageContent = await page.content();

    // Extract phone numbers
    const phonePatterns = [
      /(?:tel:|phone:|call:?\s*)([+\d\s()-]{10,})/gi,
      /(\+27[\d\s()-]{9,})/g,
      /(0[1-9][\d\s()-]{8,})/g,
    ];

    for (const pattern of phonePatterns) {
      const matches = pageContent.match(pattern);
      if (matches && matches.length > 0) {
        const phone = cleanPhoneNumber(matches[0]);
        if (phone && !result.phone) {
          result.phone = phone;
          console.log(`   [Worker ${workerId}] 📞 Found phone on FB: ${phone}`);
        }
      }
    }

    // Extract email addresses
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = pageContent.match(emailPattern);
    if (emails) {
      for (const email of emails) {
        if (isValidBusinessEmail(email)) {
          result.email = email.toLowerCase();
          console.log(`   [Worker ${workerId}] ✉️ Found email on FB: ${email}`);
          break;
        }
      }
    }

    // Try to extract description from meta tags or visible content
    const metaDescription = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
    if (metaDescription && metaDescription.length > 20) {
      result.description = metaDescription.substring(0, 500);
    }

    // Try to get description from the about section
    const aboutText = await page.locator('[data-pagelet="ProfileTilesFeed_0"]').textContent().catch(() => null);
    if (aboutText && aboutText.length > 20 && !result.description) {
      result.description = aboutText.substring(0, 500);
    }

    // Extract website if listed
    const websiteLinks = await page.locator('a[href*="l.facebook.com/l.php"]').all();
    for (const link of websiteLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      if (href) {
        const actualUrl = extractFacebookRedirectUrl(href);
        if (actualUrl && !actualUrl.includes('facebook.com')) {
          result.website = actualUrl;
          console.log(`   [Worker ${workerId}] 🌐 Found website on FB: ${actualUrl}`);
          break;
        }
      }
    }

    // Try to get category
    const categoryElement = await page.locator('[href*="/pages/category/"]').first().textContent().catch(() => null);
    if (categoryElement) {
      result.category = categoryElement.trim();
    }

    if (Object.keys(result).length > 0) {
      console.log(`   [Worker ${workerId}] ✅ Facebook scrape successful`);
    } else {
      console.log(`   [Worker ${workerId}] 📭 No additional info found on Facebook`);
    }

  } catch (error: any) {
    console.log(`   [Worker ${workerId}] ⚠️ Facebook scrape failed: ${error?.message || error}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  return result;
}

/**
 * Clean and format phone number
 */
function cleanPhoneNumber(phone: string): string | null {
  // Remove common prefixes
  let cleaned = phone.replace(/^(tel:|phone:|call:?\s*)/i, '');
  
  // Remove all non-digit characters except +
  cleaned = cleaned.replace(/[^\d+]/g, '');
  
  // Validate length
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return cleaned;
  }
  
  return null;
}

/**
 * Check if email is a valid business email (not a generic/fake one)
 */
function isValidBusinessEmail(email: string): boolean {
  const lowerEmail = email.toLowerCase();
  
  const invalidPatterns = [
    'example.com',
    'test.com',
    'facebook.com',
    'fb.com',
    'sentry.io',
    '@2x',
    '.png',
    '.jpg',
    '.svg',
    'noreply',
    'no-reply',
    'donotreply',
  ];
  
  return !invalidPatterns.some(pattern => lowerEmail.includes(pattern));
}

/**
 * Extract actual URL from Facebook redirect link
 */
function extractFacebookRedirectUrl(fbUrl: string): string | null {
  try {
    const urlObj = new URL(fbUrl);
    const actualUrl = urlObj.searchParams.get('u');
    return actualUrl;
  } catch {
    return null;
  }
}

/**
 * Search for a business on Facebook and return the page URL
 */
export async function findFacebookPage(
  browser: Browser,
  businessName: string,
  city: string,
  workerId: number = 1
): Promise<string | null> {
  let context: BrowserContext | null = null;

  try {
    console.log(`   [Worker ${workerId}] 🔍 Searching Facebook for: ${businessName}`);

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Use Facebook's search
    const searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(businessName + ' ' + city)}`;
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);

    // Get first result
    const firstResult = await page.locator('a[href*="/pages/"]').first().getAttribute('href').catch(() => null);
    
    if (firstResult && firstResult.includes('facebook.com')) {
      console.log(`   [Worker ${workerId}] 📘 Found Facebook page: ${firstResult}`);
      return firstResult;
    }

  } catch (error: any) {
    console.log(`   [Worker ${workerId}] ⚠️ Facebook search failed: ${error?.message || error}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  return null;
}
