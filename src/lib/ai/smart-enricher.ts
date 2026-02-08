/**
 * AI-Powered Smart Enricher (OPTIMIZED)
 * 
 * Orchestrates all AI modules to provide intelligent lead enrichment:
 * 1. Scrapes data from multiple sources IN PARALLEL (Google Maps, website, Facebook, Google Search)
 * 2. Uses AI to extract structured data from unstructured text
 * 3. Cross-references and validates data from multiple sources
 * 4. Analyzes the business to understand what they do
 * 5. Qualifies the lead and provides personalization insights
 * 
 * OPTIMIZATIONS:
 * - Parallel page scraping (website + Google Search + Facebook)
 * - Parallel AI calls where possible
 * - Reduced delays (500ms instead of 2s)
 * - Reuses browser pages efficiently
 */

import { Browser, Page } from 'playwright';
import { analyzeBusinessWithAI, BusinessAnalysis, BusinessData } from './business-analyzer';
import { extractAndMergeData, ExtractedContactInfo, ExtractedBusinessInfo } from './data-extractor';
import { qualifyLeadWithAI, LeadQualification, LeadQualificationInput } from './lead-qualifier';
import { crossReferenceWithAI, DataSource, ValidationResult } from './cross-reference';
import { 
  CancellationToken, 
  JobCancelledError, 
  sleepWithCancellation 
} from '../scraper/cancellation';

// Reduced delays for faster scraping
const FAST_DELAY = 500; // 500ms instead of 2000ms

export interface ScrapedBusinessInput {
  name: string;
  googleMapsUrl: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
}

export interface SmartEnrichedLead {
  // Basic info
  businessName: string;
  industry: string;
  location: string;
  
  // Contact info (merged from all sources)
  phones: string[];
  emails: string[];
  whatsappNumber?: string;
  
  // Online presence
  website?: string;
  websiteQualityScore?: number;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  googleMapsUrl: string;
  
  // Google Maps data
  googleRating?: number;
  reviewCount?: number;
  address?: string;
  
  // AI Analysis
  description?: string;
  servicesOffered: string[];
  targetMarket?: string;
  uniqueSellingPoints: string[];
  
  // Lead Qualification
  leadScore: number;
  qualificationTier: 'A' | 'B' | 'C' | 'D';
  isQualified: boolean;
  recommendedAction: string;
  recommendedChannel: string;
  
  // Personalization
  personalizationHooks: string[];
  keyTalkingPoints: string[];
  avoidTopics: string[];
  
  // Metadata
  enrichmentSources: string[];
  enrichmentConfidence: number;
  aiReasoning: string;
  warnings: string[];
  
  // Raw data for debugging
  rawAnalysis?: BusinessAnalysis;
  rawQualification?: LeadQualification;
  rawValidation?: ValidationResult;
}

/**
 * Smart enrich a lead using AI across multiple sources
 * OPTIMIZED: Uses parallel scraping and parallel AI calls
 * SUPPORTS: Cancellation for immediate job stopping
 */
