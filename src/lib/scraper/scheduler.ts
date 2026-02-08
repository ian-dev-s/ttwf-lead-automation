import { JobStatus, LeadStatus } from '@prisma/client';
import { Browser, chromium } from 'playwright';
import { generatePersonalizedMessage } from '../ai/personalize';
import { SmartEnrichedLead, smartEnrichLead } from '../ai/smart-enricher';
import {
    DEFAULT_COUNTRY_CODE,
    getCitiesForCountry,
    getCountryConfig,
    SA_CITIES,
    SUPPORTED_COUNTRIES,
    TARGET_CATEGORIES
} from '../constants';
import { prisma } from '../db';
import {
    cancelJobToken,
    createCancellationToken,
    JobCancelledError,
    removeCancellationToken,
    sleepWithCancellation
} from './cancellation';
import { createGoogleMapsScraper } from './google-maps';
import { clearJobLogs, initJobLogs, jobLog } from './job-logger';
import {
    clearJobPids,
    findAndKillJobProcesses,
    getJobProcessInfo,
    getProcessStatus,
    getScraperChromeArgs,
    killAllScraperProcesses,
    killJobProcesses,
    processManager,
    TrackedProcessInfo
} from './process-manager';
import { checkIfGoodProspect, quickQualityCheck } from './quality-checker';

// Re-export process manager functions for external use
export {
    getProcessStatus, killAllScraperProcesses, processManager
};

// ============================================================================
// PROCESS PID PERSISTENCE - Save and restore PIDs to/from database
// ============================================================================

/**
 * Persist process PIDs to the database for a job
 * This allows recovery after server restart
 */
async function persistJobProcessPids(jobId: string): Promise<void> {
  try {
    const processInfo = getJobProcessInfo(jobId);
    if (processInfo.length === 0) return;
    
    // Use type assertion to bypass stale TypeScript cache
    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        processPids: JSON.stringify(processInfo),
      } as Record<string, unknown>,
    });
    console.log(`[Job ${jobId}] Persisted ${processInfo.length} process PIDs to database`);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed to persist process PIDs:`, error);
  }
}

/**
 * Clear persisted process PIDs from the database for a job
 */
async function clearPersistedProcessPids(jobId: string): Promise<void> {
  try {
    // Use type assertion to bypass stale TypeScript cache
    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        processPids: null,
      } as Record<string, unknown>,
    });
    console.log(`[Job ${jobId}] Cleared persisted process PIDs from database`);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed to clear persisted process PIDs:`, error);
  }
}

/**
 * Get persisted process PIDs for a job (without restoring tracking)
 */
