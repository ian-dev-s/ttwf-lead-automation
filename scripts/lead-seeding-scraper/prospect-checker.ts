/**
 * Determine if a business is a good prospect based on website quality
 */

import { ProspectCheckResult } from './types';
import { stopAllWorkers } from './state';
import { WEBSITE_QUALITY_THRESHOLD } from './config';
import { isSocialOrDirectory, isDIYWebsiteUrl } from './website-classifier';
import { analyzeWebsiteQuality } from './pagespeed-api';

/**
 * Check if a business is a good prospect based on their website
 */
export async function isGoodProspect(
  website: string | undefined,
  workerId: number
): Promise<ProspectCheckResult> {
  // Check if we should stop
  if (stopAllWorkers) {
    return { isGood: false, reason: 'STOPPED', shouldStop: true };
  }
  
  // No website = perfect prospect
  if (!website) {
    return { isGood: true, reason: 'NO_WEBSITE' };
  }
  
  // Social media or directory = good prospect
  if (isSocialOrDirectory(website)) {
    return { isGood: true, reason: 'SOCIAL_OR_DIRECTORY' };
  }
  
  // DIY website URL patterns = good prospect
  if (isDIYWebsiteUrl(website)) {
    return { isGood: true, reason: 'DIY_WEBSITE_PLATFORM' };
  }
  
  // Has a proper domain - analyze using Google PageSpeed Insights API
  const qualityResult = await analyzeWebsiteQuality(website, workerId);
  
  // Check if API failed fatally
  if (stopAllWorkers) {
    return { isGood: false, reason: 'API_FAILED', shouldStop: true };
  }
  
  // If website has poor score, it's a good prospect
  if (qualityResult.score < WEBSITE_QUALITY_THRESHOLD) {
    return { 
      isGood: true, 
      reason: 'POOR_QUALITY_WEBSITE',
      qualityScore: qualityResult.score,
      qualityDetails: qualityResult
    };
  }
  
  // Website is decent quality - skip this lead
  return { 
    isGood: false, 
    reason: 'HAS_QUALITY_WEBSITE',
    qualityScore: qualityResult.score,
    qualityDetails: qualityResult
  };
}
