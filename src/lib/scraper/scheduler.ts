import { JobStatus, LeadStatus } from '@prisma/client';
import { Browser, chromium } from 'playwright';
import { generatePersonalizedMessage } from '../ai/personalize';
import { SmartEnrichedLead, smartEnrichLead } from '../ai/smart-enricher';
import { SA_CITIES, TARGET_CATEGORIES } from '../constants';
import { prisma } from '../db';
import { sleep } from '../utils';
import { createGoogleMapsScraper } from './google-maps';

// Re-export constants for convenience
export { SA_CITIES, TARGET_CATEGORIES };

/**
 * Save an AI-enriched lead to the database
 */
async function saveSmartEnrichedLead(lead: SmartEnrichedLead): Promise<boolean> {
  try {
    // Check if lead already exists
    const existing = await prisma.lead.findFirst({
      where: {
        OR: [
          { googleMapsUrl: lead.googleMapsUrl },
          { businessName: lead.businessName, location: lead.location },
        ],
      },
    });

    if (existing) {
      console.log(`   ⚠️  Lead already exists: ${lead.businessName}`);
      return false;
    }

    // Determine status based on qualification
    let status = LeadStatus.NEW;
    if (lead.qualificationTier === 'A') {
      status = LeadStatus.QUALIFIED;
    }

    // Calculate final score
    const score = lead.leadScore;

    // Create the lead
    await prisma.lead.create({
      data: {
        businessName: lead.businessName,
        industry: lead.industry,
        location: lead.location,
        address: lead.address,
        phone: lead.phones[0], // Primary phone
        email: lead.emails[0], // Primary email
        facebookUrl: lead.facebookUrl,
        instagramUrl: lead.instagramUrl,
        twitterUrl: lead.twitterUrl,
        linkedinUrl: lead.linkedinUrl,
        googleMapsUrl: lead.googleMapsUrl,
        website: lead.website,
        websiteQuality: lead.websiteQualityScore,
        googleRating: lead.googleRating,
        reviewCount: lead.reviewCount,
        description: lead.description,
        status,
        source: 'ai_scraper',
        score,
        notes: buildLeadNotes(lead),
        metadata: {
          // Store all AI insights
          allPhones: lead.phones,
          allEmails: lead.emails,
          whatsappNumber: lead.whatsappNumber,
          servicesOffered: lead.servicesOffered,
          targetMarket: lead.targetMarket,
          uniqueSellingPoints: lead.uniqueSellingPoints,
          qualificationTier: lead.qualificationTier,
          recommendedAction: lead.recommendedAction,
          recommendedChannel: lead.recommendedChannel,
          personalizationHooks: lead.personalizationHooks,
          keyTalkingPoints: lead.keyTalkingPoints,
          avoidTopics: lead.avoidTopics,
          aiReasoning: lead.aiReasoning,
          enrichmentSources: lead.enrichmentSources,
          enrichmentConfidence: lead.enrichmentConfidence,
          warnings: lead.warnings,
        },
      },
    });

    return true;
  } catch (error) {
    console.error(`   ❌ Failed to save lead ${lead.businessName}:`, error);
    return false;
  }
}

/**
 * Build notes string from AI insights
 */
function buildLeadNotes(lead: SmartEnrichedLead): string {
  const notes: string[] = [];
  
  // Qualification summary
  notes.push(`🎯 Lead Quality: Tier ${lead.qualificationTier} (${lead.leadScore}/100)`);
  notes.push(`📋 Recommended: ${lead.recommendedAction.replace(/_/g, ' ')} via ${lead.recommendedChannel}`);
  
  // Services
  if (lead.servicesOffered.length > 0) {
    notes.push(`\n🔧 Services: ${lead.servicesOffered.join(', ')}`);
  }
  
  // Personalization hooks
  if (lead.personalizationHooks.length > 0) {
    notes.push(`\n💡 Personalization hooks:`);
    lead.personalizationHooks.forEach(hook => notes.push(`  • ${hook}`));
  }
  
  // Key talking points
  if (lead.keyTalkingPoints.length > 0) {
    notes.push(`\n🗣️ Key talking points:`);
    lead.keyTalkingPoints.forEach(point => notes.push(`  • ${point}`));
  }
  
  // Topics to avoid
  if (lead.avoidTopics.length > 0) {
    notes.push(`\n⚠️ Avoid discussing:`);
    lead.avoidTopics.forEach(topic => notes.push(`  • ${topic}`));
  }
  
  // Warnings
  if (lead.warnings.length > 0) {
    notes.push(`\n🚨 Warnings:`);
    lead.warnings.forEach(warning => notes.push(`  • ${warning}`));
  }
  
  return notes.join('\n');
}