export async function getPersistedProcessPids(jobId: string): Promise<TrackedProcessInfo[]> {
  try {
    const job = await prisma.scrapingJob.findUnique({
      where: { id: jobId },
    });
    
    // Use type assertion to access processPids
    const processPids = (job as Record<string, unknown> | null)?.processPids as string | null;
    if (!processPids) return [];
    return JSON.parse(processPids);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed to get persisted process PIDs:`, error);
    return [];
  }
}

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
  location: string,
  country: string = DEFAULT_COUNTRY_CODE
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
    
    // Fallback: try to find by name + location + country
    const byNameLocation = await prisma.analyzedBusiness.findFirst({
      where: {
        businessName: businessName,
        location: location,
        country: country,
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
  teamId: string,
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
  country: string,
  isGoodProspect: boolean,
  skipReason: string,
  websiteQuality?: number,
  leadId?: string
): Promise<void> {
  try {
    // Use upsert to handle potential duplicates
    await prisma.analyzedBusiness.upsert({
      where: {
        googleMapsUrl: business.googleMapsUrl || `manual_${business.name}_${location}_${country}`,
      },
      create: {
        teamId,
        businessName: business.name,
        location,
        country,
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
export { DEFAULT_COUNTRY_CODE, SA_CITIES, SUPPORTED_COUNTRIES, TARGET_CATEGORIES };

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
    // STEP 1: Trigger cancellation token - this will abort any ongoing operations
    console.log(`🛑 [Step 1] Triggering cancellation token for job: ${jobId}`);
    cancelJobToken(jobId);
    
    // STEP 2: Signal in-memory job state if it exists
    const jobState = runningJobs.get(jobId);
    if (jobState) {
      jobState.cancelled = true;
      jobState.completed = true;
      console.log(`🛑 [Step 2] In-memory cancellation flags set`);
      
      // Try graceful close (non-blocking, best effort)
      if (jobState.scraper) {
        jobState.scraper.close().catch(() => {});
      }
      if (jobState.browser) {
        jobState.browser.close().catch(() => {});
      }
    } else {
      console.log(`🛑 [Step 2] Job not in memory (may have been restarted)`);
    }
    
    // STEP 3: CRITICAL - Find and kill ALL Chrome processes with this job's ID
    // This is the most reliable method - searches ALL running Chrome processes
    // for ones that have --job-id=<jobId> in their command line
    console.log(`🛑 [Step 3] Finding and killing all processes for job ${jobId}...`);
    const killResult = await findAndKillJobProcesses(jobId);
    console.log(`🛑 [Step 3] Process cleanup: found=${killResult.found}, killed=${killResult.killed}, failed=${killResult.failed}`);
    
    // STEP 4: Get current job state for final update
    const currentJob = await prisma.scrapingJob.findUnique({
      where: { id: jobId },
      select: { leadsFound: true },
    });
    
    // STEP 5: Update database status to COMPLETED
    await prisma.scrapingJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        error: 'Job cancelled by user',
        leadsFound: currentJob?.leadsFound ?? 0,
        processPids: null, // Clear any persisted PIDs
      } as Record<string, unknown>,
    });
    console.log(`🛑 [Step 5] Database status updated to COMPLETED`);
    
    // STEP 6: Cleanup
    runningJobs.delete(jobId);
    removeCancellationToken(jobId);
    clearJobPids(jobId);
    
    console.log(`🛑 Job ${jobId} cancellation complete: ${killResult.killed} processes killed`);
    return true;
    
  } catch (error) {
    console.error(`🛑 [ERROR] Failed to cancel job ${jobId}:`, error);
    
    // Even on error, try to mark as completed and kill processes
    try {
      // Still try to kill processes - this is critical
      await findAndKillJobProcesses(jobId);
      
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          error: 'Job cancelled by user (with cleanup errors)',
          processPids: null,
        } as Record<string, unknown>,
      });
      console.log(`🛑 [ERROR RECOVERY] Job marked as COMPLETED`);
      
      runningJobs.delete(jobId);
      removeCancellationToken(jobId);
      clearJobPids(jobId);
      return true;
    } catch (dbError) {
      console.error(`🛑 [ERROR RECOVERY] Failed:`, dbError);
      runningJobs.delete(jobId);
      removeCancellationToken(jobId);
      clearJobPids(jobId);
      return false;
    }
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
    } else {
      // Job not in memory - still kill any processes with this job's ID
      const killResult = await findAndKillJobProcesses(jobId);
      if (killResult.killed > 0) {
        console.log(`🗑️ Job ${jobId} pre-delete cleanup: killed ${killResult.killed} processes`);
      }
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
 * Save an AI-enriched lead to the database and auto-generate email message
 */
async function saveSmartEnrichedLead(lead: SmartEnrichedLead, teamId: string, countryCode: string = DEFAULT_COUNTRY_CODE): Promise<boolean> {
  try {
    // Check if lead already exists (team-scoped)
    const existing = await prisma.lead.findFirst({
      where: {
        teamId,
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

    // Calculate final score
    const score = lead.leadScore;

    // Create the lead with country and teamId
    const newLead = await prisma.lead.create({
      data: {
        teamId,
        businessName: lead.businessName,
        industry: lead.industry,
        location: lead.location,
        country: countryCode,
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
        status: LeadStatus.NEW,
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

    // Auto-generate email message for the new lead
    try {
      console.log(`   📧 Auto-generating email for: ${lead.businessName}`);
      const emailMessage = await generatePersonalizedMessage({
        teamId,
        lead: newLead,
      });

      await prisma.message.create({
        data: {
          teamId,
          leadId: newLead.id,
          type: 'EMAIL',
          subject: emailMessage.subject,
          content: emailMessage.content,
          status: 'DRAFT',
          generatedBy: 'ai',
          aiProvider: emailMessage.provider,
          aiModel: emailMessage.model,
        },
      });

      // Now that email is generated, update status based on qualification tier
      const newStatus = lead.qualificationTier === 'A' ? LeadStatus.QUALIFIED : LeadStatus.MESSAGE_READY;
      await prisma.lead.update({
        where: { id: newLead.id },
        data: { status: newStatus },
      });
      
      console.log(`   ✅ Email generated, status updated to: ${newStatus}`);
    } catch (emailError) {
      console.error(`   ⚠️ Failed to auto-generate email for ${lead.businessName}:`, emailError);
      // Lead is still saved, just without email - stays as NEW
    }

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

  // Get teamId from the job
  const teamId = job.teamId;

  // Read scrape delay from team settings (fallback to 500ms)
  const teamSettings = await prisma.teamSettings.findUnique({
    where: { teamId },
    select: { scrapeDelayMs: true },
  });
  const scrapeDelay = teamSettings?.scrapeDelayMs || 500;

  // OPTIMIZED: Reduced delays for faster scraping
  const scraper = createGoogleMapsScraper({
    headless: true,
    delayBetweenRequests: scrapeDelay,
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
    
    // Create a separate browser for AI enrichment with JOB-SPECIFIC identifiable args
    // The --job-id=<jobId> arg allows us to find this browser even after server restart
    const chromeArgs = getScraperChromeArgs(jobId);
    console.log(`[Job ${jobId}] Launching browser with args: ${chromeArgs.slice(-3).join(' ')}`);
    
    browser = await chromium.launch({
      headless: true,
      args: chromeArgs,
    });
    
    // Wait a moment for Chrome processes to spawn, then register them
    // This is more reliable than trying to get PID from browser.process()
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Find and register all Chrome processes with our job ID
    const { registerJobProcesses } = await import('./process-manager');
    const registeredCount = await registerJobProcesses(jobId);
    console.log(`[Job ${jobId}] Registered ${registeredCount} Chrome processes`);
    
    // Persist to database for crash recovery
    await persistJobProcessPids(jobId);
    
    // Update the running job state with browser reference
    const jobState = runningJobs.get(jobId);
    if (jobState) {
      jobState.browser = browser;
    }

    // Get search parameters with country support
    const countryCode = (job as Record<string, unknown>).country as string || DEFAULT_COUNTRY_CODE;
    const countryConfig = getCountryConfig(countryCode);
    const countryName = countryConfig?.name || 'South Africa';
    
    const categories = job.categories.length > 0 ? job.categories : TARGET_CATEGORIES;
    // Use country-specific cities if no locations specified
    const defaultCities = getCitiesForCountry(countryCode);
    const locations = job.locations.length > 0 ? job.locations : (defaultCities.length > 0 ? defaultCities : SA_CITIES);
    const minRating = job.minRating || 4.0;
    
    // Set country on scraper for proper browser context
    scraper.setCountry(countryCode);

    console.log(`\n🔍 Starting AI-POWERED scraping job: ${jobId}`);
    console.log(`   🧠 Using AI for: Business Analysis, Data Extraction, Lead Qualification`);
    console.log(`   🌍 Country: ${countryName} (${countryCode})`);
    console.log(`   Target: ${job.leadsRequested} lead(s)`);
    console.log(`   Categories: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? '...' : ''}`);
    console.log(`   Locations: ${locations.slice(0, 3).join(', ')}${locations.length > 3 ? '...' : ''}\n`);
    
    jobLog.success(jobId, `🚀 Starting AI-Powered Scraping Job`, {
      target: job.leadsRequested,
      country: countryName,
      categories: categories.length,
      locations: locations.length,
      minRating,
    });
    jobLog.info(jobId, `🧠 AI Modules: Business Analysis, Data Extraction, Lead Qualification`);
    jobLog.info(jobId, `🌍 Country: ${countryName} (${countryCode})`);
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
            country: countryCode,
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
              location,
              countryCode
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
              // Was a good prospect before - check if already converted to lead (team-scoped)
              const existingLead = await prisma.lead.findFirst({
                where: {
                  teamId,
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

            // Check if this business already exists as a lead (team-scoped)
            const existingLead2 = await prisma.lead.findFirst({
              where: {
                teamId,
                OR: [
                  { googleMapsUrl: business.googleMapsUrl },
                  {
                    businessName: business.name,
                    location: location,
                  },
                ],
              },
            });

            if (existingLead2) {
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
                  teamId,
                  business,
                  location,
                  countryCode,
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
                teamId,
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
                  teamId,
                  business,
                  location,
                  countryCode,
                  false,
                  `AI disqualified (Tier D, Score: ${enrichedLead.leadScore})`,
                  websiteQualityScore
                );
                
                continue;
              }

              jobLog.progress(jobId, `💾 Saving lead: ${business.name}`);
              
              // Save the AI-enriched lead with country and teamId
              const saved = await saveSmartEnrichedLead(enrichedLead, teamId, countryCode);

              if (saved) {
                // Save to history as converted lead
                await saveToAnalyzedHistory(
                  teamId,
                  business,
                  location,
                  countryCode,
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
    // Check BOTH isJobCancelled AND cancellationToken since cancelJob might have run
    const wasCancelled = isJobCancelled(jobId) || cancellationToken.isCancelled;
    if (!wasCancelled) {
      // Double-check the current status in DB to avoid race conditions
      const currentJob = await prisma.scrapingJob.findUnique({
        where: { id: jobId },
        select: { status: true, completedAt: true },
      });
      
      // Only update to COMPLETED if still RUNNING (not already completed by cancelJob)
      if (currentJob && currentJob.status === JobStatus.RUNNING) {
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
        // Job was already completed (likely by cancelJob)
        console.log(`\n🛑 Job ${jobId} status is already ${currentJob?.status} - not updating`);
        jobLog.warning(jobId, `🛑 Job already ${currentJob?.status} - skipping update`);
      }
    } else {
      // Job was cancelled - cancelJob already set status to COMPLETED
      console.log(`\n🛑 Job ${jobId} was cancelled by user. Found ${leadsFound} leads before cancellation.`);
      jobLog.warning(jobId, `🛑 Job cancelled by user. Found ${leadsFound} leads before cancellation.`);
    }

  } catch (error) {
    // Handle cancellation errors gracefully
    if (error instanceof JobCancelledError || cancellationToken.isCancelled) {
      console.log(`🛑 Job ${jobId} cancelled gracefully`);
      jobLog.warning(jobId, '🛑 Job cancelled gracefully');
      // Don't update DB - cancelJob already set status to COMPLETED
    } else if (!isJobCancelled(jobId) && !cancellationToken.isCancelled) {
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
    } else {
      // Job was cancelled - don't update DB, cancelJob already did it
      console.log(`🛑 Job ${jobId} was cancelled - skipping status update in error handler`);
    }
  } finally {
    // Clean up resources
    jobLog.info(jobId, '🧹 Cleaning up resources...');
    
    // Remove cancellation token
    removeCancellationToken(jobId);
    console.log(`[Job ${jobId}] Cancellation token removed`);
    
    // First, try graceful close
    try {
      await scraper.close();
    } catch {
      // Ignore close errors
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
    }
    
    // SAFE KILL: Use killJobProcesses which validates each process before killing
    // This ensures we don't accidentally kill processes from other applications
    const killResult = await killJobProcesses(jobId);
    if (killResult.killed > 0 || killResult.refused > 0 || killResult.notFound > 0) {
      console.log(`[Job ${jobId}] Process cleanup: killed=${killResult.killed}, refused=${killResult.refused}, notFound=${killResult.notFound}`);
    }
    
    // Clear persisted PIDs from database
    await clearPersistedProcessPids(jobId);
    
    // Remove from running jobs registry
    runningJobs.delete(jobId);
    console.log(`🏁 Job ${jobId} cleanup complete`);
    jobLog.info(jobId, '🏁 Job cleanup complete');
  }
}

// Schedule a new scraping job (team-scoped)
export async function scheduleScrapingJob(options: {
  teamId: string;
  leadsRequested: number;
  categories?: string[];
  locations?: string[];
  country?: string;
  minRating?: number;
  scheduledFor?: Date;
}): Promise<string> {
  const job = await prisma.scrapingJob.create({
    data: {
      teamId: options.teamId,
      leadsRequested: options.leadsRequested,
      categories: options.categories || [],
      locations: options.locations || [],
      country: options.country || DEFAULT_COUNTRY_CODE,
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

// Generate messages for new leads (team-scoped)
export async function generateMessagesForNewLeads(teamId: string): Promise<number> {
  const settings = await prisma.teamSettings.findUnique({
    where: { teamId },
  });

  if (!settings?.autoGenerateMessages) {
    return 0;
  }

  const newLeads = await prisma.lead.findMany({
    where: {
      teamId,
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
      // Generate email message if email available
      if (lead.email) {
        const emailMessage = await generatePersonalizedMessage({
          teamId,
          lead,
        });

        await prisma.message.create({
          data: {
            teamId,
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
