/**
 * Quality Checker - Integrates original scraper's website quality analysis
 * 
 * Uses:
 * - Google PageSpeed Insights API for real quality analysis (with caching)
 * - DIY website pattern detection
 * - Social media/directory pattern detection
 * 
 * OPTIMIZATIONS:
 * - In-memory cache for PageSpeed results (avoids duplicate API calls)
 * - Reduced delays between API calls
 */

import { sleep } from '../utils';

// PageSpeed API configuration
const PAGESPEED_API_KEY = process.env.PAGESPEED_API_KEY || 'AIzaSyDdQdInPDoaUWtS0BmVIs-JY4zCmiEazOk';
const PAGESPEED_MAX_RETRIES = 3;
const PAGESPEED_INITIAL_BACKOFF_MS = 30000; // Reduced from 60s to 30s
const DELAY_BETWEEN_API_CALLS = 500; // Reduced from 2000ms to 500ms

// OPTIMIZATION: Cache PageSpeed results to avoid duplicate API calls
interface CachedResult {
  result: WebsiteQualityResult;
  timestamp: number;
}
const pageSpeedCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Quality threshold - websites scoring below this are good prospects
export const WEBSITE_QUALITY_THRESHOLD = 60;

// Social media and directory patterns - these are NOT professional websites
const SOCIAL_PATTERNS = [
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
  'tiktok.com',
  'youtube.com',
  'pinterest.com',
];

// DIY website builder patterns - these are low-quality websites
const DIY_PATTERNS = [
  'wix.com',
  'wixsite.com',
  'weebly.com',
  'wordpress.com', // Note: NOT wordpress.org - those are self-hosted
  'squarespace.com',
  'webnode.com',
  'jimdo.com',
  'site123.com',
  'webs.com',
  'yola.com',
  'strikingly.com',
  'carrd.co',
  'webflow.io',
  'netlify.app',
  'vercel.app',
  'herokuapp.com',
  'blogspot.com',
  'blogger.com',
  'tumblr.com',
  'sites.google.com',
  'google.com/site',
  'co.za.com',
  'mweb.co.za/sites',
  'godaddysites.com',
  'my.canva.site',
  'business.site', // Google Business sites
];

export interface WebsiteQualityResult {
  score: number;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  issues: string[];
  error?: string;
}

export interface ProspectCheckResult {
  isGoodProspect: boolean;
  reason: 'NO_WEBSITE' | 'SOCIAL_OR_DIRECTORY' | 'DIY_WEBSITE_PLATFORM' | 'POOR_QUALITY_WEBSITE' | 'HAS_QUALITY_WEBSITE' | 'API_ERROR';
  qualityScore?: number;
  qualityDetails?: WebsiteQualityResult;
}

/**
 * Check if website is a social media or directory listing
 */
export function isSocialOrDirectory(website: string): boolean {
  return SOCIAL_PATTERNS.some(pattern => 
    website.toLowerCase().includes(pattern)
  );
}

/**
 * Check if website URL indicates a DIY/template site
 */
export function isDIYWebsiteUrl(website: string): boolean {
  return DIY_PATTERNS.some(pattern => 
    website.toLowerCase().includes(pattern)
  );
}

/**
 * Calculate a basic website score based on URL patterns
 */
export function calculateWebsiteScore(
  website: string | null | undefined, 
  qualityScore?: number
): number {
  if (!website) return 0; // No website = best prospect (score 0 = highest priority)
  if (isSocialOrDirectory(website)) return 15; // Social only = great prospect
  if (isDIYWebsiteUrl(website)) return 25; // DIY platform = great prospect
  if (qualityScore !== undefined) {
    // Use the actual quality score
    return qualityScore;
  }
  return 70; // Default for unanalyzed proper websites
}

/**
 * Analyze website quality using Google PageSpeed Insights API
 * Includes retry logic with exponential backoff
 * OPTIMIZED: Uses caching to avoid duplicate API calls
 */
