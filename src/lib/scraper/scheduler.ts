import { JobStatus, LeadStatus } from '@prisma/client';
import { generatePersonalizedMessage } from '../ai/personalize';
import { SA_CITIES, TARGET_CATEGORIES } from '../constants';
import { prisma } from '../db';
import { calculateLeadScore } from '../utils';
import { createGoogleMapsScraper } from './google-maps';

// Re-export constants for convenience
export { SA_CITIES, TARGET_CATEGORIES };

// Run a scraping job
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

  try {
    await scraper.initialize();

    // Get search parameters
    const categories = job.categories.length > 0 ? job.categories : TARGET_CATEGORIES;
    const locations = job.locations.length > 0 ? job.locations : SA_CITIES;
    const minRating = job.minRating || 4.0;

    // Iterate through categories and locations
    for (const category of categories) {
      if (leadsFound >= job.leadsRequested) break;

      for (const location of locations) {
        if (leadsFound >= job.leadsRequested) break;

        try {
          const businesses = await scraper.searchBusinesses({
            query: category,
            location: location,
            minRating,
            maxResults: Math.min(10, job.leadsRequested - leadsFound),
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
              console.log(`Skipping existing lead: ${business.name}`);
              continue;
            }

            // Filter: we want businesses without websites or with poor ones
            let websiteQuality: number | null = null;
            if (business.website) {
              websiteQuality = await scraper.checkWebsiteQuality(business.website);
              if (websiteQuality > 60) {
                console.log(`Skipping ${business.name} - website quality too high (${websiteQuality})`);
                continue;
              }
            }

            // Calculate lead score
            const score = calculateLeadScore({
              hasNoWebsite: !business.website,
              hasLowQualityWebsite: !!business.website && websiteQuality !== null && websiteQuality < 50,
              googleRating: business.rating || null,
              reviewCount: business.reviewCount || null,
              hasFacebook: false, // Would need Facebook scraping
              hasPhone: !!business.phone,
              hasEmail: false,
            });

            // Create the lead
            const lead = await prisma.lead.create({
              data: {
                businessName: business.name,
                industry: business.category || category,
                location: location,
                address: business.address,
                phone: business.phone,
                googleMapsUrl: business.googleMapsUrl,
                website: business.website,
                websiteQuality,
                googleRating: business.rating,
                reviewCount: business.reviewCount,
                source: 'google_maps',
                score,
                status: LeadStatus.NEW,
                metadata: {
                  placeId: business.placeId,
                  scrapedAt: new Date().toISOString(),
                  jobId,
                },
              },
            });

            console.log(`Created lead: ${lead.businessName} (Score: ${score})`);
            leadsFound++;

            // Update job progress
            await prisma.scrapingJob.update({
              where: { id: jobId },
              data: { leadsFound },
            });
          }
        } catch (error) {
          console.error(`Error searching ${category} in ${location}:`, error);
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
