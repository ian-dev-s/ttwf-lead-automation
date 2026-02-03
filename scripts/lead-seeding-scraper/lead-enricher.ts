/**
 * Lead Enricher - Orchestrator
 * Coordinates all enrichment sources and merges data
 */

import { Browser } from 'playwright';
import { ScrapedBusiness } from './types';
import { enrichFromGoogleSearch, GoogleSearchResult } from './google-search-enricher';
import { scrapeFromFacebook, FacebookBusinessInfo } from './facebook-scraper';
import { enrichContactInfo, ContactInfo } from './contact-enricher';
import { sleep } from './utils';

export interface EnrichedLead {
  // Core business info
  name: string;
  address: string;
  location: string;
  industry: string;
  
  // Contact info (primary)
  phone?: string;
  email?: string;
  
  // All contact info
  phones: string[];
  emails: string[];
  
  // Online presence
  website?: string;
  googleMapsUrl: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  
  // Business details
  description?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  
  // Quality metrics
  websiteQuality?: number;
  
  // Source tracking
  sources: {
    [key: string]: string; // e.g., { "phone": "google_maps", "email": "website_contact" }
  };
}

/**
 * Enrich a business from multiple sources
 */
export async function enrichLead(
  browser: Browser,
  business: ScrapedBusiness,
  location: string,
  industry: string,
  workerId: number = 1
): Promise<EnrichedLead> {
  console.log(`\n   [Worker ${workerId}] 🔄 Starting enrichment for: ${business.name}`);
  
  const enriched: EnrichedLead = {
    name: business.name,
    address: business.address,
    location,
    industry,
    phones: [...business.phones],
    emails: [...business.emails],
    website: business.website,
    googleMapsUrl: business.googleMapsUrl,
    category: business.category,
    rating: business.rating,
    reviewCount: business.reviewCount,
    sources: {},
  };

  // Track sources for existing data
  if (business.phones.length > 0) {
    enriched.sources['phone_primary'] = 'google_maps';
  }
  if (business.website) {
    enriched.sources['website'] = 'google_maps';
  }

  // Run enrichment from multiple sources
  const enrichmentPromises: Promise<void>[] = [];

  // 1. Google Search for social links
  enrichmentPromises.push(
    enrichFromGoogleSearch(browser, business.name, location, business.website, workerId)
      .then((result) => {
        mergeGoogleSearchResult(enriched, result);
      })
      .catch((err) => {
        console.log(`   [Worker ${workerId}] ⚠️ Google Search enrichment failed: ${err?.message || err}`);
      })
  );

  // 2. Website contact crawl (if website exists)
  if (business.website) {
    enrichmentPromises.push(
      enrichContactInfo(browser, business.website, workerId)
        .then((result) => {
          mergeContactInfo(enriched, result);
        })
        .catch((err) => {
          console.log(`   [Worker ${workerId}] ⚠️ Contact enrichment failed: ${err?.message || err}`);
        })
    );
  }

  // Wait for initial enrichment
  await Promise.all(enrichmentPromises);

  // Small delay before Facebook scraping
  await sleep(1000);

  // 3. Facebook scraping (if we found a Facebook URL)
  if (enriched.facebookUrl) {
    try {
      const fbInfo = await scrapeFromFacebook(browser, enriched.facebookUrl, workerId);
      mergeFacebookInfo(enriched, fbInfo);
    } catch (err: any) {
      console.log(`   [Worker ${workerId}] ⚠️ Facebook scraping failed: ${err?.message || err}`);
    }
  }

  // Set primary contact info
  enriched.phone = enriched.phones[0];
  enriched.email = enriched.emails[0];

  // Deduplicate arrays
  enriched.phones = Array.from(new Set(enriched.phones));
  enriched.emails = Array.from(new Set(enriched.emails));

  // Log summary
  console.log(`   [Worker ${workerId}] ✅ Enrichment complete for: ${business.name}`);
  console.log(`   [Worker ${workerId}]    📞 Phones: ${enriched.phones.length}`);
  console.log(`   [Worker ${workerId}]    ✉️  Emails: ${enriched.emails.length}`);
  console.log(`   [Worker ${workerId}]    🔗 Social: FB=${!!enriched.facebookUrl}, IG=${!!enriched.instagramUrl}, TW=${!!enriched.twitterUrl}, LI=${!!enriched.linkedinUrl}`);

  return enriched;
}