// Run a scraping job with AI-powered multi-source enrichment
export async function runScrapingJob(jobId: string): Promise<void> {
  const job = await prisma.scrapingJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Update job status to running
  await prisma.scrapingJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  const scraper = createGoogleMapsScraper({
    headless: true,
    delayBetweenRequests: parseInt(process.env.SCRAPE_DELAY_MS || '2000'),
    maxResults: job.leadsRequested,
  });

  let leadsFound = 0;
  let browser: Browser | null = null;

  try {
    await scraper.initialize();
    
    // Create a separate browser for AI enrichment
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Get search parameters
    const categories = job.categories.length > 0 ? job.categories : TARGET_CATEGORIES;
    const locations = job.locations.length > 0 ? job.locations : SA_CITIES;
    const minRating = job.minRating || 4.0;

    console.log(`\n🔍 Starting AI-POWERED scraping job: ${jobId}`);
    console.log(`   🧠 Using AI for: Business Analysis, Data Extraction, Lead Qualification`);
    console.log(`   Target: ${job.leadsRequested} lead(s)`);
    console.log(`   Categories: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? '...' : ''}`);
    console.log(`   Locations: ${locations.slice(0, 3).join(', ')}${locations.length > 3 ? '...' : ''}\n`);

    // Iterate through categories and locations
    for (const category of categories) {
      if (leadsFound >= job.leadsRequested) break;

      for (const location of locations) {
        if (leadsFound >= job.leadsRequested) break;

        try {
          console.log(`\n📍 Searching: ${category} in ${location}`);
          
          const businesses = await scraper.searchBusinesses({
            query: category,
            location: location,
            minRating,
            // Only get what we need - 1 at a time for thorough AI enrichment
            maxResults: Math.min(3, job.leadsRequested - leadsFound),
          });

          for (const business of businesses) {
            if (leadsFound >= job.leadsRequested) break;

            // Check if this business already exists
            const existingLead = await prisma.lead.findFirst({
              where: {
                OR: [
                  { googleMapsUrl: business.googleMapsUrl },
                  {
                    businessName: business.name,
                    location: location,
                  },
                ],
              },
            });

            if (existingLead) {
              console.log(`   ⏭️  Skipping existing: ${business.name}`);
              continue;
            }

            // Quick pre-filter: skip businesses with high-quality websites
            if (business.website) {
              const quickScore = await scraper.checkWebsiteQuality(business.website);
              if (quickScore > 70) {
                console.log(`   ⏭️  Skipping ${business.name} - likely has good website`);
                continue;
              }
            }

            console.log(`\n   🧠 AI Enrichment starting for: ${business.name}`);

            try {
              // Use AI-powered smart enrichment
              const enrichedLead = await smartEnrichLead(
                browser,
                {
                  name: business.name,
                  googleMapsUrl: business.googleMapsUrl || '',
                  address: business.address,
                  phone: business.phone,
                  website: business.website,
                  rating: business.rating,
                  reviewCount: business.reviewCount,
                  category: business.category || category,
                },
                location,
                category,
                1 // workerId
              );

              // Check if lead is qualified
              if (!enrichedLead.isQualified && enrichedLead.qualificationTier === 'D') {
                console.log(`   ⏭️  AI determined ${business.name} is not a good prospect (Tier D)`);
                continue;
              }

              // Save the AI-enriched lead
              const saved = await saveSmartEnrichedLead(enrichedLead);

              if (saved) {
                leadsFound++;
                console.log(`   ✅ Saved AI-enriched lead: ${business.name}`);
                console.log(`      📊 Score: ${enrichedLead.leadScore}/100 | Tier: ${enrichedLead.qualificationTier}`);
                console.log(`      📞 Contacts: ${enrichedLead.phones.length} phones, ${enrichedLead.emails.length} emails`);
                console.log(`      🎯 Action: ${enrichedLead.recommendedAction} via ${enrichedLead.recommendedChannel}`);

                // Update job progress
                await prisma.scrapingJob.update({
                  where: { id: jobId },
                  data: { leadsFound },
                });

                // If we've reached our target, stop immediately
                if (leadsFound >= job.leadsRequested) {
                  console.log(`\n🎯 Target reached! Stopping scraper.`);
                  break;
                }
              }
            } catch (enrichError) {
              console.error(`   ⚠️  AI enrichment failed for ${business.name}:`, enrichError);
              // Continue to next business
            }

            // Delay between leads to respect API rate limits
            await sleep(3000);
          }
        } catch (error) {
          console.error(`   ❌ Error searching ${category} in ${location}:`, error);
        }
      }
    }

    // Mark job as completed
    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        leadsFound,
      },
    });

    console.log(`\n✅ AI-Powered Job completed! Found ${leadsFound} qualified lead(s)`);

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  } finally {
    await scraper.close();
    if (browser) {
      await browser.close();
    }
  }
}

