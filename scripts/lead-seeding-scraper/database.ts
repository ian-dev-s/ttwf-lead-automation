/**
 * Database operations for saving leads
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { EnrichedLead } from './lead-enricher';
import { ScrapedBusiness, WebsiteQualityResult } from './types';
import {
  calculateWebsiteScore,
  isDIYWebsiteUrl,
  isSocialOrDirectory
} from './website-classifier';

// Load environment variables
config();

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

/**
 * Save an enriched lead to the database
 */
export async function saveEnrichedLeadToDatabase(
  enriched: EnrichedLead,
  workerId: number,
  qualityScore?: number,
  qualityDetails?: WebsiteQualityResult
): Promise<boolean> {
  try {
    const websiteScore = calculateWebsiteScore(enriched.website, qualityScore);
    
    const leadScore = Math.round(
      (enriched.rating || 4) * 15 +
      Math.min((enriched.reviewCount || 0) / 10, 20) +
      (100 - websiteScore) * 0.4 +
      (enriched.emails.length > 0 ? 10 : 0) +
      (enriched.phones.length > 1 ? 5 : 0) +
      (enriched.facebookUrl ? 5 : 0)
    );

    // Check if lead already exists
    const existing = await prisma.lead.findFirst({
      where: {
        OR: [
          { businessName: enriched.name, location: enriched.location },
          { googleMapsUrl: enriched.googleMapsUrl },
          ...(enriched.phone ? [{ businessName: enriched.name, phone: enriched.phone }] : []),
        ],
      },
    });

    if (existing) {
      console.log(`   [Worker ${workerId}] ⏭️  Skipped existing: ${enriched.name}`);
      return false;
    }

    // Build notes
    const notes = buildEnrichedNotes(enriched, qualityScore, qualityDetails);

    // Create the lead with all enriched data
    await prisma.lead.create({
      data: {
        businessName: enriched.name,
        email: enriched.email || null,
        phone: enriched.phone || null,
        website: enriched.website,
        address: enriched.address,
        location: enriched.location,
        industry: enriched.industry,
        description: enriched.description,
        source: 'GOOGLE_MAPS_ENRICHED',
        status: 'NEW',
        googleRating: enriched.rating,
        reviewCount: enriched.reviewCount,
        googleMapsUrl: enriched.googleMapsUrl,
        facebookUrl: enriched.facebookUrl,
        instagramUrl: enriched.instagramUrl,
        twitterUrl: enriched.twitterUrl,
        linkedinUrl: enriched.linkedinUrl,
        websiteQuality: websiteScore,
        score: Math.min(100, Math.max(0, leadScore)),
        notes,
        metadata: {
          phones: enriched.phones,
          emails: enriched.emails,
          category: enriched.category,
          sources: enriched.sources,
          pageSpeedAnalysis: qualityDetails ? {
            overallScore: qualityDetails.score,
            performance: qualityDetails.performance,
            accessibility: qualityDetails.accessibility,
            bestPractices: qualityDetails.bestPractices,
            seo: qualityDetails.seo,
            issues: qualityDetails.issues,
          } : undefined,
        },
      },
    });

    return true;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      console.log(`   [Worker ${workerId}] ⏭️  Skipped duplicate: ${enriched.name}`);
      return false;
    }
    console.error(`   [Worker ${workerId}] Error saving lead: ${error}`);
    return false;
  }
}

/**
 * Build notes for enriched lead
 */
function buildEnrichedNotes(
  enriched: EnrichedLead,
  qualityScore?: number,
  qualityDetails?: WebsiteQualityResult
): string {
  const parts: string[] = ['Scraped from Google Maps with multi-source enrichment.'];
  
  // Website status
  if (!enriched.website) {
    parts.push('🎯 NO WEBSITE - Perfect prospect!');
  } else if (isSocialOrDirectory(enriched.website)) {
    parts.push('📱 Only has social media/directory listing - Great prospect!');
  } else if (isDIYWebsiteUrl(enriched.website)) {
    parts.push('🔧 Has DIY website platform - Good prospect for upgrade!');
  } else if (qualityDetails) {
    parts.push(`📊 PageSpeed Score: ${qualityScore}/100`);
  }
  
  // Contact info summary
  if (enriched.phones.length > 0) {
    parts.push(`📞 ${enriched.phones.length} phone(s): ${enriched.phones.join(', ')}`);
  }
  if (enriched.emails.length > 0) {
    parts.push(`✉️ ${enriched.emails.length} email(s): ${enriched.emails.join(', ')}`);
  }
  
  // Social media summary
  const socialCount = [
    enriched.facebookUrl,
    enriched.instagramUrl,
    enriched.twitterUrl,
    enriched.linkedinUrl,
  ].filter(Boolean).length;
  
  if (socialCount > 0) {
    parts.push(`🔗 ${socialCount} social media profile(s) found`);
  }
  
  // Description preview
  if (enriched.description) {
    parts.push(`📝 ${enriched.description.substring(0, 100)}...`);
  }
  
  return parts.join(' | ');
}

