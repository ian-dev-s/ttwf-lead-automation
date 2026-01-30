/**
 * Google PageSpeed Insights API integration
 * With retry logic and exponential backoff
 */

import { WebsiteQualityResult } from './types';
import { sleep } from './utils';
import { setStopAllWorkers } from './state';
import {
  PAGESPEED_API_KEY,
  PAGESPEED_MAX_RETRIES,
  PAGESPEED_INITIAL_BACKOFF_MS,
  DELAY_BETWEEN_API_CALLS,
} from './config';

/**
 * Analyze website quality using Google PageSpeed Insights API
 * Includes retry logic with exponential backoff
 */
export async function analyzeWebsiteQuality(
  websiteUrl: string,
  workerId: number
): Promise<WebsiteQualityResult> {
  const result: WebsiteQualityResult = {
    score: 50,
    performance: 0,
    accessibility: 0,
    bestPractices: 0,
    seo: 0,
    issues: [],
  };

  // Ensure URL has protocol
  let url = websiteUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

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
      
      return result; // Success!
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        lastError = 'Request timeout';
      } else {
        lastError = error?.message || 'Unknown error';
      }
      console.log(`   [Worker ${workerId}] ⚠️ Attempt ${attempt} failed: ${lastError}`);
    }
  }
  
  // All retries exhausted - this is a fatal error
  console.error(`\n❌ [Worker ${workerId}] FATAL: PageSpeed API failed after ${PAGESPEED_MAX_RETRIES} retries: ${lastError}`);
  console.error(`❌ Cannot guarantee lead quality - stopping process.\n`);
  
  result.error = `API failed after ${PAGESPEED_MAX_RETRIES} retries: ${lastError}`;
  setStopAllWorkers(true);
  
  return result;
}
