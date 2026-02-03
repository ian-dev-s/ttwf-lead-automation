/**
 * AI-Powered Data Extractor
 * 
 * Uses AI to extract structured data from unstructured text:
 * - Contact information (phones, emails)
 * - Social media profiles
 * - Business hours
 * - Services offered
 * - Location information
 */

import { generateText } from 'ai';
import { getLanguageModel } from './providers';

export interface ExtractedContactInfo {
  phones: string[];
  emails: string[];
  socialMedia: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  addresses: string[];
  businessHours?: string;
  whatsappNumber?: string;
}

export interface ExtractedBusinessInfo {
  name?: string;
  description?: string;
  services: string[];
  specializations: string[];
  yearsInBusiness?: number;
  certifications: string[];
  areasServed: string[];
}

const DATA_EXTRACTOR_PROMPT = `You are an expert data extraction specialist. Your job is to extract structured information from unstructured text about businesses.

Extract ALL contact information and business details you can find. Be thorough and accurate.

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.

The JSON should have this structure:
{
  "contacts": {
    "phones": ["+27 82 123 4567", "011 123 4567"],
    "emails": ["info@example.com"],
    "socialMedia": {
      "facebook": "https://facebook.com/example",
      "instagram": "https://instagram.com/example"
    },
    "addresses": ["123 Main Road, Johannesburg"],
    "businessHours": "Mon-Fri 8am-5pm",
    "whatsappNumber": "+27 82 123 4567"
  },
  "business": {
    "name": "Example Business",
    "description": "A professional service provider",
    "services": ["Plumbing", "Drain cleaning"],
    "specializations": ["Emergency repairs", "Commercial plumbing"],
    "yearsInBusiness": 15,
    "certifications": ["PIRB registered"],
    "areasServed": ["Johannesburg", "Sandton"]
  }
}

Guidelines:
- For South African phones, normalize to international format (+27) when possible
- Extract ALL phone numbers, including WhatsApp-specific numbers
- Look for email patterns even if not explicitly labeled
- Extract social media URLs from any format (full URLs, @handles, page names)
- Business hours can be in various formats - extract as-is
- Services should be specific, not generic
- If information isn't found, use empty arrays or omit the field`;

/**
 * Extract contact and business information from raw text using AI
 */
