/**
 * AI-Powered Business Analyzer
 * 
 * Uses AI to deeply analyze businesses and understand:
 * - What they do and how they do it
 * - Their target market and unique selling points
 * - Website quality and design issues
 * - Social media presence quality
 * - Overall lead quality assessment
 */

import { generateText } from 'ai';
import { getLanguageModel } from './providers';

export interface BusinessData {
  name: string;
  website?: string | null;
  websiteContent?: string | null;
  facebookUrl?: string | null;
  facebookContent?: string | null;
  googleMapsData?: {
    rating?: number;
    reviewCount?: number;
    address?: string;
    phone?: string;
    category?: string;
  };
  rawSearchResults?: string;
}

export interface BusinessAnalysis {
  // Core understanding
  businessDescription: string;
  servicesOffered: string[];
  targetMarket: string;
  uniqueSellingPoints: string[];
  
  // Contact quality
  contactQualityScore: number; // 0-100
  bestContactMethod: 'phone' | 'email' | 'whatsapp' | 'facebook';
  
  // Website analysis
  websiteQuality: {
    score: number; // 0-100
    issues: string[];
    hasModernDesign: boolean;
    isMobileResponsive: boolean;
    hasContactForm: boolean;
    loadSpeed: 'fast' | 'medium' | 'slow' | 'unknown';
  };
  
  // Lead qualification
  leadScore: number; // 0-100
  leadQuality: 'hot' | 'warm' | 'cold';
  reasonsToContact: string[];
  potentialObjections: string[];
  
  // Personalization hooks
  personalizationHooks: string[];
  
  // Raw AI reasoning
  aiReasoning: string;
}

const BUSINESS_ANALYZER_PROMPT = `You are an expert business analyst and sales intelligence specialist. Your job is to analyze businesses to determine if they would benefit from professional web design services.

Analyze the provided business data and return a JSON response with your analysis.

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.

The JSON should have this exact structure:
{
  "businessDescription": "A 2-3 sentence description of what this business does",
  "servicesOffered": ["service1", "service2"],
  "targetMarket": "Who their customers are",
  "uniqueSellingPoints": ["USP1", "USP2"],
  "contactQualityScore": 75,
  "bestContactMethod": "phone",
  "websiteQuality": {
    "score": 30,
    "issues": ["outdated design", "not mobile friendly"],
    "hasModernDesign": false,
    "isMobileResponsive": false,
    "hasContactForm": false,
    "loadSpeed": "slow"
  },
  "leadScore": 85,
  "leadQuality": "hot",
  "reasonsToContact": ["No professional website", "Good reviews show demand"],
  "potentialObjections": ["May think websites are expensive"],
  "personalizationHooks": ["Mention their 4.8 star rating", "Reference their plumbing expertise"],
  "aiReasoning": "This business has excellent reviews but no website, making them a prime candidate..."
}

Lead scoring guidelines:
- No website + good reviews = 90+ (HOT)
- DIY/template website + good reviews = 70-89 (WARM)
- Professional website = 20-50 (COLD)
- Add points for: multiple contact methods, active social media, high ratings
- Subtract points for: no phone, no reviews, negative reviews`;

/**
 * Analyze a business using AI to understand what they do and qualify them as a lead
 */
export async function analyzeBusinessWithAI(
  data: BusinessData
): Promise<BusinessAnalysis> {
  const prompt = buildAnalysisPrompt(data);
  
  const model = getLanguageModel({
    provider: 'OPENROUTER',
    model: 'anthropic/claude-haiku-4.5',
  });

  const result = await generateText({
    model,
    system: BUSINESS_ANALYZER_PROMPT,
    prompt,
    temperature: 0.3, // Lower temperature for more consistent JSON
    maxOutputTokens: 2000,
  });

  // Parse the JSON response - clean markdown code blocks if present
  try {
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

    const analysis = JSON.parse(cleanedText);
    return validateAndNormalizeAnalysis(analysis);
  } catch (error) {
    console.error('Failed to parse AI analysis:', error);
    console.error('Raw response:', result.text);
    // Return a default analysis if parsing fails
    return getDefaultAnalysis(data);
  }
}

