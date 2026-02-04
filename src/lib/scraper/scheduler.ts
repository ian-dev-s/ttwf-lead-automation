import { JobStatus, LeadStatus } from '@prisma/client';
import { Browser, chromium } from 'playwright';
import { generatePersonalizedMessage } from '../ai/personalize';
import { SmartEnrichedLead, smartEnrichLead } from '../ai/smart-enricher';
import { SA_CITIES, TARGET_CATEGORIES } from '../constants';
import { prisma } from '../db';
import {
    JobCancelledError,
    cancelJobToken,
    createCancellationToken,
    removeCancellationToken,
    sleepWithCancellation
} from './cancellation';
import { createGoogleMapsScraper } from './google-maps';
import { clearJobLogs, initJobLogs, jobLog } from './job-logger';
import {
    getProcessStatus,
    getScraperChromeArgs,
    killAllScraperProcesses,
    processManager,
    registerBrowserPid,
    unregisterBrowserPid,
} from './process-manager';
import { checkIfGoodProspect, quickQualityCheck } from './quality-checker';

// Re-export process manager functions for external use
export {
    getProcessStatus, killAllScraperProcesses, processManager
};

// ============================================================================
// ANALYZED BUSINESS HISTORY - Check and save to avoid re-analyzing
// ============================================================================

interface AnalyzedBusinessCheck {
  wasAnalyzedBefore: boolean;
  isGoodProspect?: boolean;
  skipReason?: string;
  analyzedAt?: Date;
}

/**
 * Check if a business has been analyzed before
 */
async function checkAnalyzedHistory(
  googleMapsUrl: string | undefined,
  businessName: string,
  location: string
): Promise<AnalyzedBusinessCheck> {
  try {
    // First try to find by Google Maps URL (most reliable)
    if (googleMapsUrl) {
      const byUrl = await prisma.analyzedBusiness.findUnique({
        where: { googleMapsUrl },
      });
      if (byUrl) {
        return {
          wasAnalyzedBefore: true,
          isGoodProspect: byUrl.isGoodProspect,
          skipReason: byUrl.skipReason || undefined,
          analyzedAt: byUrl.analyzedAt,
        };
      }
    }
    
    // Fallback: try to find by name + location
    const byNameLocation = await prisma.analyzedBusiness.findFirst({
      where: {
        businessName: businessName,
        location: location,
      },
    });
    
    if (byNameLocation) {
      return {
        wasAnalyzedBefore: true,
        isGoodProspect: byNameLocation.isGoodProspect,
        skipReason: byNameLocation.skipReason || undefined,
        analyzedAt: byNameLocation.analyzedAt,
      };
    }
    
    return { wasAnalyzedBefore: false };
  } catch (error) {
    console.error('Error checking analyzed history:', error);
    return { wasAnalyzedBefore: false };
  }
}

/**
 * Save a business to the analyzed history
 */