export async function extractDataWithAI(
  text: string,
  businessName?: string
): Promise<{ contacts: ExtractedContactInfo; business: ExtractedBusinessInfo }> {
  if (!text || text.trim().length < 10) {
    return getEmptyExtraction();
  }

  const prompt = buildExtractionPrompt(text, businessName);
  
  const model = getLanguageModel({
    provider: 'OPENROUTER',
    model: 'anthropic/claude-haiku-4.5',
  });

  try {
    const result = await generateText({
      model,
      system: DATA_EXTRACTOR_PROMPT,
      prompt,
      temperature: 0.2, // Very low temperature for accurate extraction
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

    const extracted = JSON.parse(cleanedText);
    return validateAndNormalizeExtraction(extracted);
  } catch (error) {
    console.error('AI data extraction failed:', error);
    // Fall back to regex-based extraction
    return fallbackExtraction(text);
  }
}

function buildExtractionPrompt(text: string, businessName?: string): string {
  let prompt = '';
  
  if (businessName) {
    prompt += `Extract information about "${businessName}" from this text:\n\n`;
  } else {
    prompt += `Extract business and contact information from this text:\n\n`;
  }
  
  // Limit text length to avoid token limits
  const truncatedText = text.substring(0, 4000);
  prompt += truncatedText;
  
  return prompt;
}

function validateAndNormalizeExtraction(raw: any): { contacts: ExtractedContactInfo; business: ExtractedBusinessInfo } {
  return {
    contacts: {
      phones: normalizePhones(raw.contacts?.phones),
      emails: normalizeEmails(raw.contacts?.emails),
      socialMedia: normalizeSocialMedia(raw.contacts?.socialMedia),
      addresses: Array.isArray(raw.contacts?.addresses) ? raw.contacts.addresses : [],
      businessHours: raw.contacts?.businessHours,
      whatsappNumber: normalizePhone(raw.contacts?.whatsappNumber),
    },
    business: {
      name: raw.business?.name,
      description: raw.business?.description,
      services: Array.isArray(raw.business?.services) ? raw.business.services : [],
      specializations: Array.isArray(raw.business?.specializations) ? raw.business.specializations : [],
      yearsInBusiness: raw.business?.yearsInBusiness,
      certifications: Array.isArray(raw.business?.certifications) ? raw.business.certifications : [],
      areasServed: Array.isArray(raw.business?.areasServed) ? raw.business.areasServed : [],
    },
  };
}

function normalizePhones(phones: any): string[] {
  if (!Array.isArray(phones)) return [];
  return phones
    .map(normalizePhone)
    .filter((p): p is string => p !== undefined);
}

function normalizePhone(phone: any): string | undefined {
  if (!phone || typeof phone !== 'string') return undefined;
  
  // Remove all non-digit characters except + at the start
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Convert South African numbers to international format
  if (normalized.startsWith('0') && normalized.length === 10) {
    normalized = '+27' + normalized.substring(1);
  }
  
  // Validate length
  if (normalized.length < 10) return undefined;
  
  return normalized;
}

function normalizeEmails(emails: any): string[] {
  if (!Array.isArray(emails)) return [];
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emails
    .filter((e): e is string => typeof e === 'string' && emailRegex.test(e.toLowerCase()))
    .map(e => e.toLowerCase());
}

function normalizeSocialMedia(social: any): ExtractedContactInfo['socialMedia'] {
  if (!social || typeof social !== 'object') return {};
  
  const normalized: ExtractedContactInfo['socialMedia'] = {};
  
  const platforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'] as const;
  
  for (const platform of platforms) {
    if (social[platform] && typeof social[platform] === 'string') {
      normalized[platform] = normalizeSocialUrl(social[platform], platform);
    }
  }
  
  return normalized;
}

function normalizeSocialUrl(url: string, platform: string): string {
  // If it's already a full URL, return it
  if (url.startsWith('http')) return url;
  
  // If it's a handle, convert to URL
  const handle = url.replace(/^@/, '');
  
  const baseUrls: Record<string, string> = {
    facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/',
    twitter: 'https://twitter.com/',
    linkedin: 'https://linkedin.com/company/',
    youtube: 'https://youtube.com/@',
    tiktok: 'https://tiktok.com/@',
  };
  
  return (baseUrls[platform] || '') + handle;
}

function getEmptyExtraction(): { contacts: ExtractedContactInfo; business: ExtractedBusinessInfo } {
  return {
    contacts: {
      phones: [],
      emails: [],
      socialMedia: {},
      addresses: [],
    },
    business: {
      services: [],
      specializations: [],
      certifications: [],
      areasServed: [],
    },
  };
}

/**
 * Fallback regex-based extraction when AI fails
 */
function fallbackExtraction(text: string): { contacts: ExtractedContactInfo; business: ExtractedBusinessInfo } {
  const result = getEmptyExtraction();
  
  // Extract South African phone numbers
  const phoneRegex = /(?:\+27|0)[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const phones = text.match(phoneRegex) || [];
  result.contacts.phones = phones.map(p => normalizePhone(p)).filter((p): p is string => p !== undefined);
  
  // Extract emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  result.contacts.emails = text.match(emailRegex) || [];
  
  // Extract social media URLs
  const fbRegex = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s"'<>]+/gi;
  const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^\s"'<>]+/gi;
  const twRegex = /(?:https?:\/\/)?(?:www\.)?twitter\.com\/[^\s"'<>]+/gi;
  const liRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi;
  
  const fbMatch = text.match(fbRegex);
  const igMatch = text.match(igRegex);
  const twMatch = text.match(twRegex);
  const liMatch = text.match(liRegex);
  
  if (fbMatch) result.contacts.socialMedia.facebook = fbMatch[0];
  if (igMatch) result.contacts.socialMedia.instagram = igMatch[0];
  if (twMatch) result.contacts.socialMedia.twitter = twMatch[0];
  if (liMatch) result.contacts.socialMedia.linkedin = liMatch[0];
  
  // Set WhatsApp number (first phone with +27)
  const whatsappCandidate = result.contacts.phones.find(p => p.startsWith('+27'));
  if (whatsappCandidate) {
    result.contacts.whatsappNumber = whatsappCandidate;
  }
  
  return result;
}

/**
 * Extract data from multiple text sources and merge results
 */
export async function extractAndMergeData(
  sources: { source: string; text: string }[],
  businessName?: string
): Promise<{ contacts: ExtractedContactInfo; business: ExtractedBusinessInfo }> {
  const results = await Promise.all(
    sources.map(s => extractDataWithAI(s.text, businessName))
  );
  
  // Merge all results
  const merged = getEmptyExtraction();
  
  for (const result of results) {
    // Merge phones (deduplicate)
    for (const phone of result.contacts.phones) {
      if (!merged.contacts.phones.includes(phone)) {
        merged.contacts.phones.push(phone);
      }
    }
    
    // Merge emails (deduplicate)
    for (const email of result.contacts.emails) {
      if (!merged.contacts.emails.includes(email)) {
        merged.contacts.emails.push(email);
      }
    }
    
    // Merge social media (prefer first found)
    merged.contacts.socialMedia = {
      ...result.contacts.socialMedia,
      ...merged.contacts.socialMedia,
    };
    
    // Merge addresses
    for (const addr of result.contacts.addresses) {
      if (!merged.contacts.addresses.includes(addr)) {
        merged.contacts.addresses.push(addr);
      }
    }
    
    // Use first non-empty business hours
    if (!merged.contacts.businessHours && result.contacts.businessHours) {
      merged.contacts.businessHours = result.contacts.businessHours;
    }
    
    // Use first WhatsApp number found
    if (!merged.contacts.whatsappNumber && result.contacts.whatsappNumber) {
      merged.contacts.whatsappNumber = result.contacts.whatsappNumber;
    }
    
    // Merge business info
    if (!merged.business.name && result.business.name) {
      merged.business.name = result.business.name;
    }
    if (!merged.business.description && result.business.description) {
      merged.business.description = result.business.description;
    }
    
    // Merge services (deduplicate)
    for (const service of result.business.services) {
      if (!merged.business.services.includes(service)) {
        merged.business.services.push(service);
      }
    }
    
    // Merge specializations
    for (const spec of result.business.specializations) {
      if (!merged.business.specializations.includes(spec)) {
        merged.business.specializations.push(spec);
      }
    }
    
    // Use first years in business found
    if (!merged.business.yearsInBusiness && result.business.yearsInBusiness) {
      merged.business.yearsInBusiness = result.business.yearsInBusiness;
    }
    
    // Merge certifications
    for (const cert of result.business.certifications) {
      if (!merged.business.certifications.includes(cert)) {
        merged.business.certifications.push(cert);
      }
    }
    
    // Merge areas served
    for (const area of result.business.areasServed) {
      if (!merged.business.areasServed.includes(area)) {
        merged.business.areasServed.push(area);
      }
    }
  }
  
  return merged;
}