/**
 * Save a scraped business to the database as a lead (legacy function)
 */
export async function saveLeadToDatabase(
  business: ScrapedBusiness, 
  industry: string, 
  location: string,
  workerId: number,
  qualityScore?: number,
  qualityDetails?: WebsiteQualityResult
): Promise<boolean> {
  try {
    const websiteScore = calculateWebsiteScore(business.website, qualityScore);
    
    const leadScore = Math.round(
      (business.rating || 4) * 15 +
      Math.min((business.reviewCount || 0) / 10, 20) +
      (100 - websiteScore) * 0.4
    );

    const primaryPhone = business.phones[0] || null;
    const primaryEmail = business.emails[0] || null;

    // Check if lead already exists
    const existing = await prisma.lead.findFirst({
      where: {
        OR: [
          { businessName: business.name, location: location },
          { googleMapsUrl: business.googleMapsUrl },
          ...(primaryPhone ? [{ businessName: business.name, phone: primaryPhone }] : []),
        ],
      },
    });

    if (existing) {
      console.log(`   [Worker ${workerId}] ⏭️  Skipped existing: ${business.name}`);
      return false;
    }

    // Build notes
    const notes = buildNotes(business, qualityScore, qualityDetails);

    // Create the lead
    await prisma.lead.create({
      data: {
        businessName: business.name,
        email: primaryEmail,
        phone: primaryPhone,
        website: business.website,
        address: business.address,
        location: location,
        industry: industry,
        source: 'GOOGLE_MAPS',
        status: 'NEW',
        googleRating: business.rating,
        reviewCount: business.reviewCount,
        googleMapsUrl: business.googleMapsUrl,
        facebookUrl: business.website?.includes('facebook.com') ? business.website : null,
        websiteQuality: websiteScore,
        score: Math.min(100, Math.max(0, leadScore)),
        notes,
        metadata: {
          phones: business.phones,
          emails: business.emails,
          category: business.category,
          pageSpeedAnalysis: qualityDetails ? {
            overallScore: qualityDetails.score,
            performance: qualityDetails.performance,
            accessibility: qualityDetails.accessibility,
            bestPractices: qualityDetails.bestPractices,
            seo: qualityDetails.seo,
            issues: qualityDetails.issues,
          } : undefined,
        },
      },
    });

    return true;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      console.log(`   [Worker ${workerId}] ⏭️  Skipped duplicate: ${business.name}`);
      return false;
    }
    console.error(`   [Worker ${workerId}] Error saving lead: ${error}`);
    return false;
  }
}

function buildNotes(
  business: ScrapedBusiness,
  qualityScore?: number,
  qualityDetails?: WebsiteQualityResult
): string {
  let prospectNote = '';
  
  if (!business.website) {
    prospectNote = '🎯 NO WEBSITE - Perfect prospect!';
  } else if (isSocialOrDirectory(business.website)) {
    prospectNote = '📱 Only has social media/directory listing - Great prospect!';
  } else if (isDIYWebsiteUrl(business.website)) {
    prospectNote = '🔧 Has DIY website platform - Good prospect for upgrade!';
  } else if (qualityDetails) {
    prospectNote = `📊 PageSpeed Score: ${qualityScore}/100 (Perf: ${qualityDetails.performance}, SEO: ${qualityDetails.seo}, A11y: ${qualityDetails.accessibility})`;
    if (qualityDetails.issues.length > 0) {
      prospectNote += ` | Issues: ${qualityDetails.issues.slice(0, 3).join(', ')}`;
    }
  } else {
    prospectNote = `Website: ${business.website}`;
  }
  
  const parts = [
    'Scraped from Google Maps.',
    prospectNote,
    business.phones.length > 1 ? `📞 Additional phones: ${business.phones.slice(1).join(', ')}` : '',
    business.emails.length > 0 ? `✉️ Emails found: ${business.emails.join(', ')}` : '',
  ];
  
  return parts.filter(Boolean).join(' ');
}

/**
 * Get the current count of leads in the database
 */
export async function getLeadCount(): Promise<number> {
  return prisma.lead.count();
}

/**
 * Disconnect from the database
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