export async function analyzeWebsiteQuality(
  websiteUrl: string,
  workerId: number = 1
): Promise<WebsiteQualityResult> {
  // Ensure URL has protocol
  let url = websiteUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // OPTIMIZATION: Check cache first
  const cacheKey = url.toLowerCase().replace(/\/$/, ''); // Normalize URL
  const cached = pageSpeedCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`   [Worker ${workerId}] ⚡ PageSpeed cache hit for: ${url}`);
    return cached.result;
  }

  const result: WebsiteQualityResult = {
    score: 50,
    performance: 0,
    accessibility: 0,
    bestPractices: 0,
    seo: 0,
    issues: [],
  };

  // Google PageSpeed Insights API with API key
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${PAGESPEED_API_KEY}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=mobile`;
  
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= PAGESPEED_MAX_RETRIES; attempt++) {
    try {
      console.log(`   [Worker ${workerId}] 🔍 PageSpeed API call (attempt ${attempt}/${PAGESPEED_MAX_RETRIES}): ${url}`);
      
      // Add delay between API calls
      if (attempt > 1) {
        const backoffMs = PAGESPEED_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 2);
        console.log(`   [Worker ${workerId}] ⏳ Waiting ${Math.round(backoffMs / 1000)}s before retry...`);
        await sleep(backoffMs);
      } else {
        await sleep(DELAY_BETWEEN_API_CALLS);
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.status === 429) {
        lastError = 'Rate limited (429)';
        console.log(`   [Worker ${workerId}] ⚠️ Rate limited, will retry...`);
        continue;
      }
      
      // 400 errors often mean the site couldn't be analyzed (broken, blocked, etc.)
      // Treat this as a low quality website - good prospect!
      if (response.status === 400) {
        console.log(`   [Worker ${workerId}] ⚠️ PageSpeed returned 400 - assuming poor quality website`);
        result.score = 25;
        result.issues.push('Website could not be analyzed (may be broken or inaccessible)');
        return result;
      }
      
      if (!response.ok) {
        lastError = `API returned ${response.status}`;
        console.log(`   [Worker ${workerId}] ⚠️ API error ${response.status}, will retry...`);
        continue;
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
      
      // OPTIMIZATION: Cache the result
      pageSpeedCache.set(cacheKey, { result, timestamp: Date.now() });
      
      return result; // Success!
      
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = 'Request timeout';
      } else if (error instanceof Error) {
        lastError = error.message;
      } else {
        lastError = 'Unknown error';
      }
      console.log(`   [Worker ${workerId}] ⚠️ Attempt ${attempt} failed: ${lastError}`);
    }
  }
  
  // All retries exhausted - return default score
  console.error(`   [Worker ${workerId}] ⚠️ PageSpeed API failed after ${PAGESPEED_MAX_RETRIES} retries: ${lastError}`);
  result.error = `API failed after ${PAGESPEED_MAX_RETRIES} retries: ${lastError}`;
  result.score = 50; // Assume medium quality
  
  return result;
}

/**
 * Full prospect check - determines if a business is a good prospect based on their website
 */
export async function checkIfGoodProspect(
  website: string | undefined,
  workerId: number = 1
): Promise<ProspectCheckResult> {
  // No website = perfect prospect
  if (!website) {
    console.log(`   [Worker ${workerId}] ✅ No website - PERFECT prospect`);
    return { isGoodProspect: true, reason: 'NO_WEBSITE', qualityScore: 0 };
  }
  
  // Social media or directory = good prospect (they don't have a real website)
  if (isSocialOrDirectory(website)) {
    console.log(`   [Worker ${workerId}] ✅ Social/Directory only - GREAT prospect`);
    return { isGoodProspect: true, reason: 'SOCIAL_OR_DIRECTORY', qualityScore: 15 };
  }
  
  // DIY website URL patterns = good prospect (poor quality site)
  if (isDIYWebsiteUrl(website)) {
    console.log(`   [Worker ${workerId}] ✅ DIY website platform - GREAT prospect`);
    return { isGoodProspect: true, reason: 'DIY_WEBSITE_PLATFORM', qualityScore: 25 };
  }
  
  // Has a proper domain - analyze using Google PageSpeed Insights API
  console.log(`   [Worker ${workerId}] 🔍 Analyzing website quality: ${website}`);
  const qualityResult = await analyzeWebsiteQuality(website, workerId);
  
  // If API had an error, be conservative and consider it a potential prospect
  if (qualityResult.error) {
    console.log(`   [Worker ${workerId}] ⚠️ API error - assuming potential prospect`);
    return { 
      isGoodProspect: true, 
      reason: 'API_ERROR',
      qualityScore: 50,
      qualityDetails: qualityResult
    };
  }
  
  // If website has poor score, it's a good prospect
  if (qualityResult.score < WEBSITE_QUALITY_THRESHOLD) {
    console.log(`   [Worker ${workerId}] ✅ Poor quality website (${qualityResult.score}/100) - GOOD prospect`);
    return { 
      isGoodProspect: true, 
      reason: 'POOR_QUALITY_WEBSITE',
      qualityScore: qualityResult.score,
      qualityDetails: qualityResult
    };
  }
  
  // Website is decent quality - skip this lead
  console.log(`   [Worker ${workerId}] ❌ Quality website (${qualityResult.score}/100) - SKIPPING`);
  return { 
    isGoodProspect: false, 
    reason: 'HAS_QUALITY_WEBSITE',
    qualityScore: qualityResult.score,
    qualityDetails: qualityResult
  };
}

/**
 * Quick quality check - for pre-filtering without API calls
 * Returns estimated quality score based on URL patterns only
 */
export function quickQualityCheck(website: string | undefined): {
  isLikelyGoodProspect: boolean;
  estimatedScore: number;
  reason: string;
} {
  if (!website) {
    return { isLikelyGoodProspect: true, estimatedScore: 0, reason: 'No website' };
  }
  
  if (isSocialOrDirectory(website)) {
    return { isLikelyGoodProspect: true, estimatedScore: 15, reason: 'Social/Directory only' };
  }
  
  if (isDIYWebsiteUrl(website)) {
    return { isLikelyGoodProspect: true, estimatedScore: 25, reason: 'DIY website platform' };
  }
  
  // Has proper domain - needs full analysis
  return { isLikelyGoodProspect: false, estimatedScore: 70, reason: 'Has proper domain - needs analysis' };
}