function buildAnalysisPrompt(data: BusinessData): string {
  let prompt = `Analyze this business:\n\n`;
  
  prompt += `**Business Name:** ${data.name}\n\n`;
  
  if (data.googleMapsData) {
    prompt += `**Google Maps Data:**\n`;
    if (data.googleMapsData.rating) {
      prompt += `- Rating: ${data.googleMapsData.rating} stars\n`;
    }
    if (data.googleMapsData.reviewCount) {
      prompt += `- Reviews: ${data.googleMapsData.reviewCount}\n`;
    }
    if (data.googleMapsData.category) {
      prompt += `- Category: ${data.googleMapsData.category}\n`;
    }
    if (data.googleMapsData.address) {
      prompt += `- Address: ${data.googleMapsData.address}\n`;
    }
    if (data.googleMapsData.phone) {
      prompt += `- Phone: ${data.googleMapsData.phone}\n`;
    }
    prompt += '\n';
  }
  
  if (data.website) {
    prompt += `**Website:** ${data.website}\n`;
    if (data.websiteContent) {
      prompt += `**Website Content (excerpt):**\n${data.websiteContent.substring(0, 2000)}\n\n`;
    }
  } else {
    prompt += `**Website:** None found\n\n`;
  }
  
  if (data.facebookUrl) {
    prompt += `**Facebook Page:** ${data.facebookUrl}\n`;
    if (data.facebookContent) {
      prompt += `**Facebook Content (excerpt):**\n${data.facebookContent.substring(0, 1000)}\n\n`;
    }
  }
  
  if (data.rawSearchResults) {
    prompt += `**Search Results:**\n${data.rawSearchResults.substring(0, 1500)}\n\n`;
  }
  
  prompt += `\nBased on this data, provide your analysis as JSON.`;
  
  return prompt;
}

function validateAndNormalizeAnalysis(raw: any): BusinessAnalysis {
  return {
    businessDescription: raw.businessDescription || 'Unknown business',
    servicesOffered: Array.isArray(raw.servicesOffered) ? raw.servicesOffered : [],
    targetMarket: raw.targetMarket || 'General public',
    uniqueSellingPoints: Array.isArray(raw.uniqueSellingPoints) ? raw.uniqueSellingPoints : [],
    contactQualityScore: normalizeScore(raw.contactQualityScore),
    bestContactMethod: validateContactMethod(raw.bestContactMethod),
    websiteQuality: {
      score: normalizeScore(raw.websiteQuality?.score),
      issues: Array.isArray(raw.websiteQuality?.issues) ? raw.websiteQuality.issues : [],
      hasModernDesign: Boolean(raw.websiteQuality?.hasModernDesign),
      isMobileResponsive: Boolean(raw.websiteQuality?.isMobileResponsive),
      hasContactForm: Boolean(raw.websiteQuality?.hasContactForm),
      loadSpeed: validateLoadSpeed(raw.websiteQuality?.loadSpeed),
    },
    leadScore: normalizeScore(raw.leadScore),
    leadQuality: validateLeadQuality(raw.leadQuality),
    reasonsToContact: Array.isArray(raw.reasonsToContact) ? raw.reasonsToContact : [],
    potentialObjections: Array.isArray(raw.potentialObjections) ? raw.potentialObjections : [],
    personalizationHooks: Array.isArray(raw.personalizationHooks) ? raw.personalizationHooks : [],
    aiReasoning: raw.aiReasoning || '',
  };
}

function normalizeScore(score: any): number {
  const num = Number(score);
  if (isNaN(num)) return 50;
  return Math.max(0, Math.min(100, num));
}

function validateContactMethod(method: any): 'phone' | 'email' | 'whatsapp' | 'facebook' {
  const valid = ['phone', 'email', 'whatsapp', 'facebook'];
  return valid.includes(method) ? method : 'phone';
}

function validateLoadSpeed(speed: any): 'fast' | 'medium' | 'slow' | 'unknown' {
  const valid = ['fast', 'medium', 'slow', 'unknown'];
  return valid.includes(speed) ? speed : 'unknown';
}

function validateLeadQuality(quality: any): 'hot' | 'warm' | 'cold' {
  const valid = ['hot', 'warm', 'cold'];
  return valid.includes(quality) ? quality : 'warm';
}

function getDefaultAnalysis(data: BusinessData): BusinessAnalysis {
  const hasWebsite = Boolean(data.website);
  const hasGoodRating = (data.googleMapsData?.rating || 0) >= 4.0;
  
  return {
    businessDescription: `${data.name} is a local business.`,
    servicesOffered: [],
    targetMarket: 'Local customers',
    uniqueSellingPoints: [],
    contactQualityScore: data.googleMapsData?.phone ? 70 : 40,
    bestContactMethod: data.googleMapsData?.phone ? 'phone' : 'facebook',
    websiteQuality: {
      score: hasWebsite ? 50 : 0,
      issues: hasWebsite ? [] : ['No website'],
      hasModernDesign: false,
      isMobileResponsive: false,
      hasContactForm: false,
      loadSpeed: 'unknown',
    },
    leadScore: !hasWebsite && hasGoodRating ? 85 : 50,
    leadQuality: !hasWebsite && hasGoodRating ? 'hot' : 'warm',
    reasonsToContact: !hasWebsite ? ['No professional website'] : [],
    potentialObjections: ['May not see value in website'],
    personalizationHooks: [],
    aiReasoning: 'Default analysis due to parsing error',
  };
}
