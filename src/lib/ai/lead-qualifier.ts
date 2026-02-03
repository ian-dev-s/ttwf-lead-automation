/**
 * AI-Powered Lead Qualifier
 * 
 * Uses AI to intelligently qualify leads based on multiple factors:
 * - Business potential (reviews, ratings, activity)
 * - Website need assessment
 * - Contact method quality
 * - Likelihood to convert
 * - Personalization opportunities
 */

import { generateText } from 'ai';
import { getLanguageModel } from './providers';
import { BusinessAnalysis } from './business-analyzer';
import { ExtractedContactInfo, ExtractedBusinessInfo } from './data-extractor';

export interface LeadQualificationInput {
  businessName: string;
  industry: string;
  location: string;
  googleRating?: number;
  reviewCount?: number;
  hasWebsite: boolean;
  websiteUrl?: string;
  websiteQualityScore?: number;
  phones: string[];
  emails: string[];
  hasFacebook: boolean;
  hasInstagram: boolean;
  analysis?: BusinessAnalysis;
  extractedInfo?: {
    contacts: ExtractedContactInfo;
    business: ExtractedBusinessInfo;
  };
}

export interface LeadQualification {
  // Overall qualification
  isQualified: boolean;
  qualificationScore: number; // 0-100
  qualificationTier: 'A' | 'B' | 'C' | 'D'; // A = Best prospect
  
  // Detailed scores
  scores: {
    businessPotential: number; // 0-100 - How successful is this business?
    websiteNeed: number; // 0-100 - How much do they need a website?
    contactability: number; // 0-100 - How easy to reach?
    conversionLikelihood: number; // 0-100 - How likely to become a customer?
  };
  
  // Insights
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  
  // Recommended actions
  recommendedAction: 'contact_immediately' | 'contact_soon' | 'nurture' | 'skip';
  recommendedChannel: 'whatsapp' | 'email' | 'phone' | 'facebook';
  urgency: 'high' | 'medium' | 'low';
  
  // Personalization
  keyTalkingPoints: string[];
  avoidTopics: string[];
  bestTimeToContact?: string;
  
  // AI reasoning
  reasoning: string;
}

const LEAD_QUALIFIER_PROMPT = `You are an expert sales qualification specialist for a web design agency targeting South African small businesses.

Your job is to qualify leads and determine their potential as customers for professional website services.

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.

Qualification Guidelines:
- TIER A (Score 85-100): No website, 4+ star rating, 20+ reviews, phone available = CONTACT IMMEDIATELY
- TIER B (Score 70-84): DIY/poor website OR good reviews but no website, some contact info = CONTACT SOON
- TIER C (Score 50-69): Has basic website or mixed signals = NURTURE
- TIER D (Score 0-49): Good website or poor business indicators = SKIP

Scoring Factors:
- No website = +40 points
- Poor quality website (DIY/template) = +25 points
- Rating 4.5+ = +20 points, Rating 4.0-4.4 = +10 points
- 50+ reviews = +15 points, 20-49 reviews = +10 points
- Phone available = +15 points
- Active social media = +10 points
- In service industry (plumber, electrician, etc.) = +10 points

The JSON response should have this structure:
{
  "isQualified": true,
  "qualificationScore": 87,
  "qualificationTier": "A",
  "scores": {
    "businessPotential": 85,
    "websiteNeed": 95,
    "contactability": 80,
    "conversionLikelihood": 75
  },
  "strengths": ["Excellent reviews", "No website - clear need"],
  "weaknesses": ["Only one contact method"],
  "opportunities": ["Growing market area", "Competitors have poor websites"],
  "threats": ["May be skeptical of cold outreach"],
  "recommendedAction": "contact_immediately",
  "recommendedChannel": "whatsapp",
  "urgency": "high",
  "keyTalkingPoints": ["Mention their 4.8 star rating", "Reference specific positive review"],
  "avoidTopics": ["Competitor comparisons"],
  "bestTimeToContact": "Business hours, mid-morning",
  "reasoning": "This is an excellent prospect because..."
}`;

