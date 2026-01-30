/**
 * Extract business details from Google Maps listing
 */

import { Page } from 'playwright';
import { ScrapedBusiness } from './types';
import { sleep } from './utils';

/**
 * Extract business details from the current Google Maps detail panel
 */
export async function extractBusinessDetails(
  page: Page,
  workerId: number
): Promise<ScrapedBusiness | null> {
  try {
    // Wait for panel to stabilize
    await sleep(800);

    // Extract business name
    const name = await extractBusinessName(page);
    if (!name) return null;

    // Extract other details in parallel where possible
    const [address, phones, website, rating, reviewCount, category] = await Promise.all([
      extractAddress(page),
      extractPhones(page),
      extractWebsite(page),
      extractRating(page),
      extractReviewCount(page),
      extractCategory(page),
    ]);

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
  } catch {
    return null;
  }
}

async function extractBusinessName(page: Page): Promise<string | null> {
  // Method 1: Look for the first h1 that's not "Results"
  const h1Elements = await page.locator('h1').all();
  for (const h1 of h1Elements) {
    const text = await h1.textContent({ timeout: 500 }).catch(() => null);
    if (text && text.length > 2 && text.length < 100 && 
        !text.toLowerCase().includes('results') &&
        !text.toLowerCase().includes('google maps')) {
      return text.trim();
    }
  }
  
  // Method 2: Try to get name from the URL
  const url = page.url();
  const placeMatch = url.match(/\/place\/([^\/]+)/);
  if (placeMatch) {
    return decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
  }
  
  return null;
}

async function extractAddress(page: Page): Promise<string | null> {
  const selectors = [
    '[data-item-id="address"] .fontBodyMedium',
    '[data-item-id="address"]',
    'button[data-item-id="address"]',
  ];
  
  for (const sel of selectors) {
    const text = await page.locator(sel).first().textContent({ timeout: 1000 }).catch(() => null);
    if (text) return text;
  }
  
  return null;
}

async function extractPhones(page: Page): Promise<string[]> {
  const phones: string[] = [];
  
  try {
    // Method 1: From phone elements
    const phoneElements = await page.locator('[data-item-id^="phone:"]').all();
    for (const phoneEl of phoneElements) {
      const phoneText = await phoneEl.textContent({ timeout: 500 }).catch(() => null);
      if (phoneText) {
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
    // Phone extraction failed
  }
  
  return phones;
}

async function extractWebsite(page: Page): Promise<string | null> {
  try {
    let website = await page
      .locator('[data-item-id="authority"] a')
      .getAttribute('href', { timeout: 1500 })
      .catch(() => null);
    
    if (!website) {
      website = await page
        .locator('a[data-item-id="authority"]')
        .getAttribute('href', { timeout: 1000 })
        .catch(() => null);
    }
    
    return website;
  } catch {
    return null;
  }
}

async function extractRating(page: Page): Promise<number | undefined> {
  try {
    const ratingElements = await page.locator('[aria-label*="star"]').all();
    for (const el of ratingElements) {
      const ariaLabel = await el.getAttribute('aria-label').catch(() => null);
      if (ariaLabel) {
        const match = ariaLabel.match(/([\d.]+)\s*star/i);
        if (match) {
          return parseFloat(match[1]);
        }
      }
    }
  } catch {
    // Rating extraction failed
  }
  return undefined;
}

async function extractReviewCount(page: Page): Promise<number | undefined> {
  try {
    const reviewElements = await page.locator('[aria-label*="review"]').all();
    for (const el of reviewElements) {
      const text = await el.textContent().catch(() => null);
      if (text) {
        const match = text.match(/\(([\d,]+)\)/);
        if (match) {
          return parseInt(match[1].replace(/,/g, ''));
        }
      }
    }
  } catch {
    // Review count extraction failed
  }
  return undefined;
}

async function extractCategory(page: Page): Promise<string | null> {
  return page
    .locator('button[jsaction*="category"]')
    .first()
    .textContent({ timeout: 1000 })
    .catch(() => null);
}