async function saveToAnalyzedHistory(
  business: {
    name: string;
    googleMapsUrl?: string;
    address?: string;
    phone?: string;
    website?: string;
    rating?: number;
    reviewCount?: number;
    category?: string;
  },
  location: string,
  isGoodProspect: boolean,
  skipReason: string,
  websiteQuality?: number,
  leadId?: string
): Promise<void> {
  try {
    // Use upsert to handle potential duplicates
    await prisma.analyzedBusiness.upsert({
      where: {
        googleMapsUrl: business.googleMapsUrl || `manual_${business.name}_${location}`,
      },
      create: {
        businessName: business.name,
        location,
        googleMapsUrl: business.googleMapsUrl,
        phone: business.phone,
        website: business.website,
        address: business.address,
        googleRating: business.rating,
        reviewCount: business.reviewCount,
        category: business.category,
        websiteQuality,
        isGoodProspect,
        skipReason,
        wasConverted: !!leadId,
        leadId,
      },
      update: {
        websiteQuality,
        isGoodProspect,
        skipReason,
        wasConverted: !!leadId,
        leadId,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Error saving to analyzed history:', error);
  }
}

// Re-export constants for convenience
export { SA_CITIES, TARGET_CATEGORIES };

// In-memory store for job cancellation/completion signals
// Maps jobId -> { cancelled: boolean, completed: boolean, scraper: any, browser: any }
const runningJobs = new Map<string, { 
  cancelled: boolean;
  completed: boolean; // New flag to signal job should stop
  scraper: ReturnType<typeof createGoogleMapsScraper> | null;
  browser: Browser | null;
}>();

/**
 * Check if a job has been cancelled
 */
export function isJobCancelled(jobId: string): boolean {
  const job = runningJobs.get(jobId);
  return job?.cancelled ?? false;
}

/**
 * Check if a job should stop (either cancelled or completed)
 */
export function shouldJobStop(jobId: string): boolean {
  const job = runningJobs.get(jobId);
  if (!job) return true; // If not found, stop
  return job.cancelled || job.completed;
}

/**
 * Mark a job as completed (reached target)
 */
export function markJobCompleted(jobId: string): void {
  const job = runningJobs.get(jobId);
  if (job) {
    job.completed = true;
    console.log(`🎯 Job ${jobId} marked as completed - stopping all operations`);
  }
}

/**
 * Cancel a running job - signals it to stop and updates DB
 * This is aggressive and will forcefully terminate all resources
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  console.log(`🛑 CANCELLING JOB: ${jobId}`);
  
  try {
    // FIRST: Trigger cancellation token - this will abort any ongoing operations
    cancelJobToken(jobId);
    console.log(`🛑 Cancellation token triggered for job: ${jobId}`);
    
    const jobState = runningJobs.get(jobId);
    
    if (jobState) {
      // Signal cancellation IMMEDIATELY
      jobState.cancelled = true;
      jobState.completed = true; // Also mark as completed to stop all loops
      
      console.log(`🛑 Cancellation flags set for job: ${jobId}`);
      
      // Force close browser/scraper to immediately stop - try multiple times
      const closeWithRetry = async (resource: { close: () => Promise<void> } | null, name: string) => {
        if (!resource) return;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await resource.close();
            console.log(`   ✓ ${name} closed successfully`);
            return;
          } catch (e) {
            console.log(`   ⚠️ Attempt ${attempt + 1} to close ${name} failed`);
          }
        }
      };
      
      await Promise.all([
        closeWithRetry(jobState.scraper, 'Scraper'),
        closeWithRetry(jobState.browser, 'Browser'),
      ]);
    }
    
    // Update database status
    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.CANCELLED,
        completedAt: new Date(),
        error: 'Job cancelled by user',
      },
    });
    
    console.log(`🛑 Job ${jobId} database status updated to CANCELLED`);
    
    // Clean up from running jobs
    runningJobs.delete(jobId);
    
    console.log(`🛑 Job ${jobId} fully cancelled and cleaned up`);
    return true;
  } catch (error) {
    console.error(`Failed to cancel job ${jobId}:`, error);
    // Even if there's an error, try to mark as cancelled in DB
    try {
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.CANCELLED,
          completedAt: new Date(),
          error: 'Job cancelled by user (with cleanup errors)',
        },
      });
    } catch (dbError) {
      console.error(`Failed to update job status in DB:`, dbError);
    }
    runningJobs.delete(jobId);
    return false;
  }
}

/**
 * Delete a scraping job from the database
 */
export async function deleteJob(jobId: string): Promise<boolean> {
  try {
    // Make sure it's not running, cancel if it is
    const jobState = runningJobs.get(jobId);
    if (jobState) {
      await cancelJob(jobId);
    }
    
    // Delete the job from database
    await prisma.scrapingJob.delete({
      where: { id: jobId },
    });
    
    console.log(`🗑️ Deleted job: ${jobId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete job ${jobId}:`, error);
    return false;
  }
}

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

  // Create cancellation token for this job - allows immediate cancellation at any point
  const cancellationToken = createCancellationToken(jobId);
  console.log(`[Job ${jobId}] Cancellation token created`);

  // Update job status to running
  await prisma.scrapingJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  // OPTIMIZED: Reduced delays for faster scraping
  const scraper = createGoogleMapsScraper({
    headless: true,
    delayBetweenRequests: parseInt(process.env.SCRAPE_DELAY_MS || '500'),
    maxResults: job.leadsRequested,
  });
  
  // Set job ID on scraper so it can use the cancellation token
  scraper.setJobId(jobId);

  let leadsFound = 0;
  let browser: Browser | null = null;

  // Register this job as running (for cancellation/completion support)
  runningJobs.set(jobId, { cancelled: false, completed: false, scraper, browser: null });
  
  // Initialize job logging
  initJobLogs(jobId);
  clearJobLogs(jobId);

  try {
    jobLog.info(jobId, 'Initializing scraper...');
    await scraper.initialize();
    
    // Check for cancellation before starting browser
    if (shouldJobStop(jobId)) {
      console.log(`🛑 Job ${jobId} stopped before browser init`);
      jobLog.warning(jobId, 'Job stopped before browser initialization');
      return;
    }
    
    jobLog.info(jobId, 'Launching browser for AI enrichment...');
    
    // Create a separate browser for AI enrichment with identifiable args
    browser = await chromium.launch({
      headless: true,
      args: getScraperChromeArgs(),
    });
    
    // Register browser PID for tracking (handle if process() not available)
    try {
      if (typeof browser.process === 'function') {
        const browserProcess = browser.process();
        if (browserProcess?.pid) {
          registerBrowserPid(browserProcess.pid);
          console.log(`[Job ${jobId}] Browser launched with PID: ${browserProcess.pid}`);
        }
      }
    } catch (e) {
      console.log(`[Job ${jobId}] Could not get browser PID:`, e);
    }
    
    // Update the running job state with browser reference
    const jobState = runningJobs.get(jobId);
    if (jobState) {
      jobState.browser = browser;
    }

    // Get search parameters
    const categories = job.categories.length > 0 ? job.categories : TARGET_CATEGORIES;
    const locations = job.locations.length > 0 ? job.locations : SA_CITIES;
    const minRating = job.minRating || 4.0;

    console.log(`\n🔍 Starting AI-POWERED scraping job: ${jobId}`);
    console.log(`   🧠 Using AI for: Business Analysis, Data Extraction, Lead Qualification`);
    console.log(`   Target: ${job.leadsRequested} lead(s)`);
    console.log(`   Categories: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? '...' : ''}`);
    console.log(`   Locations: ${locations.slice(0, 3).join(', ')}${locations.length > 3 ? '...' : ''}\n`);
    
    jobLog.success(jobId, `🚀 Starting AI-Powered Scraping Job`, {
      target: job.leadsRequested,
      categories: categories.length,
      locations: locations.length,
      minRating,
    });
    jobLog.info(jobId, `🧠 AI Modules: Business Analysis, Data Extraction, Lead Qualification`);
    jobLog.info(jobId, `📊 Target: ${job.leadsRequested} lead(s)`);

    // Iterate through categories and locations
    categoryLoop:
    for (const category of categories) {
      // Check if we should stop (cancelled OR target reached) - use BOTH token and job state
      if (cancellationToken.isCancelled || shouldJobStop(jobId)) {
        console.log(`🛑 Job ${jobId} stopping at category loop`);
        jobLog.warning(jobId, 'Stopping job (cancelled or target reached)');
        break categoryLoop;
      }

      for (const location of locations) {
        // Check if we should stop (cancelled OR target reached) - use BOTH token and job state
        if (cancellationToken.isCancelled || shouldJobStop(jobId)) {
          console.log(`🛑 Job ${jobId} stopping at location loop`);
          jobLog.warning(jobId, 'Stopping job (cancelled or target reached)');
          break categoryLoop;
        }

        try {
          console.log(`\n📍 Searching: ${category} in ${location}`);
          jobLog.progress(jobId, `📍 Searching: ${category} in ${location}`);
          
          const businesses = await scraper.searchBusinesses({
            query: category,
            location: location,
            minRating,
            // Only get what we need - 1 at a time for thorough AI enrichment
            maxResults: Math.min(3, job.leadsRequested - leadsFound),
          });
          
          // Check IMMEDIATELY after expensive async operation - use BOTH token and job state
          if (cancellationToken.isCancelled || shouldJobStop(jobId)) {
            console.log(`🛑 Job ${jobId} cancelled during search - stopping immediately`);
            jobLog.warning(jobId, '🛑 Job cancelled during search');
            break categoryLoop;
          }
          
          // Skip processing if no businesses found or job should stop
          if (!businesses || businesses.length === 0) {
            continue;
          }
          
          jobLog.info(jobId, `Found ${businesses.length} potential businesses`);

          for (const business of businesses) {
            // CRITICAL: Check cancellation at the VERY START of each business iteration
            // This prevents processing results that came back after cancellation was triggered
            if (cancellationToken.isCancelled || shouldJobStop(jobId)) {
              console.log(`🛑 Job ${jobId} stopping - cancellation detected before processing ${business.name}`);
              jobLog.warning(jobId, '🛑 Job cancelled - stopping before processing next business');
              break categoryLoop;
            }

            jobLog.info(jobId, `Checking: ${business.name} (${business.rating}⭐)`);

            // OPTIMIZATION: Check analyzed history first (avoids re-analyzing)
            const historyCheck = await checkAnalyzedHistory(
              business.googleMapsUrl,
              business.name,
              location
            );
            
            // Check for cancellation after DB lookup - use BOTH token and job state
            if (cancellationToken.isCancelled || shouldJobStop(jobId)) {
              console.log(`🛑 Job ${jobId} cancelled - stopping`);
              break categoryLoop;
            }
            
            if (historyCheck.wasAnalyzedBefore) {
              if (!historyCheck.isGoodProspect) {
                console.log(`   ⏭️  Skipping (history): ${business.name} - ${historyCheck.skipReason}`);
                jobLog.info(jobId, `⏭️ Skipping (from history): ${business.name} - ${historyCheck.skipReason}`);
                continue;
              }
              // Was a good prospect before - check if already converted to lead
              const existingLead = await prisma.lead.findFirst({
                where: {
                  OR: [
                    { googleMapsUrl: business.googleMapsUrl },
                    { businessName: business.name, location: location },
                  ],
                },
              });
              if (existingLead) {
                console.log(`   ⏭️  Skipping (history): ${business.name} - Already a lead`);
                jobLog.info(jobId, `⏭️ Skipping (from history): ${business.name} - Already a lead`);
                continue;
              }
              // Good prospect not yet converted - continue to enrich
              jobLog.info(jobId, `✅ Previously analyzed as good prospect: ${business.name}`);
            }

            // Check if this business already exists as a lead
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
              jobLog.info(jobId, `⏭️ Skipping (already exists): ${business.name}`);
              continue;
            }

            // QUALITY CHECK: Determine if this is a good prospect
            // Step 1: Quick URL pattern check (no API call)
            const quickCheck = quickQualityCheck(business.website);
            
            let websiteQualityScore: number | undefined;
            let isGoodProspect = quickCheck.isLikelyGoodProspect;
            let skipReason = '';
            
            if (!quickCheck.isLikelyGoodProspect && business.website) {
              // Step 2: Has proper domain - do full PageSpeed API analysis
              console.log(`   🔍 Checking website quality for: ${business.name}`);
              jobLog.progress(jobId, `🔍 Analyzing website quality: ${business.website}`);
              
              // Pass cancellation token for immediate cancellation support
              const prospectCheck = await checkIfGoodProspect(business.website, 1, cancellationToken);
              
              // Check IMMEDIATELY after expensive API call (redundant but safe)
              if (cancellationToken.isCancelled || shouldJobStop(jobId)) {
                console.log(`🛑 Job ${jobId} cancelled during quality check - stopping`);
                jobLog.warning(jobId, '🛑 Job cancelled during quality check');
                break categoryLoop;
              }
              
              isGoodProspect = prospectCheck.isGoodProspect;
              websiteQualityScore = prospectCheck.qualityScore;
              
              if (!isGoodProspect) {
                skipReason = `Has quality website (${websiteQualityScore}/100)`;
                console.log(`   ⏭️  Skipping ${business.name} - ${skipReason}`);
                jobLog.info(jobId, `⏭️ Skipping ${business.name} - ${skipReason}`);
                
                // Save to history so we don't re-analyze next time
                await saveToAnalyzedHistory(
                  business,
                  location,
                  false,
                  skipReason,
                  websiteQualityScore
                );
                
                continue;
              }
              skipReason = `Website needs improvement (${websiteQualityScore}/100)`;
              jobLog.success(jobId, `✅ ${skipReason} - Good prospect!`);
            } else {
              websiteQualityScore = quickCheck.estimatedScore;
              skipReason = quickCheck.reason;
              console.log(`   ✅ ${business.name} - ${quickCheck.reason} (score: ${quickCheck.estimatedScore})`);
              jobLog.success(jobId, `✅ ${business.name} - ${quickCheck.reason} (score: ${quickCheck.estimatedScore})`);
            }

            console.log(`\n   🧠 AI Enrichment starting for: ${business.name}`);
            jobLog.progress(jobId, `🧠 Starting AI Enrichment for: ${business.name}`);

            try {
              // Use AI-powered smart enrichment with cancellation support
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
                1, // workerId
                cancellationToken // Pass cancellation token for immediate stopping
              );

              // Check IMMEDIATELY after expensive AI enrichment (redundant but safe)
              if (cancellationToken.isCancelled || shouldJobStop(jobId)) {
                console.log(`🛑 Job ${jobId} cancelled during AI enrichment - stopping`);
                jobLog.warning(jobId, '🛑 Job cancelled during AI enrichment');
                break categoryLoop;
              }

              // Override website quality with PageSpeed score if we have it
              if (websiteQualityScore !== undefined) {
                enrichedLead.websiteQualityScore = websiteQualityScore;
              }

              // Check if lead is qualified
              if (!enrichedLead.isQualified && enrichedLead.qualificationTier === 'D') {
                console.log(`   ⏭️  AI determined ${business.name} is not a good prospect (Tier D)`);
                jobLog.info(jobId, `⏭️ AI determined ${business.name} is not a good prospect (Tier D)`);
                
                // Save to history as not good prospect
                await saveToAnalyzedHistory(
                  business,
                  location,
                  false,
                  `AI disqualified (Tier D, Score: ${enrichedLead.leadScore})`,
                  websiteQualityScore
                );
                
                continue;
              }

              jobLog.progress(jobId, `💾 Saving lead: ${business.name}`);
              
              // Save the AI-enriched lead
              const saved = await saveSmartEnrichedLead(enrichedLead);

              if (saved) {
                // Save to history as converted lead
                await saveToAnalyzedHistory(
                  business,
                  location,
                  true,
                  `Converted to lead (Tier ${enrichedLead.qualificationTier}, Score: ${enrichedLead.leadScore})`,
                  websiteQualityScore,
                  enrichedLead.googleMapsUrl // This will be used as reference
                );
                leadsFound++;
                console.log(`   ✅ Saved AI-enriched lead: ${business.name}`);
                console.log(`      📊 Score: ${enrichedLead.leadScore}/100 | Tier: ${enrichedLead.qualificationTier}`);
                console.log(`      📞 Contacts: ${enrichedLead.phones.length} phones, ${enrichedLead.emails.length} emails`);
                console.log(`      🎯 Action: ${enrichedLead.recommendedAction} via ${enrichedLead.recommendedChannel}`);
                
                jobLog.success(jobId, `🎉 LEAD SAVED: ${business.name}`, {
                  score: enrichedLead.leadScore,
                  tier: enrichedLead.qualificationTier,
                  phones: enrichedLead.phones.length,
                  emails: enrichedLead.emails.length,
                });
                jobLog.info(jobId, `📊 Score: ${enrichedLead.leadScore}/100 | Tier: ${enrichedLead.qualificationTier}`);
                jobLog.info(jobId, `📞 Contacts: ${enrichedLead.phones.length} phones, ${enrichedLead.emails.length} emails`);
                jobLog.info(jobId, `🎯 Recommended: ${enrichedLead.recommendedAction} via ${enrichedLead.recommendedChannel}`);
                jobLog.progress(jobId, `📈 Progress: ${leadsFound}/${job.leadsRequested} leads found`);

                // Update job progress
                await prisma.scrapingJob.update({
                  where: { id: jobId },
                  data: { leadsFound },
                });

                // If we've reached our target, STOP IMMEDIATELY
                if (leadsFound >= job.leadsRequested) {
                  console.log(`\n🎯 TARGET REACHED (${leadsFound}/${job.leadsRequested})! STOPPING ALL OPERATIONS.`);
                  jobLog.success(jobId, `🎯 TARGET REACHED! Found ${leadsFound}/${job.leadsRequested} leads. Stopping.`);
                  markJobCompleted(jobId); // Mark as completed to stop all loops
                  break categoryLoop; // Break out of ALL loops immediately
                }
              }
            } catch (enrichError) {
              // Check if it's a cancellation - break immediately
              if (enrichError instanceof JobCancelledError || cancellationToken.isCancelled) {
                console.log(`🛑 Job ${jobId} cancelled during AI enrichment - stopping immediately`);
                jobLog.warning(jobId, '🛑 Job cancelled during AI enrichment');
                break categoryLoop;
              }
              
              console.error(`   ⚠️  AI enrichment failed for ${business.name}:`, enrichError);
              jobLog.error(jobId, `⚠️ AI enrichment failed for ${business.name}: ${enrichError instanceof Error ? enrichError.message : 'Unknown error'}`);
              // Continue to next business
            }

            // OPTIMIZED: Reduced delay between leads (was 3000ms) with cancellation support
            try {
              await sleepWithCancellation(1000, cancellationToken);
            } catch (sleepError) {
              if (sleepError instanceof JobCancelledError || cancellationToken.isCancelled) {
                console.log(`🛑 Job ${jobId} cancelled during delay - stopping immediately`);
                break categoryLoop;
              }
            }
          }
        } catch (error) {
          // Check for cancellation errors first
          if (error instanceof JobCancelledError || cancellationToken.isCancelled) {
            console.log(`🛑 Job ${jobId} cancelled - stopping immediately`);
            jobLog.warning(jobId, '🛑 Job cancelled - stopping immediately');
            break categoryLoop;
          }
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // If browser was closed (cancelled), break out immediately
          if (errorMessage === 'BROWSER_CLOSED' || shouldJobStop(jobId)) {
            console.log(`🛑 Job ${jobId} stopping - browser closed or cancelled`);
            jobLog.warning(jobId, '🛑 Stopping job - browser closed or cancelled');
            break categoryLoop;
          }
          
          console.error(`   ❌ Error searching ${category} in ${location}:`, errorMessage);
          jobLog.error(jobId, `❌ Error searching ${category} in ${location}: ${errorMessage}`);
        }
      }
    }

    // Mark job as completed in database (unless it was cancelled by user)
    if (!isJobCancelled(jobId)) {
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          leadsFound,
        },
      });

      console.log(`\n✅ AI-Powered Job completed! Found ${leadsFound}/${job.leadsRequested} qualified lead(s)`);
      jobLog.success(jobId, `✅ Job completed! Found ${leadsFound}/${job.leadsRequested} qualified lead(s)`);
    } else {
      console.log(`\n🛑 Job ${jobId} was CANCELLED by user. Found ${leadsFound} leads before cancellation.`);
      jobLog.warning(jobId, `🛑 Job was CANCELLED by user. Found ${leadsFound} leads before cancellation.`);
    }

  } catch (error) {
    // Handle cancellation errors gracefully
    if (error instanceof JobCancelledError || cancellationToken.isCancelled) {
      console.log(`🛑 Job ${jobId} cancelled gracefully`);
      jobLog.warning(jobId, '🛑 Job cancelled gracefully');
      // Don't update DB - cancelJob already set status to CANCELLED
    } else if (!isJobCancelled(jobId)) {
      // Don't update status if job was cancelled (already handled)
      console.error(`Job ${jobId} failed:`, error);
      jobLog.error(jobId, `❌ Job failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  } finally {
    // Clean up resources
    jobLog.info(jobId, '🧹 Cleaning up resources...');
    
    // Remove cancellation token
    removeCancellationToken(jobId);
    console.log(`[Job ${jobId}] Cancellation token removed`);
    
    try {
      await scraper.close();
    } catch (e) {
      // Ignore close errors
    }
    if (browser) {
      // Unregister browser PID before closing (handle if process() not available)
      try {
        if (typeof browser.process === 'function') {
          const browserProcess = browser.process();
          if (browserProcess?.pid) {
            unregisterBrowserPid(browserProcess.pid);
          }
        }
      } catch (e) {
        console.log(`[Job ${jobId}] Could not get browser PID for unregistration:`, e);
      }
      try {
        await browser.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    
    // Remove from running jobs registry
    runningJobs.delete(jobId);
    console.log(`🏁 Job ${jobId} cleanup complete`);
    jobLog.info(jobId, '🏁 Job cleanup complete');
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
