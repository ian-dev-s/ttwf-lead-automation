import type { Lead, OutreachType } from '@/types';
import { Browser, chromium } from 'playwright';
import { generatePersonalizedMessage } from '../ai/personalize';
import { SmartEnrichedLead, smartEnrichLead } from '../ai/smart-enricher';
import { determineOutreachType } from '../utils';
import {
    DEFAULT_COUNTRY_CODE,
    getCitiesForCountry,
    getCountryConfig,
    SA_CITIES,
    SUPPORTED_COUNTRIES,
    TARGET_CATEGORIES
} from '../constants';
import {
    scrapingJobDoc,
    scrapingJobsCollection,
    leadsCollection,
    leadDoc,
    messagesCollection,
    analyzedBusinessesCollection,
    teamSettingsDoc,
} from '../firebase/collections';
import { adminDb } from '../firebase/admin';
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
// PROCESS PID PERSISTENCE - Save and restore PIDs to/from Firestore
// ============================================================================

/**
 * Persist process PIDs to Firestore for a job
 */
async function persistJobProcessPids(teamId: string, jobId: string): Promise<void> {
  try {
    const processInfo = getJobProcessInfo(jobId);
    if (processInfo.length === 0) return;

    await scrapingJobDoc(teamId, jobId).update({
      processPids: JSON.stringify(processInfo),
    });
    console.log(`[Job ${jobId}] Persisted ${processInfo.length} process PIDs to Firestore`);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed to persist process PIDs:`, error);
  }
}

/**
 * Clear persisted process PIDs from Firestore for a job
 */
async function clearPersistedProcessPids(teamId: string, jobId: string): Promise<void> {
  try {
    await scrapingJobDoc(teamId, jobId).update({
      processPids: null,
    });
    console.log(`[Job ${jobId}] Cleared persisted process PIDs from Firestore`);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed to clear persisted process PIDs:`, error);
  }
}

/**
 * Get persisted process PIDs for a job
 */
