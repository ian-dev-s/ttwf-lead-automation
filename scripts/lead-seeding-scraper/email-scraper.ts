/**
 * Email scraping from websites
 */

import { Browser, BrowserContext } from 'playwright';
import { sleep } from './utils';

/**
 * Scrape emails from a website
 */
export async function scrapeEmailsFromWebsite(
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
    await sleep(1000);
    
    // Get page content and extract emails
    const pageContent = await page.content();
    
    // Email regex pattern
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const foundEmails = pageContent.match(emailPattern) || [];
    
    // Filter and deduplicate
    for (const email of foundEmails) {
      const cleanEmail = email.toLowerCase().trim();
      if (isValidEmail(cleanEmail) && !emails.includes(cleanEmail)) {
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
          if (isValidEmail(email) && !emails.includes(email)) {
            emails.push(email);
          }
        }
      }
    }
    
    // Try to find contact page and scrape from there too
    await scrapeContactPage(page, emails, emailPattern);
    
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

/**
 * Check if email is valid (not a false positive)
 */
function isValidEmail(email: string): boolean {
  const invalidPatterns = [
    'example.com',
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
  ];
  
  return !invalidPatterns.some(pattern => email.includes(pattern));
}

/**
 * Try to navigate to contact page and scrape emails
 */
async function scrapeContactPage(
  page: any,
  emails: string[],
  emailPattern: RegExp
): Promise<void> {
  try {
    const contactLinks = await page.locator(
      'a[href*="contact"], a[href*="Contact"], a:has-text("Contact")'
    ).all();
    
    if (contactLinks.length > 0) {
      await contactLinks[0].click();
      await sleep(2000);
      
      const contactContent = await page.content();
      const contactEmails = contactContent.match(emailPattern) || [];
      
      for (const email of contactEmails) {
        const cleanEmail = email.toLowerCase().trim();
        if (isValidEmail(cleanEmail) && !emails.includes(cleanEmail)) {
          emails.push(cleanEmail);
        }
      }
    }
  } catch {
    // Contact page navigation failed, continue with what we have
  }
}