// Schedule a new scraping job
export async function scheduleScrapingJob(options: {
  leadsRequested: number;
  categories?: string[];
  locations?: string[];
  minRating?: number;
  scheduledFor?: Date;
}): Promise<string> {
  const job = await prisma.scrapingJob.create({
    data: {
      leadsRequested: options.leadsRequested,
      categories: options.categories || [],
      locations: options.locations || [],
      minRating: options.minRating,
      scheduledFor: options.scheduledFor || new Date(),
      status: JobStatus.SCHEDULED,
    },
  });

  return job.id;
}

// Get pending jobs
export async function getPendingJobs() {
  return prisma.scrapingJob.findMany({
    where: {
      status: JobStatus.SCHEDULED,
      scheduledFor: {
        lte: new Date(),
      },
    },
    orderBy: {
      scheduledFor: 'asc',
    },
  });
}

// Generate messages for new leads
export async function generateMessagesForNewLeads(): Promise<number> {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 'default' },
  });

  if (!settings?.autoGenerateMessages) {
    return 0;
  }

  const newLeads = await prisma.lead.findMany({
    where: {
      status: LeadStatus.NEW,
      messages: {
        none: {},
      },
    },
    take: 10,
  });

  let generated = 0;

  for (const lead of newLeads) {
    try {
      // Generate WhatsApp message if phone available
      if (lead.phone) {
        const whatsappMessage = await generatePersonalizedMessage({
          lead,
          messageType: 'WHATSAPP',
        });

        await prisma.message.create({
          data: {
            leadId: lead.id,
            type: 'WHATSAPP',
            content: whatsappMessage.content,
            status: 'DRAFT',
          },
        });
      }

      // Generate email message if email available
      if (lead.email) {
        const emailMessage = await generatePersonalizedMessage({
          lead,
          messageType: 'EMAIL',
        });

        await prisma.message.create({
          data: {
            leadId: lead.id,
            type: 'EMAIL',
            subject: emailMessage.subject,
            content: emailMessage.content,
            status: 'DRAFT',
          },
        });
      }

      // Update lead status
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.MESSAGE_READY },
      });

      generated++;
    } catch (error) {
      console.error(`Failed to generate message for lead ${lead.id}:`, error);
    }
  }

  return generated;
}