export async function smartEnrichLead(
  browser: Browser,
  business: ScrapedBusinessInput,
  location: string,
  industry: string,
  workerId: number = 1,
  teamId: string,
  cancellationToken?: CancellationToken
): Promise<SmartEnrichedLead> {
  // Check cancellation immediately
  if (cancellationToken?.isCancelled) {
    throw new JobCancelledError(cancellationToken.id);
  }
  
  console.log(`\n   [Worker ${workerId}] 🧠 Starting FAST AI enrichment for: ${business.name}`);
  const startTime = Date.now();
  
  const dataSources: DataSource[] = [];
  const textSources: { source: string; text: string }[] = [];
  
  // 1. Start with Google Maps data
  dataSources.push({
    source: 'google_maps',
    confidence: 90,
    data: {
      name: business.name,
      phones: business.phone ? [business.phone] : [],
      address: business.address,
      website: business.website,
    },
  });
  
  let facebookUrl: string | null = null;
  
  // Check cancellation before creating pages
  if (cancellationToken?.isCancelled) {
    throw new JobCancelledError(cancellationToken.id);
  }
  
  // OPTIMIZATION: Create multiple pages for parallel scraping
  const [websitePage, searchPage, socialPage] = await Promise.all([
    browser.newPage(),
    browser.newPage(),
    browser.newPage(),
  ]);
  
  try {
    // Check cancellation after page creation
    if (cancellationToken?.isCancelled) {
      throw new JobCancelledError(cancellationToken.id);
    }
    
    // OPTIMIZATION: Scrape website + contact search + social search + generic search IN PARALLEL
    console.log(`   [Worker ${workerId}] ⚡ Parallel scraping: website + contact search + social search + generic search`);
    
    const [websiteData, searchData, socialSearchData] = await Promise.all([
      // Scrape website if available
      business.website 
        ? scrapeWebsiteWithAI(websitePage, business.website, business.name, cancellationToken)
        : Promise.resolve(null),
      // Search Google for contact information
      searchGoogleWithAI(searchPage, business.name, location, cancellationToken),
      // Search Google for social media profiles
      searchSocialMediaWithAI(socialPage, business.name, location, cancellationToken),
    ]);
    
    // Check cancellation after first parallel batch
    if (cancellationToken?.isCancelled) {
      throw new JobCancelledError(cancellationToken.id);
    }
    
    if (websiteData) {
      dataSources.push(websiteData.dataSource);
      if (websiteData.text) {
        textSources.push({ source: 'website', text: websiteData.text });
      }
    }
    
    if (searchData) {
      dataSources.push(searchData.dataSource);
      if (searchData.text) {
        textSources.push({ source: 'google_search', text: searchData.text });
      }
    }
    
    if (socialSearchData) {
      dataSources.push(socialSearchData.dataSource);
      if (socialSearchData.text) {
        textSources.push({ source: 'social_search', text: socialSearchData.text });
      }
    }
    
    // Phase 2: Run generic search (reuse socialPage) and scrape Facebook if found
    if (cancellationToken?.isCancelled) {
      throw new JobCancelledError(cancellationToken.id);
    }
    
    // Run generic search for more business details
    console.log(`   [Worker ${workerId}] 🔍 Running generic search for more details`);
    const genericSearchData = await searchGenericWithAI(socialPage, business.name, location, cancellationToken);
    
    if (genericSearchData) {
      dataSources.push(genericSearchData.dataSource);
      if (genericSearchData.text) {
        textSources.push({ source: 'generic_search', text: genericSearchData.text });
      }
    }
    
    // Check Facebook from both contact search and social search results
    const allSearchText = [searchData?.text || '', socialSearchData?.text || ''].join('\n');
    facebookUrl = findFacebookUrl(allSearchText, business.name);
    if (facebookUrl && !cancellationToken?.isCancelled) {
      console.log(`   [Worker ${workerId}] 📘 Found Facebook: ${facebookUrl}`);
      const fbData = await scrapeFacebookWithAI(searchPage, facebookUrl, business.name, cancellationToken);
      if (fbData) {
        dataSources.push(fbData.dataSource);
        if (fbData.text) {
          textSources.push({ source: 'facebook', text: fbData.text });
        }
      }
    }
    
    // Also try to scrape found Instagram profile (reuse websitePage)
    const instagramUrl = findInstagramUrl(allSearchText, websiteData?.dataSource?.data?.socialMedia?.instagram);
    if (instagramUrl && !cancellationToken?.isCancelled) {
      console.log(`   [Worker ${workerId}] 📸 Found Instagram: ${instagramUrl}`);
      const igData = await scrapeInstagramWithAI(websitePage, instagramUrl, business.name, cancellationToken);
      if (igData) {
        dataSources.push(igData.dataSource);
      }
    }
    
    // Check cancellation before AI processing
    if (cancellationToken?.isCancelled) {
      throw new JobCancelledError(cancellationToken.id);
    }
    
  } finally {
    // Close pages in parallel
    await Promise.all([
      websitePage.close().catch(() => {}),
      searchPage.close().catch(() => {}),
      socialPage.close().catch(() => {}),
    ]);
  }
  
  // Check cancellation before AI processing
  if (cancellationToken?.isCancelled) {
    throw new JobCancelledError(cancellationToken.id);
  }
  
  // OPTIMIZATION: Run AI extraction and cross-reference IN PARALLEL
  console.log(`   [Worker ${workerId}] ⚡ Parallel AI: extraction + cross-reference`);
  const [extractedData, validation] = await Promise.all([
    extractAndMergeData(teamId, textSources, business.name),
    crossReferenceWithAI(teamId, dataSources, business.name),
  ]);
  
  // Check cancellation after AI extraction
  if (cancellationToken?.isCancelled) {
    throw new JobCancelledError(cancellationToken.id);
  }
  
  // Prepare business data for analysis
  const businessData: BusinessData = {
    name: business.name,
    website: business.website,
    websiteContent: textSources.find(s => s.source === 'website')?.text,
    facebookUrl: facebookUrl || undefined,
    facebookContent: textSources.find(s => s.source === 'facebook')?.text,
    googleMapsData: {
      rating: business.rating,
      reviewCount: business.reviewCount,
      address: business.address,
      phone: business.phone,
      category: business.category || industry,
    },
    rawSearchResults: textSources.find(s => s.source === 'google_search')?.text,
  };
  
  // Check cancellation before business analysis
  if (cancellationToken?.isCancelled) {
    throw new JobCancelledError(cancellationToken.id);
  }
  
  // OPTIMIZATION: Run business analysis (needed for qualification input)
  console.log(`   [Worker ${workerId}] 📊 AI analyzing business...`);
  const analysis = await analyzeBusinessWithAI(teamId, businessData);
  
  // Check cancellation after analysis
  if (cancellationToken?.isCancelled) {
    throw new JobCancelledError(cancellationToken.id);
  }
  
  // Now qualify the lead (depends on analysis)
  console.log(`   [Worker ${workerId}] 🎯 AI qualifying lead...`);
  const qualificationInput: LeadQualificationInput = {
    businessName: business.name,
    industry,
    location,
    googleRating: business.rating,
    reviewCount: business.reviewCount,
    hasWebsite: Boolean(business.website),
    websiteUrl: business.website,
    websiteQualityScore: analysis.websiteQuality.score,
    phones: mergePhones(validation, extractedData),
    emails: mergeEmails(validation, extractedData),
    hasFacebook: Boolean(facebookUrl || validation.mergedData.socialMedia.facebook),
    hasInstagram: Boolean(validation.mergedData.socialMedia.instagram),
    analysis,
    extractedInfo: extractedData,
  };
  
  const qualification = await qualifyLeadWithAI(teamId, qualificationInput);
  
  // Build the final enriched lead
  const enrichedLead = buildEnrichedLead(
    business,
    location,
    industry,
    validation,
    extractedData,
    analysis,
    qualification,
    dataSources.map(s => s.source)
  );
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   [Worker ${workerId}] ✨ Enrichment complete in ${elapsed}s for: ${business.name}`);
  console.log(`   [Worker ${workerId}]    📈 Lead Score: ${enrichedLead.leadScore}/100 (Tier ${enrichedLead.qualificationTier})`);
  console.log(`   [Worker ${workerId}]    📞 Phones: ${enrichedLead.phones.length}, Emails: ${enrichedLead.emails.length}`);
  console.log(`   [Worker ${workerId}]    🎯 Recommended: ${enrichedLead.recommendedAction} via ${enrichedLead.recommendedChannel}`);
  
  return enrichedLead;
}

/**
 * Scrape website content for AI analysis
 * OPTIMIZED: Reduced timeout and delay
 * SUPPORTS: Cancellation for immediate job stopping
 */
async function scrapeWebsiteWithAI(
  page: Page,
  url: string,
  businessName: string,
  cancellationToken?: CancellationToken
): Promise<{ dataSource: DataSource; text: string } | null> {
  // Check cancellation immediately
  if (cancellationToken?.isCancelled) {
    return null;
  }
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Check cancellation after navigation
    if (cancellationToken?.isCancelled) {
      return null;
    }
    
    await sleepWithCancellation(FAST_DELAY, cancellationToken);
    
    // Extract text content
    const text = await page.evaluate(() => {
      const body = document.body;
      if (!body) return '';
      
      // Remove scripts, styles, and hidden elements
      const clone = body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
      
      return clone.innerText || clone.textContent || '';
    });
    
    // Extract contact links
    const links = await page.evaluate(() => {
      const result: { phones: string[]; emails: string[]; social: Record<string, string> } = {
        phones: [],
        emails: [],
        social: {},
      };
      
      // Find phone links
      document.querySelectorAll('a[href^="tel:"]').forEach(el => {
        const phone = el.getAttribute('href')?.replace('tel:', '');
        if (phone) result.phones.push(phone);
      });
      
      // Find email links
      document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
        const email = el.getAttribute('href')?.replace('mailto:', '').split('?')[0];
        if (email) result.emails.push(email);
      });
      
      // Find social links
      document.querySelectorAll('a[href*="facebook.com"]').forEach(el => {
        const href = el.getAttribute('href');
        if (href && !result.social.facebook) result.social.facebook = href;
      });
      document.querySelectorAll('a[href*="instagram.com"]').forEach(el => {
        const href = el.getAttribute('href');
        if (href && !result.social.instagram) result.social.instagram = href;
      });
      document.querySelectorAll('a[href*="twitter.com"], a[href*="x.com"]').forEach(el => {
        const href = el.getAttribute('href');
        if (href && !result.social.twitter) result.social.twitter = href;
      });
      document.querySelectorAll('a[href*="linkedin.com"]').forEach(el => {
        const href = el.getAttribute('href');
        if (href && !result.social.linkedin) result.social.linkedin = href;
      });
      
      return result;
    });
    
    return {
      dataSource: {
        source: 'website',
        confidence: 85,
        data: {
          name: businessName,
          phones: links.phones,
          emails: links.emails,
          website: url,
          socialMedia: links.social,
        },
      },
      text: text.substring(0, 10000), // Limit text length
    };
  } catch (error) {
    console.error('Failed to scrape website:', error);
    return null;
  }
}

/**
 * Search Google for business information
 * OPTIMIZED: Reduced timeout and delay
 * SUPPORTS: Cancellation for immediate job stopping
 */
async function searchGoogleWithAI(
  page: Page,
  businessName: string,
  location: string,
  cancellationToken?: CancellationToken
): Promise<{ dataSource: DataSource; text: string } | null> {
  // Check cancellation immediately
  if (cancellationToken?.isCancelled) {
    return null;
  }
  
  try {
    const query = `"${businessName}" ${location} contact`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Check cancellation after navigation
    if (cancellationToken?.isCancelled) {
      return null;
    }
    
    await sleepWithCancellation(FAST_DELAY, cancellationToken);
    
    // Extract search results text
    const text = await page.evaluate(() => {
      const results = document.querySelectorAll('#search .g');
      let text = '';
      results.forEach((result, i) => {
        if (i < 5) { // First 5 results
          text += (result as HTMLElement).innerText + '\n\n';
        }
      });
      return text;
    });
    
    // Extract any social media URLs found
    const socialUrls = await page.evaluate(() => {
      const social: Record<string, string> = {};
      const links = document.querySelectorAll('#search a');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href?.includes('facebook.com') && !social.facebook) {
          social.facebook = href;
        }
        if (href?.includes('instagram.com') && !social.instagram) {
          social.instagram = href;
        }
        if ((href?.includes('twitter.com') || href?.includes('x.com')) && !social.twitter) {
          social.twitter = href;
        }
        if (href?.includes('linkedin.com') && !social.linkedin) {
          social.linkedin = href;
        }
      });
      return social;
    });
    
    return {
      dataSource: {
        source: 'google_search',
        confidence: 60,
        data: {
          name: businessName,
          socialMedia: socialUrls,
        },
      },
      text,
    };
  } catch (error) {
    console.error('Failed to search Google:', error);
    return null;
  }
}

/**
 * Search Google for social media profiles of a business
 * Dedicated social media search to find LinkedIn, Instagram, Twitter, etc.
 * SUPPORTS: Cancellation for immediate job stopping
 */
async function searchSocialMediaWithAI(
  page: Page,
  businessName: string,
  location: string,
  cancellationToken?: CancellationToken
): Promise<{ dataSource: DataSource; text: string } | null> {
  if (cancellationToken?.isCancelled) {
    return null;
  }
  
  try {
    const query = `"${businessName}" ${location} site:linkedin.com OR site:instagram.com OR site:facebook.com OR site:twitter.com`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    if (cancellationToken?.isCancelled) {
      return null;
    }
    
    await sleepWithCancellation(FAST_DELAY, cancellationToken);
    
    // Extract search results text
    const text = await page.evaluate(() => {
      const results = document.querySelectorAll('#search .g');
      let text = '';
      results.forEach((result, i) => {
        if (i < 8) {
          text += (result as HTMLElement).innerText + '\n\n';
        }
      });
      return text;
    });
    
    // Extract all social media URLs found
    const socialUrls = await page.evaluate(() => {
      const social: Record<string, string> = {};
      const links = document.querySelectorAll('#search a');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        if (href.includes('facebook.com') && !social.facebook) {
          social.facebook = href;
        }
        if (href.includes('instagram.com') && !social.instagram) {
          social.instagram = href;
        }
        if ((href.includes('twitter.com') || href.includes('x.com')) && !social.twitter) {
          social.twitter = href;
        }
        if (href.includes('linkedin.com') && !social.linkedin) {
          social.linkedin = href;
        }
        if (href.includes('tiktok.com') && !social.tiktok) {
          social.tiktok = href;
        }
      });
      return social;
    });
    
    return {
      dataSource: {
        source: 'social_search',
        confidence: 65,
        data: {
          name: businessName,
          socialMedia: socialUrls,
        },
      },
      text,
    };
  } catch (error) {
    console.error('Failed to search social media:', error);
    return null;
  }
}

/**
 * Search Google for general business information, reviews, and services
 * Broader search to find more details about the business
 * SUPPORTS: Cancellation for immediate job stopping
 */
async function searchGenericWithAI(
  page: Page,
  businessName: string,
  location: string,
  cancellationToken?: CancellationToken
): Promise<{ dataSource: DataSource; text: string } | null> {
  if (cancellationToken?.isCancelled) {
    return null;
  }
  
  try {
    const query = `"${businessName}" ${location} reviews services about`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    if (cancellationToken?.isCancelled) {
      return null;
    }
    
    await sleepWithCancellation(FAST_DELAY, cancellationToken);
    
    // Extract search results text
    const text = await page.evaluate(() => {
      const results = document.querySelectorAll('#search .g');
      let text = '';
      results.forEach((result, i) => {
        if (i < 8) {
          text += (result as HTMLElement).innerText + '\n\n';
        }
      });
      return text;
    });
    
    // Also try to extract email addresses and phone numbers from results
    const contactInfo = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const emailMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const phoneMatches = bodyText.match(/(?:\+27|0)[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
      return {
        emails: [...new Set(emailMatches)],
        phones: [...new Set(phoneMatches)],
      };
    });
    
    return {
      dataSource: {
        source: 'generic_search',
        confidence: 50,
        data: {
          name: businessName,
          phones: contactInfo.phones,
          emails: contactInfo.emails,
        },
      },
      text,
    };
  } catch (error) {
    console.error('Failed to run generic search:', error);
    return null;
  }
}

/**
 * Scrape Facebook page for business information
 * OPTIMIZED: Reduced timeout and delay
 * SUPPORTS: Cancellation for immediate job stopping
 */
async function scrapeFacebookWithAI(
  page: Page,
  url: string,
  businessName: string,
  cancellationToken?: CancellationToken
): Promise<{ dataSource: DataSource; text: string } | null> {
  // Check cancellation immediately
  if (cancellationToken?.isCancelled) {
    return null;
  }
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Check cancellation after navigation
    if (cancellationToken?.isCancelled) {
      return null;
    }
    
    await sleepWithCancellation(FAST_DELAY, cancellationToken);
    
    // Extract page content
    const data = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      
      // Try to find phone numbers
      const phoneMatches = text.match(/(?:\+27|0)[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
      
      // Try to find email addresses
      const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      
      return {
        text: text.substring(0, 5000),
        phones: phoneMatches,
        emails: emailMatches,
      };
    });
    
    return {
      dataSource: {
        source: 'facebook',
        confidence: 70,
        data: {
          name: businessName,
          phones: data.phones,
          emails: data.emails,
          socialMedia: { facebook: url },
        },
      },
      text: data.text,
    };
  } catch (error) {
    console.error('Failed to scrape Facebook:', error);
    return null;
  }
}

/**
 * Find Facebook URL in search results
 */
function findFacebookUrl(text: string, businessName: string): string | null {
  const fbPattern = /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi;
  const matches = text.match(fbPattern);
  
  if (!matches) return null;
  
  // Try to find one that matches the business name
  const normalized = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  for (const url of matches) {
    if (url.toLowerCase().includes(normalized.substring(0, 10))) {
      return url;
    }
  }
  
  // Return first match if no name match
  return matches[0];
}

/**
 * Find Instagram URL in search results or website data
 */
function findInstagramUrl(searchText: string, websiteInstagramUrl?: string): string | null {
  // Prefer URL from website scrape
  if (websiteInstagramUrl) return websiteInstagramUrl;
  
  const igPattern = /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>?]+/gi;
  const matches = searchText.match(igPattern);
  
  if (!matches) return null;
  
  // Filter out generic Instagram URLs
  const filtered = matches.filter(url => {
    const path = url.replace(/https?:\/\/(?:www\.)?instagram\.com\/?/i, '');
    // Skip very short paths (likely generic pages)
    return path.length > 2 && !path.startsWith('explore') && !path.startsWith('p/');
  });
  
  return filtered[0] || null;
}

/**
 * Scrape Instagram profile for basic business info
 * Extracts bio text and any contact information visible on the profile
 * SUPPORTS: Cancellation for immediate job stopping
 */
async function scrapeInstagramWithAI(
  page: Page,
  url: string,
  businessName: string,
  cancellationToken?: CancellationToken
): Promise<{ dataSource: DataSource } | null> {
  if (cancellationToken?.isCancelled) {
    return null;
  }
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    if (cancellationToken?.isCancelled) {
      return null;
    }
    
    await sleepWithCancellation(FAST_DELAY, cancellationToken);
    
    // Extract basic info from the page (Instagram limits what's visible without login)
    const data = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const phoneMatches = text.match(/(?:\+27|0)[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
      return {
        emails: [...new Set(emailMatches)],
        phones: [...new Set(phoneMatches)],
      };
    });
    
    return {
      dataSource: {
        source: 'instagram',
        confidence: 55,
        data: {
          name: businessName,
          phones: data.phones,
          emails: data.emails,
          socialMedia: { instagram: url },
        },
      },
    };
  } catch (error) {
    console.error('Failed to scrape Instagram:', error);
    return null;
  }
}

/**
 * Merge phones from validation and extracted data
 */
function mergePhones(
  validation: ValidationResult,
  extracted: { contacts: ExtractedContactInfo; business: ExtractedBusinessInfo }
): string[] {
  const phones = new Set<string>();
  
  for (const p of validation.mergedData.phones) {
    phones.add(p.value);
  }
  for (const p of extracted.contacts.phones) {
    phones.add(p);
  }
  
  return Array.from(phones);
}

/**
 * Merge emails from validation and extracted data
 */
function mergeEmails(
  validation: ValidationResult,
  extracted: { contacts: ExtractedContactInfo; business: ExtractedBusinessInfo }
): string[] {
  const emails = new Set<string>();
  
  for (const e of validation.mergedData.emails) {
    emails.add(e.value);
  }
  for (const e of extracted.contacts.emails) {
    emails.add(e);
  }
  
  return Array.from(emails);
}

/**
 * Build the final enriched lead object
 */
function buildEnrichedLead(
  business: ScrapedBusinessInput,
  location: string,
  industry: string,
  validation: ValidationResult,
  extracted: { contacts: ExtractedContactInfo; business: ExtractedBusinessInfo },
  analysis: BusinessAnalysis,
  qualification: LeadQualification,
  sources: string[]
): SmartEnrichedLead {
  const phones = mergePhones(validation, extracted);
  const emails = mergeEmails(validation, extracted);
  
  return {
    businessName: validation.mergedData.name || business.name,
    industry,
    location,
    
    phones,
    emails,
    whatsappNumber: extracted.contacts.whatsappNumber || phones.find(p => p.startsWith('+27')),
    
    website: business.website,
    websiteQualityScore: analysis.websiteQuality.score,
    facebookUrl: validation.mergedData.socialMedia.facebook || extracted.contacts.socialMedia.facebook,
    instagramUrl: validation.mergedData.socialMedia.instagram || extracted.contacts.socialMedia.instagram,
    twitterUrl: validation.mergedData.socialMedia.twitter || extracted.contacts.socialMedia.twitter,
    linkedinUrl: validation.mergedData.socialMedia.linkedin || extracted.contacts.socialMedia.linkedin,
    googleMapsUrl: business.googleMapsUrl,
    
    googleRating: business.rating,
    reviewCount: business.reviewCount,
    address: validation.mergedData.address || business.address,
    
    description: analysis.businessDescription,
    servicesOffered: Array.from(new Set([...analysis.servicesOffered, ...extracted.business.services])),
    targetMarket: analysis.targetMarket,
    uniqueSellingPoints: analysis.uniqueSellingPoints,
    
    leadScore: qualification.qualificationScore,
    qualificationTier: qualification.qualificationTier,
    isQualified: qualification.isQualified,
    recommendedAction: qualification.recommendedAction,
    recommendedChannel: qualification.recommendedChannel,
    
    personalizationHooks: Array.from(new Set([...analysis.personalizationHooks, ...qualification.keyTalkingPoints])),
    keyTalkingPoints: qualification.keyTalkingPoints,
    avoidTopics: qualification.avoidTopics,
    
    enrichmentSources: sources,
    enrichmentConfidence: validation.confidence,
    aiReasoning: `${analysis.aiReasoning}\n\n${qualification.reasoning}`,
    warnings: validation.warnings,
    
    rawAnalysis: analysis,
    rawQualification: qualification,
    rawValidation: validation,
  };
}
