/**
 * AI-Powered Cross-Reference Validator
 * 
 * Uses AI to validate and merge data from multiple sources:
 * - Verify that information from different sources is about the same business
 * - Resolve conflicts between sources
 * - Identify the most reliable data
 * - Flag suspicious or inconsistent information
 */

import { generateText } from 'ai';
import { getLanguageModel } from './providers';

export interface DataSource {
  source: 'google_maps' | 'website' | 'facebook' | 'google_search' | 'manual';
  confidence: number; // 0-100
  data: {
    name?: string;
    phones?: string[];
    emails?: string[];
    address?: string;
    description?: string;
    services?: string[];
    website?: string;
    socialMedia?: Record<string, string>;
  };
}

export interface ValidationResult {
  isValidMatch: boolean;
  confidence: number; // 0-100
  
  // Merged data with source attribution
  mergedData: {
    name: string;
    nameSource: string;
    phones: Array<{ value: string; sources: string[] }>;
    emails: Array<{ value: string; sources: string[] }>;
    address?: string;
    addressSource?: string;
    description?: string;
    descriptionSource?: string;
    services: string[];
    website?: string;
    socialMedia: Record<string, string>;
  };
  
  // Conflicts found
  conflicts: Array<{
    field: string;
    values: Array<{ value: string; source: string }>;
    resolution: string;
    resolvedValue: string;
  }>;
  
  // Warnings
  warnings: string[];
  
  // AI reasoning
  reasoning: string;
}

const CROSS_REFERENCE_PROMPT = `You are an expert data validation specialist. Your job is to verify that data from multiple sources refers to the same business and merge the information intelligently.

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.

Guidelines:
1. Check if all sources refer to the same business (name variations, same address/phone)
2. Merge data, preferring sources in this order: Google Maps > Website > Facebook > Google Search
3. For phones/emails, collect all unique values but note which sources provided each
4. Flag any suspicious inconsistencies
5. Resolve conflicts by picking the most reliable source

The JSON response should have this structure:
{
  "isValidMatch": true,
  "confidence": 92,
  "mergedData": {
    "name": "ABC Plumbing",
    "nameSource": "google_maps",
    "phones": [
      {"value": "+27821234567", "sources": ["google_maps", "website"]},
      {"value": "+27119876543", "sources": ["facebook"]}
    ],
    "emails": [
      {"value": "info@abc.co.za", "sources": ["website"]}
    ],
    "address": "123 Main Road, Johannesburg",
    "addressSource": "google_maps",
    "description": "Professional plumbing services",
    "descriptionSource": "website",
    "services": ["Plumbing", "Drain cleaning", "Geyser repairs"],
    "website": "https://abcplumbing.co.za",
    "socialMedia": {
      "facebook": "https://facebook.com/abcplumbing"
    }
  },
  "conflicts": [
    {
      "field": "name",
      "values": [
        {"value": "ABC Plumbing", "source": "google_maps"},
        {"value": "ABC Plumbing Services", "source": "facebook"}
      ],
      "resolution": "Used Google Maps as primary source",
      "resolvedValue": "ABC Plumbing"
    }
  ],
  "warnings": ["Facebook page may be outdated"],
  "reasoning": "High confidence match - same phone number appears in multiple sources..."
}`;

/**
 * Cross-reference and validate data from multiple sources using AI
 */
export async function crossReferenceWithAI(
  teamId: string,
  sources: DataSource[],
  expectedBusinessName?: string
): Promise<ValidationResult> {
  if (sources.length === 0) {
    return getEmptyValidationResult();
  }
  
  if (sources.length === 1) {
    return convertSingleSourceToResult(sources[0]);
  }
  
  const prompt = buildCrossReferencePrompt(sources, expectedBusinessName);
  
  const model = await getLanguageModel(teamId, {
    provider: 'OPENROUTER',
    model: 'google/gemini-3-flash-preview',
  });

  try {
    const result = await generateText({
      model,
      system: CROSS_REFERENCE_PROMPT,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 2000,
    });

    // Clean the response - remove markdown code blocks if present
    let cleanedText = result.text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    const validation = JSON.parse(cleanedText);
    return validateAndNormalizeResult(validation);
  } catch (error) {
    console.error('AI cross-reference failed:', error);
    return fallbackMerge(sources);
  }
}

function buildCrossReferencePrompt(sources: DataSource[], expectedName?: string): string {
  let prompt = `Cross-reference and validate data from these sources:\n\n`;
  
  if (expectedName) {
    prompt += `**Expected Business Name:** ${expectedName}\n\n`;
  }
  
  for (const source of sources) {
    prompt += `**Source: ${source.source.toUpperCase()}** (Confidence: ${source.confidence}%)\n`;
    
    if (source.data.name) prompt += `- Name: ${source.data.name}\n`;
    if (source.data.phones?.length) prompt += `- Phones: ${source.data.phones.join(', ')}\n`;
    if (source.data.emails?.length) prompt += `- Emails: ${source.data.emails.join(', ')}\n`;
    if (source.data.address) prompt += `- Address: ${source.data.address}\n`;
    if (source.data.description) prompt += `- Description: ${source.data.description.substring(0, 200)}\n`;
    if (source.data.services?.length) prompt += `- Services: ${source.data.services.join(', ')}\n`;
    if (source.data.website) prompt += `- Website: ${source.data.website}\n`;
    if (source.data.socialMedia && Object.keys(source.data.socialMedia).length > 0) {
      prompt += `- Social Media: ${JSON.stringify(source.data.socialMedia)}\n`;
    }
    
    prompt += '\n';
  }
  
  prompt += `\nValidate that these sources refer to the same business and merge the data intelligently. Return JSON.`;
  
  return prompt;
}

