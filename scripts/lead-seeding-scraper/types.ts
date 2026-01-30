/**
 * Type definitions for the lead seeding scraper
 */

export interface ScrapedBusiness {
  name: string;
  address: string;
  phones: string[];
  emails: string[];
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl: string;
  category?: string;
}

export interface WorkItem {
  city: string;
  industry: string;
}

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
  isGood: boolean;
  reason: string;
  qualityScore?: number;
  qualityDetails?: WebsiteQualityResult;
  shouldStop?: boolean;
}

export interface ScrapedBusinessResult {
  business: ScrapedBusiness;
  qualityScore?: number;
  qualityDetails?: WebsiteQualityResult;
}