/**
 * Merge Google Search results into enriched lead
 */
function mergeGoogleSearchResult(enriched: EnrichedLead, result: GoogleSearchResult): void {
  if (result.facebookUrl && !enriched.facebookUrl) {
    enriched.facebookUrl = result.facebookUrl;
    enriched.sources['facebookUrl'] = 'google_search';
  }
  
  if (result.instagramUrl && !enriched.instagramUrl) {
    enriched.instagramUrl = result.instagramUrl;
    enriched.sources['instagramUrl'] = 'google_search';
  }
  
  if (result.twitterUrl && !enriched.twitterUrl) {
    enriched.twitterUrl = result.twitterUrl;
    enriched.sources['twitterUrl'] = 'google_search';
  }
  
  if (result.linkedinUrl && !enriched.linkedinUrl) {
    enriched.linkedinUrl = result.linkedinUrl;
    enriched.sources['linkedinUrl'] = 'google_search';
  }
  
  if (result.website && !enriched.website) {
    enriched.website = result.website;
    enriched.sources['website'] = 'google_search';
  }
}

/**
 * Merge contact info from website crawl
 */
function mergeContactInfo(enriched: EnrichedLead, result: ContactInfo): void {
  // Add phones
  for (const phone of result.phones) {
    if (!enriched.phones.includes(phone)) {
      enriched.phones.push(phone);
      if (!enriched.sources[`phone_${enriched.phones.length}`]) {
        enriched.sources[`phone_${enriched.phones.length}`] = 'website_crawl';
      }
    }
  }
  
  // Add emails
  for (const email of result.emails) {
    if (!enriched.emails.includes(email)) {
      enriched.emails.push(email);
      if (!enriched.sources[`email_${enriched.emails.length}`]) {
        enriched.sources[`email_${enriched.emails.length}`] = 'website_crawl';
      }
    }
  }
  
  // Add description
  if (result.description && !enriched.description) {
    enriched.description = result.description;
    enriched.sources['description'] = 'website_crawl';
  }
  
  // Add social links from website
  if (result.socialLinks.facebook && !enriched.facebookUrl) {
    enriched.facebookUrl = result.socialLinks.facebook;
    enriched.sources['facebookUrl'] = 'website_social_link';
  }
  
  if (result.socialLinks.instagram && !enriched.instagramUrl) {
    enriched.instagramUrl = result.socialLinks.instagram;
    enriched.sources['instagramUrl'] = 'website_social_link';
  }
  
  if (result.socialLinks.twitter && !enriched.twitterUrl) {
    enriched.twitterUrl = result.socialLinks.twitter;
    enriched.sources['twitterUrl'] = 'website_social_link';
  }
  
  if (result.socialLinks.linkedin && !enriched.linkedinUrl) {
    enriched.linkedinUrl = result.socialLinks.linkedin;
    enriched.sources['linkedinUrl'] = 'website_social_link';
  }
}

/**
 * Merge Facebook info
 */
function mergeFacebookInfo(enriched: EnrichedLead, result: FacebookBusinessInfo): void {
  if (result.phone && !enriched.phones.includes(result.phone)) {
    enriched.phones.push(result.phone);
    enriched.sources[`phone_${enriched.phones.length}`] = 'facebook';
  }
  
  if (result.email && !enriched.emails.includes(result.email)) {
    enriched.emails.push(result.email);
    enriched.sources[`email_${enriched.emails.length}`] = 'facebook';
  }
  
  if (result.description && !enriched.description) {
    enriched.description = result.description;
    enriched.sources['description'] = 'facebook';
  }
  
  if (result.website && !enriched.website) {
    enriched.website = result.website;
    enriched.sources['website'] = 'facebook';
  }
  
  if (result.category && !enriched.category) {
    enriched.category = result.category;
    enriched.sources['category'] = 'facebook';
  }
}