function validateAndNormalizeResult(raw: any): ValidationResult {
  return {
    isValidMatch: Boolean(raw.isValidMatch),
    confidence: normalizeScore(raw.confidence),
    mergedData: {
      name: raw.mergedData?.name || 'Unknown',
      nameSource: raw.mergedData?.nameSource || 'unknown',
      phones: Array.isArray(raw.mergedData?.phones) ? raw.mergedData.phones : [],
      emails: Array.isArray(raw.mergedData?.emails) ? raw.mergedData.emails : [],
      address: raw.mergedData?.address,
      addressSource: raw.mergedData?.addressSource,
      description: raw.mergedData?.description,
      descriptionSource: raw.mergedData?.descriptionSource,
      services: Array.isArray(raw.mergedData?.services) ? raw.mergedData.services : [],
      website: raw.mergedData?.website,
      socialMedia: raw.mergedData?.socialMedia || {},
    },
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    reasoning: raw.reasoning || '',
  };
}

function normalizeScore(score: any): number {
  const num = Number(score);
  if (isNaN(num)) return 50;
  return Math.max(0, Math.min(100, num));
}

function getEmptyValidationResult(): ValidationResult {
  return {
    isValidMatch: false,
    confidence: 0,
    mergedData: {
      name: 'Unknown',
      nameSource: 'none',
      phones: [],
      emails: [],
      services: [],
      socialMedia: {},
    },
    conflicts: [],
    warnings: ['No data sources provided'],
    reasoning: 'No data to validate',
  };
}

function convertSingleSourceToResult(source: DataSource): ValidationResult {
  const phones = (source.data.phones || []).map(p => ({
    value: p,
    sources: [source.source],
  }));
  
  const emails = (source.data.emails || []).map(e => ({
    value: e,
    sources: [source.source],
  }));
  
  return {
    isValidMatch: true,
    confidence: source.confidence,
    mergedData: {
      name: source.data.name || 'Unknown',
      nameSource: source.source,
      phones,
      emails,
      address: source.data.address,
      addressSource: source.data.address ? source.source : undefined,
      description: source.data.description,
      descriptionSource: source.data.description ? source.source : undefined,
      services: source.data.services || [],
      website: source.data.website,
      socialMedia: source.data.socialMedia || {},
    },
    conflicts: [],
    warnings: ['Only single source available - no cross-reference possible'],
    reasoning: 'Single source data, no validation needed',
  };
}

/**
 * Fallback merge when AI fails - uses simple heuristics
 */
function fallbackMerge(sources: DataSource[]): ValidationResult {
  // Sort by confidence
  const sortedSources = [...sources].sort((a, b) => b.confidence - a.confidence);
  const primarySource = sortedSources[0];
  
  // Collect all phones and emails
  const phoneMap = new Map<string, string[]>();
  const emailMap = new Map<string, string[]>();
  
  for (const source of sources) {
    for (const phone of source.data.phones || []) {
      const existing = phoneMap.get(phone) || [];
      existing.push(source.source);
      phoneMap.set(phone, existing);
    }
    for (const email of source.data.emails || []) {
      const existing = emailMap.get(email.toLowerCase()) || [];
      existing.push(source.source);
      emailMap.set(email.toLowerCase(), existing);
    }
  }
  
  const phones = Array.from(phoneMap.entries()).map(([value, sources]) => ({
    value,
    sources,
  }));
  
  const emails = Array.from(emailMap.entries()).map(([value, sources]) => ({
    value,
    sources,
  }));
  
  // Merge services
  const allServices = new Set<string>();
  for (const source of sources) {
    for (const service of source.data.services || []) {
      allServices.add(service);
    }
  }
  
  // Merge social media
  const socialMedia: Record<string, string> = {};
  for (const source of sortedSources) {
    if (source.data.socialMedia) {
      Object.assign(socialMedia, source.data.socialMedia);
    }
  }
  
  return {
    isValidMatch: true,
    confidence: primarySource.confidence * 0.8, // Reduce confidence for fallback
    mergedData: {
      name: primarySource.data.name || 'Unknown',
      nameSource: primarySource.source,
      phones,
      emails,
      address: primarySource.data.address,
      addressSource: primarySource.data.address ? primarySource.source : undefined,
      description: primarySource.data.description,
      descriptionSource: primarySource.data.description ? primarySource.source : undefined,
      services: Array.from(allServices),
      website: primarySource.data.website,
      socialMedia,
    },
    conflicts: [],
    warnings: ['Used fallback merge - AI validation unavailable'],
    reasoning: 'Fallback merge based on source confidence ranking',
  };
}

/**
 * Check if two business names likely refer to the same business
 */
export function areNamesSimilar(name1: string, name2: string): boolean {
  const normalize = (s: string) => 
    s.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/(pty|ltd|cc|inc|co|sa|services?|solutions?|experts?|pros?)/g, '');
  
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  // Exact match after normalization
  if (n1 === n2) return true;
  
  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Levenshtein distance for fuzzy matching
  const maxDist = Math.max(n1.length, n2.length) * 0.3;
  return levenshteinDistance(n1, n2) <= maxDist;
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}