/**
 * Qualify a lead using AI to determine their potential as a customer
 */
export async function qualifyLeadWithAI(
  input: LeadQualificationInput
): Promise<LeadQualification> {
  const prompt = buildQualificationPrompt(input);
  
  const model = getLanguageModel({
    provider: 'OPENROUTER',
    model: 'anthropic/claude-haiku-4.5',
  });

  try {
    const result = await generateText({
      model,
      system: LEAD_QUALIFIER_PROMPT,
      prompt,
      temperature: 0.3,
      maxOutputTokens: 1500,
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

    const qualification = JSON.parse(cleanedText);
    return validateAndNormalizeQualification(qualification);
  } catch (error) {
    console.error('AI lead qualification failed:', error);
    return calculateFallbackQualification(input);
  }
}

function buildQualificationPrompt(input: LeadQualificationInput): string {
  let prompt = `Qualify this lead for a web design agency:\n\n`;
  
  prompt += `**Business:** ${input.businessName}\n`;
  prompt += `**Industry:** ${input.industry}\n`;
  prompt += `**Location:** ${input.location}\n\n`;
  
  prompt += `**Online Presence:**\n`;
  prompt += `- Website: ${input.hasWebsite ? input.websiteUrl : 'NONE'}\n`;
  if (input.hasWebsite && input.websiteQualityScore !== undefined) {
    prompt += `- Website Quality Score: ${input.websiteQualityScore}/100\n`;
  }
  prompt += `- Facebook: ${input.hasFacebook ? 'Yes' : 'No'}\n`;
  prompt += `- Instagram: ${input.hasInstagram ? 'Yes' : 'No'}\n\n`;
  
  prompt += `**Google Maps Data:**\n`;
  prompt += `- Rating: ${input.googleRating ? `${input.googleRating} stars` : 'Unknown'}\n`;
  prompt += `- Reviews: ${input.reviewCount || 'Unknown'}\n\n`;
  
  prompt += `**Contact Methods:**\n`;
  prompt += `- Phones: ${input.phones.length > 0 ? input.phones.join(', ') : 'None found'}\n`;
  prompt += `- Emails: ${input.emails.length > 0 ? input.emails.join(', ') : 'None found'}\n\n`;
  
  if (input.analysis) {
    prompt += `**AI Business Analysis:**\n`;
    prompt += `- Description: ${input.analysis.businessDescription}\n`;
    prompt += `- Services: ${input.analysis.servicesOffered.join(', ') || 'Unknown'}\n`;
    prompt += `- Lead Score (from analysis): ${input.analysis.leadScore}\n`;
    prompt += `- Personalization Hooks: ${input.analysis.personalizationHooks.join('; ') || 'None'}\n\n`;
  }
  
  if (input.extractedInfo) {
    const { contacts, business } = input.extractedInfo;
    if (business.services.length > 0) {
      prompt += `**Extracted Services:** ${business.services.join(', ')}\n`;
    }
    if (business.areasServed.length > 0) {
      prompt += `**Areas Served:** ${business.areasServed.join(', ')}\n`;
    }
    if (contacts.businessHours) {
      prompt += `**Business Hours:** ${contacts.businessHours}\n`;
    }
  }
  
  prompt += `\nBased on this data, qualify this lead and return your analysis as JSON.`;
  
  return prompt;
}

function validateAndNormalizeQualification(raw: any): LeadQualification {
  return {
    isQualified: Boolean(raw.isQualified),
    qualificationScore: normalizeScore(raw.qualificationScore),
    qualificationTier: validateTier(raw.qualificationTier),
    scores: {
      businessPotential: normalizeScore(raw.scores?.businessPotential),
      websiteNeed: normalizeScore(raw.scores?.websiteNeed),
      contactability: normalizeScore(raw.scores?.contactability),
      conversionLikelihood: normalizeScore(raw.scores?.conversionLikelihood),
    },
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses : [],
    opportunities: Array.isArray(raw.opportunities) ? raw.opportunities : [],
    threats: Array.isArray(raw.threats) ? raw.threats : [],
    recommendedAction: validateAction(raw.recommendedAction),
    recommendedChannel: validateChannel(raw.recommendedChannel),
    urgency: validateUrgency(raw.urgency),
    keyTalkingPoints: Array.isArray(raw.keyTalkingPoints) ? raw.keyTalkingPoints : [],
    avoidTopics: Array.isArray(raw.avoidTopics) ? raw.avoidTopics : [],
    bestTimeToContact: raw.bestTimeToContact,
    reasoning: raw.reasoning || '',
  };
}

function normalizeScore(score: any): number {
  const num = Number(score);
  if (isNaN(num)) return 50;
  return Math.max(0, Math.min(100, num));
}

function validateTier(tier: any): 'A' | 'B' | 'C' | 'D' {
  const valid = ['A', 'B', 'C', 'D'];
  return valid.includes(tier) ? tier : 'C';
}

function validateAction(action: any): LeadQualification['recommendedAction'] {
  const valid = ['contact_immediately', 'contact_soon', 'nurture', 'skip'];
  return valid.includes(action) ? action : 'nurture';
}

function validateChannel(channel: any): LeadQualification['recommendedChannel'] {
  const valid = ['whatsapp', 'email', 'phone', 'facebook'];
  return valid.includes(channel) ? channel : 'phone';
}

function validateUrgency(urgency: any): 'high' | 'medium' | 'low' {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(urgency) ? urgency : 'medium';
}

/**
 * Fallback qualification when AI fails
 */
function calculateFallbackQualification(input: LeadQualificationInput): LeadQualification {
  let score = 0;
  
  // No website = +40
  if (!input.hasWebsite) score += 40;
  // Poor website = +25
  else if (input.websiteQualityScore && input.websiteQualityScore < 50) score += 25;
  
  // Rating bonuses
  if (input.googleRating) {
    if (input.googleRating >= 4.5) score += 20;
    else if (input.googleRating >= 4.0) score += 10;
  }
  
  // Review bonuses
  if (input.reviewCount) {
    if (input.reviewCount >= 50) score += 15;
    else if (input.reviewCount >= 20) score += 10;
  }
  
  // Contact method bonuses
  if (input.phones.length > 0) score += 15;
  if (input.hasFacebook || input.hasInstagram) score += 10;
  
  // Determine tier
  let tier: 'A' | 'B' | 'C' | 'D';
  if (score >= 85) tier = 'A';
  else if (score >= 70) tier = 'B';
  else if (score >= 50) tier = 'C';
  else tier = 'D';
  
  return {
    isQualified: score >= 50,
    qualificationScore: score,
    qualificationTier: tier,
    scores: {
      businessPotential: input.googleRating ? input.googleRating * 20 : 50,
      websiteNeed: input.hasWebsite ? 30 : 90,
      contactability: input.phones.length > 0 ? 80 : 40,
      conversionLikelihood: score,
    },
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
    recommendedAction: tier === 'A' ? 'contact_immediately' : tier === 'B' ? 'contact_soon' : 'nurture',
    recommendedChannel: input.phones.length > 0 ? 'whatsapp' : 'facebook',
    urgency: tier === 'A' ? 'high' : tier === 'B' ? 'medium' : 'low',
    keyTalkingPoints: [],
    avoidTopics: [],
    reasoning: 'Fallback qualification based on basic scoring rules',
  };
}

/**
 * Batch qualify multiple leads
 */
export async function qualifyLeadsBatch(
  leads: LeadQualificationInput[]
): Promise<Map<string, LeadQualification>> {
  const results = new Map<string, LeadQualification>();
  
  // Process in parallel with concurrency limit
  const concurrency = 3;
  for (let i = 0; i < leads.length; i += concurrency) {
    const batch = leads.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(lead => qualifyLeadWithAI(lead))
    );
    
    batch.forEach((lead, idx) => {
      results.set(lead.businessName, batchResults[idx]);
    });
    
    // Small delay between batches
    if (i + concurrency < leads.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}
