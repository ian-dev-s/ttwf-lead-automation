/**
 * Database operations for saving leads
 */

import { PrismaClient } from '@prisma/client';
import { ScrapedBusiness, WebsiteQualityResult } from './types';
import { WEBSITE_QUALITY_THRESHOLD } from './config';
import { 
  isSocialOrDirectory, 
  isDIYWebsiteUrl, 
  calculateWebsiteScore 
} from './website-classifier';

const prisma = new PrismaClient();

/**
 * Save a scraped business to the database as a lead
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