export async function getPersistedProcessPids(teamId: string, jobId: string): Promise<TrackedProcessInfo[]> {
  try {
    const jobSnap = await scrapingJobDoc(teamId, jobId).get();
    if (!jobSnap.exists) return [];
    const data = jobSnap.data()!;
    const processPids = data.processPids as string | null;
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
  teamId: string,
  googleMapsUrl: string | undefined,
  businessName: string,
  location: string,
  country: string = DEFAULT_COUNTRY_CODE
): Promise<AnalyzedBusinessCheck> {
  try {
    // Try to find by Google Maps URL (most reliable)
    if (googleMapsUrl) {
      const byUrlSnap = await analyzedBusinessesCollection(teamId)
        .where('googleMapsUrl', '==', googleMapsUrl)
        .limit(1)
        .get();

      if (!byUrlSnap.empty) {
        const data = byUrlSnap.docs[0].data();
        return {
          wasAnalyzedBefore: true,
          isGoodProspect: data.isGoodProspect,
          skipReason: data.skipReason || undefined,
          analyzedAt: data.analyzedAt instanceof Date ? data.analyzedAt : new Date(data.analyzedAt as any),
        };
      }
    }

    // Fallback: try to find by name + location + country
    const byNameSnap = await analyzedBusinessesCollection(teamId)
      .where('businessName', '==', businessName)
      .where('location', '==', location)
      .where('country', '==', country)
      .limit(1)
      .get();

    if (!byNameSnap.empty) {
      const data = byNameSnap.docs[0].data();
      return {
        wasAnalyzedBefore: true,
        isGoodProspect: data.isGoodProspect,
        skipReason: data.skipReason || undefined,
        analyzedAt: data.analyzedAt instanceof Date ? data.analyzedAt : new Date(data.analyzedAt as any),
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
    const now = new Date();

    // Check if already exists by googleMapsUrl
    if (business.googleMapsUrl) {
      const existingSnap = await analyzedBusinessesCollection(teamId)
        .where('googleMapsUrl', '==', business.googleMapsUrl)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        // Update existing
        await existingSnap.docs[0].ref.update({
          websiteQuality: websiteQuality ?? null,
          isGoodProspect,
          skipReason,
          wasConverted: !!leadId,
          leadId: leadId || null,
          updatedAt: now,
        });
        return;
      }
    }

    // Create new
    await analyzedBusinessesCollection(teamId).doc().set({
      businessName: business.name,
      location,
      country,
      googleMapsUrl: business.googleMapsUrl || null,
      phone: business.phone || null,
      website: business.website || null,
      address: business.address || null,
      googleRating: business.rating || null,
      reviewCount: business.reviewCount || null,
      category: business.category || null,
      websiteQuality: websiteQuality ?? null,
      isGoodProspect,
      skipReason,
      wasConverted: !!leadId,
      leadId: leadId || null,
      analyzedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('Error saving to analyzed history:', error);
  }
}

// Re-export constants for convenience
export { DEFAULT_COUNTRY_CODE, SA_CITIES, SUPPORTED_COUNTRIES, TARGET_CATEGORIES };

// In-memory store for job cancellation/completion signals
const runningJobs = new Map<string, {
  cancelled: boolean;
  completed: boolean;
  scraper: ReturnType<typeof createGoogleMapsScraper> | null;
  browser: Browser | null;
  teamId: string;
}>();

export function isJobCancelled(jobId: string): boolean {
  const job = runningJobs.get(jobId);
  return job?.cancelled ?? false;
}

export function shouldJobStop(jobId: string): boolean {
  const job = runningJobs.get(jobId);
  if (!job) return true;
  return job.cancelled || job.completed;
}

export function markJobCompleted(jobId: string): void {
  const job = runningJobs.get(jobId);
  if (job) {
    job.completed = true;
    console.log(`Target reached for job ${jobId} - stopping`);
  }
}

/**
 * Cancel a running job
 */
export async function cancelJob(teamId: string, jobId: string): Promise<boolean> {
  console.log(`Cancelling job: ${jobId}`);

  try {
    cancelJobToken(jobId);

    const jobState = runningJobs.get(jobId);
    if (jobState) {
      jobState.cancelled = true;
      jobState.completed = true;
      if (jobState.scraper) jobState.scraper.close().catch(() => {});
      if (jobState.browser) jobState.browser.close().catch(() => {});
    }

    const killResult = await findAndKillJobProcesses(jobId);
    console.log(`Process cleanup for ${jobId}: found=${killResult.found}, killed=${killResult.killed}`);

    const currentSnap = await scrapingJobDoc(teamId, jobId).get();
    const currentData = currentSnap.exists ? currentSnap.data()! : null;

    await scrapingJobDoc(teamId, jobId).update({
      status: 'COMPLETED',
      completedAt: new Date(),
      error: 'Job cancelled by user',
      leadsFound: (currentData?.leadsFound as number) || 0,
      processPids: null,
    });

    runningJobs.delete(jobId);
    removeCancellationToken(jobId);
    clearJobPids(jobId);

    return true;
  } catch (error) {
    console.error(`Failed to cancel job ${jobId}:`, error);

    try {
      await findAndKillJobProcesses(jobId);
      await scrapingJobDoc(teamId, jobId).update({
        status: 'COMPLETED',
        completedAt: new Date(),
        error: 'Job cancelled by user (with cleanup errors)',
        processPids: null,
      });
      runningJobs.delete(jobId);
      removeCancellationToken(jobId);
      clearJobPids(jobId);
      return true;
    } catch {
      runningJobs.delete(jobId);
      removeCancellationToken(jobId);
      clearJobPids(jobId);
      return false;
    }
  }
}

/**
 * Delete a scraping job
 */
export async function deleteJob(teamId: string, jobId: string): Promise<boolean> {
  try {
    const jobState = runningJobs.get(jobId);
    if (jobState) {
      await cancelJob(teamId, jobId);
    } else {
      const killResult = await findAndKillJobProcesses(jobId);
      if (killResult.killed > 0) {
        console.log(`Pre-delete cleanup for ${jobId}: killed ${killResult.killed} processes`);
      }
    }

    await scrapingJobDoc(teamId, jobId).delete();
    console.log(`Deleted job: ${jobId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete job ${jobId}:`, error);
    return false;
  }
}

/**
 * Save an AI-enriched lead to Firestore and auto-generate email message
 */
async function saveSmartEnrichedLead(lead: SmartEnrichedLead, teamId: string, countryCode: string = DEFAULT_COUNTRY_CODE): Promise<boolean> {
  try {
    // Check if lead already exists (by googleMapsUrl or businessName+location)
    if (lead.googleMapsUrl) {
      const byUrlSnap = await leadsCollection(teamId)
        .where('googleMapsUrl', '==', lead.googleMapsUrl)
        .limit(1)
        .get();
      if (!byUrlSnap.empty) {
        console.log(`   Lead already exists: ${lead.businessName}`);
        return false;
      }
    }

    const byNameSnap = await leadsCollection(teamId)
      .where('businessName', '==', lead.businessName)
      .where('location', '==', lead.location)
      .limit(1)
      .get();
    if (!byNameSnap.empty) {
      console.log(`   Lead already exists: ${lead.businessName}`);
      return false;
    }

    const score = lead.leadScore;
    const now = new Date();

    const leadDocRef = leadsCollection(teamId).doc();
    const leadData = {
      businessName: lead.businessName,
      businessNameLower: lead.businessName.toLowerCase(),
      industry: lead.industry || null,
      location: lead.location,
      locationLower: lead.location.toLowerCase(),
      country: countryCode,
      address: lead.address || null,
      phone: lead.phones[0] || null,
      email: lead.emails[0] || null,
      facebookUrl: lead.facebookUrl || null,
      instagramUrl: lead.instagramUrl || null,
      twitterUrl: lead.twitterUrl || null,
      linkedinUrl: lead.linkedinUrl || null,
      googleMapsUrl: lead.googleMapsUrl || null,
      website: lead.website || null,
      websiteQuality: lead.websiteQualityScore || null,
      googleRating: lead.googleRating || null,
      reviewCount: lead.reviewCount || null,
      description: lead.description || null,
      status: 'NEW' as const,
      outreachType: determineOutreachType({
        email: lead.emails[0] || null,
        phone: lead.phones[0] || null,
        metadata: { whatsappNumber: lead.whatsappNumber },
      }),
      source: 'ai_scraper',
      score,
      notes: buildLeadNotes(lead),
      metadata: {
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
      createdById: null,
      createdAt: now,
      updatedAt: now,
      contactedAt: null,
    };

    await leadDocRef.set(leadData);
    const newLeadId = leadDocRef.id;
    const newLead = { id: newLeadId, ...leadData } as Lead;

    // Auto-generate email message only if the lead has an email address
    if (leadData.email) {
      try {
        console.log(`   Generating email for: ${lead.businessName}`);
        const emailMessage = await generatePersonalizedMessage({
          teamId,
          lead: newLead,
        });

        const now2 = new Date();
        await messagesCollection(teamId).doc().set({
          leadId: newLeadId,
          type: 'EMAIL',
          subject: emailMessage.subject || null,
          content: emailMessage.content,
          status: 'DRAFT',
          sentAt: null,
          error: null,
          generatedBy: 'ai',
          aiProvider: emailMessage.provider,
          aiModel: emailMessage.model,
          createdAt: now2,
          updatedAt: now2,
        });

        // Update status based on qualification tier
        const newStatus = lead.qualificationTier === 'A' ? 'QUALIFIED' : 'MESSAGE_READY';
        await leadDocRef.update({ status: newStatus, updatedAt: new Date() });

        console.log(`   Email generated, status updated to: ${newStatus}`);
      } catch (emailError) {
        console.error(`   Failed to auto-generate email for ${lead.businessName}:`, emailError);
      }
    } else {
      console.log(`   Skipping email generation for ${lead.businessName} (no email address)`);
    }

    return true;
  } catch (error) {
    console.error(`   Failed to save lead ${lead.businessName}:`, error);
    return false;
  }
}

function buildLeadNotes(lead: SmartEnrichedLead): string {
  const notes: string[] = [];

  notes.push(`Lead Quality: Tier ${lead.qualificationTier} (${lead.leadScore}/100)`);
  notes.push(`Recommended: ${lead.recommendedAction.replace(/_/g, ' ')} via ${lead.recommendedChannel}`);

  if (lead.servicesOffered.length > 0) {
    notes.push(`\nServices: ${lead.servicesOffered.join(', ')}`);
  }

  if (lead.personalizationHooks.length > 0) {
    notes.push(`\nPersonalization hooks:`);
    lead.personalizationHooks.forEach(hook => notes.push(`  - ${hook}`));
  }

  if (lead.keyTalkingPoints.length > 0) {
    notes.push(`\nKey talking points:`);
    lead.keyTalkingPoints.forEach(point => notes.push(`  - ${point}`));
  }

  if (lead.avoidTopics.length > 0) {
    notes.push(`\nAvoid discussing:`);
    lead.avoidTopics.forEach(topic => notes.push(`  - ${topic}`));
  }

  if (lead.warnings.length > 0) {
    notes.push(`\nWarnings:`);
    lead.warnings.forEach(warning => notes.push(`  - ${warning}`));
  }

  return notes.join('\n');
}

// Run a scraping job with AI-powered multi-source enrichment
export async function runScrapingJob(teamId: string, jobId: string): Promise<void> {
  const jobSnap = await scrapingJobDoc(teamId, jobId).get();

  if (!jobSnap.exists) {
    throw new Error(`Job ${jobId} not found`);
  }

  const job = { id: jobSnap.id, ...jobSnap.data()! } as any;

  const cancellationToken = createCancellationToken(jobId);

  await scrapingJobDoc(teamId, jobId).update({
    status: 'RUNNING',
    startedAt: new Date(),
  });

  // Read scrape delay and email lead target from team settings
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;
  const scrapeDelay = (settings?.scrapeDelayMs as number) || 500;
  const minEmailLeadsPerRun = (settings?.minEmailLeadsPerRun as number) || 0;

  const scraper = createGoogleMapsScraper({
    headless: true,
    delayBetweenRequests: scrapeDelay,
    maxResults: job.leadsRequested,
  });

  scraper.setJobId(jobId);

  let leadsFound = 0;
  let emailLeadsFound = 0;
  let browser: Browser | null = null;

  runningJobs.set(jobId, { cancelled: false, completed: false, scraper, browser: null, teamId });

  initJobLogs(jobId);
  clearJobLogs(jobId);

  try {
    jobLog.info(jobId, 'Initializing scraper...');
    await scraper.initialize();

    if (shouldJobStop(jobId)) {
      jobLog.warning(jobId, 'Job stopped before browser init');
      return;
    }

    jobLog.info(jobId, 'Launching browser for AI enrichment...');

    const chromeArgs = getScraperChromeArgs(jobId);
    browser = await chromium.launch({ headless: true, args: chromeArgs });

    await new Promise(resolve => setTimeout(resolve, 1000));
    const { registerJobProcesses } = await import('./process-manager');
    const registeredCount = await registerJobProcesses(jobId);
    console.log(`[Job ${jobId}] Registered ${registeredCount} Chrome processes`);

    await persistJobProcessPids(teamId, jobId);

    const jobState = runningJobs.get(jobId);
    if (jobState) jobState.browser = browser;

    const countryCode = job.country || DEFAULT_COUNTRY_CODE;
    const countryConfig = getCountryConfig(countryCode);
    const countryName = countryConfig?.name || 'South Africa';

    const categories = job.categories?.length > 0 ? job.categories : TARGET_CATEGORIES;
    const defaultCities = getCitiesForCountry(countryCode);
    const locations = job.locations?.length > 0 ? job.locations : (defaultCities.length > 0 ? defaultCities : SA_CITIES);
    const minRating = job.minRating || 4.0;

    scraper.setCountry(countryCode);

    jobLog.success(jobId, `Starting AI-Powered Scraping Job`, {
      target: job.leadsRequested,
      minEmailTarget: minEmailLeadsPerRun,
      country: countryName,
      categories: categories.length,
      locations: locations.length,
      minRating,
    });

    // Iterate through categories and locations
    categoryLoop:
    for (const category of categories) {
      if (cancellationToken.isCancelled || shouldJobStop(jobId)) break categoryLoop;

      for (const location of locations) {
        if (cancellationToken.isCancelled || shouldJobStop(jobId)) break categoryLoop;

        try {
          jobLog.progress(jobId, `Searching: ${category} in ${location}`);

          const businesses = await scraper.searchBusinesses({
            query: category,
            location,
            country: countryCode,
            minRating,
            maxResults: Math.min(3, job.leadsRequested - leadsFound),
          });

          if (cancellationToken.isCancelled || shouldJobStop(jobId)) break categoryLoop;
          if (!businesses || businesses.length === 0) continue;

          jobLog.info(jobId, `Found ${businesses.length} potential businesses`);

          for (const business of businesses) {
            if (cancellationToken.isCancelled || shouldJobStop(jobId)) break categoryLoop;

            jobLog.info(jobId, `Checking: ${business.name} (${business.rating} stars)`);

            const historyCheck = await checkAnalyzedHistory(
              teamId,
              business.googleMapsUrl,
              business.name,
              location,
              countryCode
            );

            if (cancellationToken.isCancelled || shouldJobStop(jobId)) break categoryLoop;

            if (historyCheck.wasAnalyzedBefore) {
              if (!historyCheck.isGoodProspect) {
                jobLog.info(jobId, `Skipping (history): ${business.name} - ${historyCheck.skipReason}`);
                continue;
              }

              // Check if already a lead
              const existingSnap1 = await leadsCollection(teamId)
                .where('googleMapsUrl', '==', business.googleMapsUrl || '__none__')
                .limit(1)
                .get();
              if (!existingSnap1.empty) {
                jobLog.info(jobId, `Skipping (history): ${business.name} - Already a lead`);
                continue;
              }
            }

            // Check if this business already exists as a lead
            const existingSnap2 = await leadsCollection(teamId)
              .where('businessName', '==', business.name)
              .where('location', '==', location)
              .limit(1)
              .get();
            if (!existingSnap2.empty) {
              jobLog.info(jobId, `Skipping (already exists): ${business.name}`);
              continue;
            }

            // Quality check
            const quickCheck = quickQualityCheck(business.website);
            let websiteQualityScore: number | undefined;
            let isGoodProspect = quickCheck.isLikelyGoodProspect;
            let skipReason = '';

            if (!quickCheck.isLikelyGoodProspect && business.website) {
              jobLog.progress(jobId, `Analyzing website quality: ${business.website}`);
              const prospectCheck = await checkIfGoodProspect(business.website, 1, cancellationToken);

              if (cancellationToken.isCancelled || shouldJobStop(jobId)) break categoryLoop;

              isGoodProspect = prospectCheck.isGoodProspect;
              websiteQualityScore = prospectCheck.qualityScore;

              if (!isGoodProspect) {
                skipReason = `Has quality website (${websiteQualityScore}/100)`;
                jobLog.info(jobId, `Skipping ${business.name} - ${skipReason}`);
                await saveToAnalyzedHistory(teamId, business, location, countryCode, false, skipReason, websiteQualityScore);
                continue;
              }
              skipReason = `Website needs improvement (${websiteQualityScore}/100)`;
            } else {
              websiteQualityScore = quickCheck.estimatedScore;
              skipReason = quickCheck.reason;
            }

            jobLog.progress(jobId, `AI Enrichment starting for: ${business.name}`);

            try {
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
                1,
                teamId,
                cancellationToken
              );

              if (cancellationToken.isCancelled || shouldJobStop(jobId)) break categoryLoop;

              if (websiteQualityScore !== undefined) {
                enrichedLead.websiteQualityScore = websiteQualityScore;
              }

              if (!enrichedLead.isQualified && enrichedLead.qualificationTier === 'D') {
                jobLog.info(jobId, `AI determined ${business.name} is not a good prospect (Tier D)`);
                await saveToAnalyzedHistory(teamId, business, location, countryCode, false, `AI disqualified (Tier D)`, websiteQualityScore);
                continue;
              }

              jobLog.progress(jobId, `Saving lead: ${business.name}`);

              const saved = await saveSmartEnrichedLead(enrichedLead, teamId, countryCode);

              if (saved) {
                await saveToAnalyzedHistory(teamId, business, location, countryCode, true, `Converted to lead (Tier ${enrichedLead.qualificationTier})`, websiteQualityScore, enrichedLead.googleMapsUrl);
                leadsFound++;

                // Track email leads separately
                const hasEmail = enrichedLead.emails.length > 0;
                if (hasEmail) {
                  emailLeadsFound++;
                }

                jobLog.success(jobId, `LEAD SAVED: ${business.name}`, {
                  score: enrichedLead.leadScore,
                  tier: enrichedLead.qualificationTier,
                  hasEmail,
                });

                const emailProgress = minEmailLeadsPerRun > 0
                  ? ` (${emailLeadsFound}/${minEmailLeadsPerRun} with email)`
                  : '';
                jobLog.progress(jobId, `Progress: ${leadsFound}/${job.leadsRequested} leads found${emailProgress}`);

                await scrapingJobDoc(teamId, jobId).update({ leadsFound, emailLeadsFound });

                // Stop only when both targets are met:
                // 1. Total leads target reached
                // 2. Email leads target reached (if configured)
                const totalTargetMet = leadsFound >= job.leadsRequested;
                const emailTargetMet = minEmailLeadsPerRun <= 0 || emailLeadsFound >= minEmailLeadsPerRun;

                if (totalTargetMet && emailTargetMet) {
                  jobLog.success(jobId, `TARGET REACHED! Found ${leadsFound}/${job.leadsRequested} leads (${emailLeadsFound} with email). Stopping.`);
                  markJobCompleted(jobId);
                  break categoryLoop;
                }

                if (totalTargetMet && !emailTargetMet) {
                  jobLog.info(jobId, `Total target reached but still need ${minEmailLeadsPerRun - emailLeadsFound} more email leads. Continuing search...`);
                }
              }
            } catch (enrichError) {
              if (enrichError instanceof JobCancelledError || cancellationToken.isCancelled) {
                break categoryLoop;
              }
              jobLog.error(jobId, `AI enrichment failed for ${business.name}: ${enrichError instanceof Error ? enrichError.message : 'Unknown error'}`);
            }

            try {
              await sleepWithCancellation(1000, cancellationToken);
            } catch (sleepError) {
              if (sleepError instanceof JobCancelledError || cancellationToken.isCancelled) break categoryLoop;
            }
          }
        } catch (error) {
          if (error instanceof JobCancelledError || cancellationToken.isCancelled) break categoryLoop;

          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage === 'BROWSER_CLOSED' || shouldJobStop(jobId)) break categoryLoop;

          jobLog.error(jobId, `Error searching ${category} in ${location}: ${errorMessage}`);
        }
      }
    }

    // Mark job as completed (unless cancelled)
    const wasCancelled = isJobCancelled(jobId) || cancellationToken.isCancelled;
    if (!wasCancelled) {
      const currentSnap = await scrapingJobDoc(teamId, jobId).get();
      const currentStatus = currentSnap.exists ? (currentSnap.data()!.status as string) : null;

      if (currentStatus === 'RUNNING') {
        await scrapingJobDoc(teamId, jobId).update({
          status: 'COMPLETED',
          completedAt: new Date(),
          leadsFound,
        });
        jobLog.success(jobId, `Job completed! Found ${leadsFound}/${job.leadsRequested} qualified lead(s)`);
      }
    }

  } catch (error) {
    if (error instanceof JobCancelledError || cancellationToken.isCancelled) {
      jobLog.warning(jobId, 'Job cancelled gracefully');
    } else if (!isJobCancelled(jobId) && !cancellationToken.isCancelled) {
      jobLog.error(jobId, `Job failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await scrapingJobDoc(teamId, jobId).update({
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } finally {
    jobLog.info(jobId, 'Cleaning up resources...');
    removeCancellationToken(jobId);

    try { await scraper.close(); } catch {}
    if (browser) { try { await browser.close(); } catch {} }

    const killResult = await killJobProcesses(jobId);
    if (killResult.killed > 0) {
      console.log(`[Job ${jobId}] Process cleanup: killed=${killResult.killed}`);
    }

    await clearPersistedProcessPids(teamId, jobId);
    runningJobs.delete(jobId);
    jobLog.info(jobId, 'Job cleanup complete');
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
  const now = new Date();
  const docRef = scrapingJobsCollection(options.teamId).doc();

  await docRef.set({
    status: 'SCHEDULED',
    leadsRequested: options.leadsRequested,
    leadsFound: 0,
    emailLeadsFound: 0,
    searchQuery: null,
    categories: options.categories || [],
    locations: options.locations || [],
    country: options.country || DEFAULT_COUNTRY_CODE,
    minRating: options.minRating || null,
    maxRadius: null,
    scheduledFor: options.scheduledFor || now,
    startedAt: null,
    completedAt: null,
    error: null,
    processPids: null,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
}

// Get pending jobs (across all teams - for scheduler cron)
export async function getPendingJobs() {
  // This needs to search across all teams, which requires a collection group query
  // For now, we use the admin SDK to query the scrapingJobs subcollection group
  const snapshot = await adminDb.collectionGroup('scrapingJobs')
    .where('status', '==', 'SCHEDULED')
    .where('scheduledFor', '<=', new Date())
    .orderBy('scheduledFor', 'asc')
    .get();

  return snapshot.docs.map(d => ({ id: d.id, ...d.data(), _teamId: d.ref.parent.parent?.id }));
}

// Generate messages for new leads (team-scoped)
export async function generateMessagesForNewLeads(teamId: string): Promise<number> {
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;

  if (!settings?.autoGenerateMessages) {
    return 0;
  }

  // Get NEW leads
  const leadsSnap = await leadsCollection(teamId)
    .where('status', '==', 'NEW')
    .limit(10)
    .get();

  let generated = 0;

  for (const doc of leadsSnap.docs) {
    const leadData = doc.data();
    const lead = { id: doc.id, ...leadData } as Lead;

    // Check if lead already has messages
    const msgSnap = await messagesCollection(teamId)
      .where('leadId', '==', doc.id)
      .limit(1)
      .get();

    if (!msgSnap.empty) continue; // Already has messages

    // Only generate messages and update status for leads with email
    if (!lead.email) continue;

    try {
      const emailMessage = await generatePersonalizedMessage({
        teamId,
        lead,
      });

      const now = new Date();
      await messagesCollection(teamId).doc().set({
        leadId: doc.id,
        type: 'EMAIL',
        subject: emailMessage.subject || null,
        content: emailMessage.content,
        status: 'DRAFT',
        sentAt: null,
        error: null,
        generatedBy: null,
        aiProvider: null,
        aiModel: null,
        createdAt: now,
        updatedAt: now,
      });

      await leadDoc(teamId, doc.id).update({
        status: 'MESSAGE_READY',
        updatedAt: new Date(),
      });

      generated++;
    } catch (error) {
      console.error(`Failed to generate message for lead ${doc.id}:`, error);
    }
  }

  return generated;
}
