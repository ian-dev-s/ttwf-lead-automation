/**
 * Contact Enricher
 * Deep crawls websites to extract all contact information
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { sleep } from './utils';

export interface ContactInfo {
  phones: string[];
  emails: string[];
  description?: string;
  address?: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
}

// Pages to crawl for contact info
const CONTACT_PAGES = [
  '',           // Homepage
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/aboutus',
  '/team',
  '/our-team',
  '/get-in-touch',
];

/**
 * Deep crawl a website to extract all contact information
 */
export async function enrichContactInfo(
  browser: Browser,
  websiteUrl: string,
  workerId: number = 1
): Promise<ContactInfo> {
  const result: ContactInfo = {
    phones: [],
    emails: [],
    socialLinks: {},
  };

  let context: BrowserContext | null = null;

  try {
    // Normalize URL
    let baseUrl = websiteUrl;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    console.log(`   [Worker ${workerId}] 🌐 Deep crawling website: ${baseUrl}`);

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Crawl each contact page
    for (const pagePath of CONTACT_PAGES) {
      try {
        const pageUrl = baseUrl + pagePath;
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(1000);

        // Extract info from this page
        await extractFromPage(page, result, workerId);

        // If we found good contact info, we can stop early
        if (result.phones.length >= 2 && result.emails.length >= 1) {
          break;
        }
      } catch {
        // Page doesn't exist or failed to load, continue to next
      }
    }

    // Also try to find contact links on the homepage and follow them
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1000);

      const contactLinks = await findContactLinks(page);
      for (const link of contactLinks.slice(0, 2)) {
        try {
          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await sleep(800);
          await extractFromPage(page, result, workerId);
        } catch {
          // Link failed, continue
        }
      }
    } catch {
      // Homepage navigation failed
    }

    // Deduplicate results
    result.phones = Array.from(new Set(result.phones));
    result.emails = Array.from(new Set(result.emails));

    console.log(`   [Worker ${workerId}] 📊 Found ${result.phones.length} phone(s), ${result.emails.length} email(s)`);

  } catch (error: any) {
    console.log(`   [Worker ${workerId}] ⚠️ Contact enrichment failed: ${error?.message || error}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }

  return result;
}

/**
 * Extract contact information from a single page
 */
async function extractFromPage(page: Page, result: ContactInfo, workerId: number): Promise<void> {
  try {
    const pageContent = await page.content();
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');

    // Extract phone numbers
    const phonePatterns = [
      // South African formats
      /(?:\+27|0)[\s.-]?[1-9][\d\s.-]{7,10}/g,
      // International format
      /\+[\d\s.-]{10,15}/g,
      // Generic phone patterns
      /(?:tel:|phone:|call:|mobile:|cell:)\s*([+\d\s().-]{10,})/gi,
    ];

    for (const pattern of phonePatterns) {
      const matches = pageContent.match(pattern) || [];
      for (const match of matches) {
        const cleaned = cleanPhone(match);
        if (cleaned && !result.phones.includes(cleaned)) {
          result.phones.push(cleaned);
        }
      }
    }

    // Extract from tel: links
    const telLinks = await page.locator('a[href^="tel:"]').all();
    for (const link of telLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      if (href) {
        const phone = href.replace('tel:', '').trim();
        const cleaned = cleanPhone(phone);
        if (cleaned && !result.phones.includes(cleaned)) {
          result.phones.push(cleaned);
        }
      }
    }

    // Extract email addresses
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = pageContent.match(emailPattern) || [];
    for (const email of emails) {
      if (isValidEmail(email) && !result.emails.includes(email.toLowerCase())) {
        result.emails.push(email.toLowerCase());
      }
    }

    // Extract from mailto: links
    const mailtoLinks = await page.locator('a[href^="mailto:"]').all();
    for (const link of mailtoLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      if (href) {
        const emailMatch = href.match(/mailto:([^?]+)/);
        if (emailMatch && emailMatch[1]) {
          const email = emailMatch[1].toLowerCase().trim();
          if (isValidEmail(email) && !result.emails.includes(email)) {
            result.emails.push(email);
          }
        }
      }
    }

    // Extract social media links
    await extractSocialLinks(page, result);

    // Extract description from meta tags
    if (!result.description) {
      const metaDesc = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
      if (metaDesc && metaDesc.length > 30) {
        result.description = metaDesc.substring(0, 500);
      }
    }

    // Try to get description from about section
    if (!result.description) {
      const aboutSection = await page.locator('[class*="about"], [id*="about"], [class*="description"]').first().textContent().catch(() => null);
      if (aboutSection && aboutSection.length > 50 && aboutSection.length < 1000) {
        result.description = aboutSection.trim().substring(0, 500);
      }
    }

  } catch {
    // Extraction failed for this page
  }
}

/**
 * Find contact page links on a page
 */
async function findContactLinks(page: Page): Promise<string[]> {
  const links: string[] = [];

  try {
    const anchors = await page.locator('a').all();
    
    for (const anchor of anchors) {
      const href = await anchor.getAttribute('href').catch(() => null);
      const text = await anchor.textContent().catch(() => '');
      
      if (href && text) {
        const lowerText = text.toLowerCase();
        const lowerHref = href.toLowerCase();
        
        if (lowerText.includes('contact') || lowerText.includes('get in touch') ||
            lowerHref.includes('contact') || lowerHref.includes('get-in-touch')) {
          
          // Convert relative URLs to absolute
          let fullUrl = href;
          if (href.startsWith('/')) {
            const pageUrl = new URL(page.url());
            fullUrl = pageUrl.origin + href;
          } else if (!href.startsWith('http')) {
            continue;
          }
          
          if (!links.includes(fullUrl)) {
            links.push(fullUrl);
          }
        }
      }
    }
  } catch {
    // Link extraction failed
  }

  return links;
}

/**
 * Extract social media links from a page
 */
async function extractSocialLinks(page: Page, result: ContactInfo): Promise<void> {
  try {
    const socialPatterns = [
      { platform: 'facebook', pattern: /facebook\.com\/[a-zA-Z0-9._-]+/i },
      { platform: 'instagram', pattern: /instagram\.com\/[a-zA-Z0-9._-]+/i },
      { platform: 'twitter', pattern: /(twitter|x)\.com\/[a-zA-Z0-9._-]+/i },
      { platform: 'linkedin', pattern: /linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/i },
    ];

    const anchors = await page.locator('a[href]').all();
    
    for (const anchor of anchors) {
      const href = await anchor.getAttribute('href').catch(() => null);
      if (!href) continue;

      for (const { platform, pattern } of socialPatterns) {
        if (pattern.test(href) && !result.socialLinks[platform as keyof typeof result.socialLinks]) {
          result.socialLinks[platform as keyof typeof result.socialLinks] = href;
        }
      }
    }
  } catch {
    // Social link extraction failed
  }
}

/**
 * Clean and validate phone number
 */
function cleanPhone(phone: string): string | null {
  // Remove common prefixes and labels
  let cleaned = phone.replace(/^(tel:|phone:|call:|mobile:|cell:)\s*/i, '');
  
  // Remove all non-digit characters except +
  cleaned = cleaned.replace(/[^\d+]/g, '');
  
  // Validate length (South African numbers are 10-12 digits)
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return cleaned;
  }
  
  return null;
}

/**
 * Validate email address
 */
function isValidEmail(email: string): boolean {
  const lowerEmail = email.toLowerCase();
  
  const invalidPatterns = [
    'example.com',
    'test.com',
    'sentry.io',
    'wixpress',
    '@2x',
    '.png',
    '.jpg',
    '.svg',
    '.gif',
    '.webp',
    'webpack',
    'node_modules',
    'noreply',
    'no-reply',
    'donotreply',
    'localhost',
    'domain.com',
    'email.com',
    'yoursite',
    'yourdomain',
  ];
  
  if (invalidPatterns.some(pattern => lowerEmail.includes(pattern))) {
    return false;
  }
  
  // Basic email format validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}
