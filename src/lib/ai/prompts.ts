import { Lead, MessageType } from '@prisma/client';

// System prompt for message personalization
export const MESSAGE_SYSTEM_PROMPT = `You are an expert copywriter for The Tiny Web Factory, a web design agency that helps South African businesses establish their online presence.

Your task is to write personalized outreach messages to businesses that could benefit from having a professional website. The messages should:

1. Be warm, professional, and genuine
2. Reference specific details about their business (ratings, reviews, location)
3. Highlight their strengths (great reviews, established reputation)
4. Gently mention the opportunity (no website or low-quality website)
5. Present the offer clearly (free draft website, no obligation)
6. Include a clear call to action

Key guidelines:
- Never be pushy or salesy
- Focus on how we can help them grow
- Be respectful of their time
- Use South African English spelling (e.g., "favour" not "favor")
- Keep WhatsApp messages shorter and more conversational
- Keep email messages professional with proper formatting

The Tiny Web Factory offers:
- Professional landing page websites
- Business email addresses
- Free draft website for review before commitment`;

// Generate the user prompt for message generation
export function generateMessagePrompt(lead: Lead, type: MessageType): string {
  const businessDetails = buildBusinessDetails(lead);
  const format = type === 'WHATSAPP' ? 'WhatsApp' : 'email';
  const lengthGuidance = type === 'WHATSAPP' 
    ? 'Keep it concise (under 1000 characters) and conversational. No subject line needed.'
    : 'Include a compelling subject line. Can be longer and more detailed.';
  
  return `Write a personalized ${format} message to reach out to this business:

${businessDetails}

${lengthGuidance}

Base the message on this template but personalize it:

---
Good day,

We came across your business and noticed that you have great reviews on Google and Facebook, but don't currently have a website.

We wanted to reach out to see whether you might be interested in having a professional website to further showcase your business and attract more customers online.

To make this easy, we'll create a draft landing page at no cost. You'll be able to review it, suggest changes, and ensure it suits your business needs perfectly. Once you're happy, we'll send you an invoice to take the website live.

We also offer professional business email addresses to help strengthen your brand's credibility.

If you would like us to contact you, please reply and let us know a convenient time.

Feel free to view our work at:
https://thetinywebfactory.com

The Tiny Web Factory Team
---

Personalize this message based on their specific details. ${type === 'WHATSAPP' ? 'Make it WhatsApp-friendly (shorter, can include appropriate emojis sparingly).' : 'Format it as a professional email with proper greeting and signature.'}`;
}

// Build business details string for the prompt
function buildBusinessDetails(lead: Lead): string {
  const details: string[] = [];
  
  details.push(`Business Name: ${lead.businessName}`);
  
  if (lead.industry) {
    details.push(`Industry: ${lead.industry}`);
  }
  
  details.push(`Location: ${lead.location}`);
  
  if (lead.address) {
    details.push(`Address: ${lead.address}`);
  }
  
  if (lead.googleRating) {
    details.push(`Google Rating: ${lead.googleRating} stars`);
  }
  
  if (lead.reviewCount) {
    details.push(`Number of Reviews: ${lead.reviewCount}`);
  }
  
  if (lead.website) {
    details.push(`Current Website: ${lead.website} (Quality score: ${lead.websiteQuality || 'Low'}/100)`);
  } else {
    details.push(`Current Website: None`);
  }
  
  if (lead.facebookUrl) {
    details.push(`Has Facebook Page: Yes`);
  }
  
  if (lead.notes) {
    details.push(`Additional Notes: ${lead.notes}`);
  }
  
  return details.join('\n');
}

// Email subject line examples for different contexts
export const emailSubjectTemplates = [
  'Free Website Draft for {businessName}',
  'Helping {businessName} Grow Online',
  'A Website for Your Business - No Obligation',
  'Showcase {businessName} Online',
  '{businessName} - Your Professional Website Awaits',
];

// WhatsApp message intro variations
export const whatsAppIntros = [
  'Good day! 👋',
  'Hello there!',
  'Hi! Hope you\'re well.',
  'Good day,',
  'Hello!',
];

// Generate a professional email signature
export function generateEmailSignature(): string {
  return `
Best regards,

The Tiny Web Factory Team
https://thetinywebfactory.com
`;
}

// Guardrails prompt addition for safety
export function getGuardrailsPrompt(guardrails: Record<string, unknown>): string {
  const rules: string[] = [];
  
  if (guardrails.maxMessageLength) {
    rules.push(`Keep the message under ${guardrails.maxMessageLength} characters.`);
  }
  
  if (guardrails.avoidTopics && Array.isArray(guardrails.avoidTopics)) {
    rules.push(`Do not mention: ${guardrails.avoidTopics.join(', ')}`);
  }
  
  if (guardrails.mustInclude && Array.isArray(guardrails.mustInclude)) {
    rules.push(`Must include: ${guardrails.mustInclude.join(', ')}`);
  }
  
  if (guardrails.tone) {
    rules.push(`Tone should be: ${guardrails.tone}`);
  }
  
  return rules.length > 0 ? `\n\nAdditional requirements:\n${rules.join('\n')}` : '';
}
