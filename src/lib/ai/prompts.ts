import type { Lead } from '@/types';

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
- For EMAIL messages: Use HTML formatting (NOT markdown). Use <p>, <br>, <strong>, <em>, <a href="..."> tags.

The Tiny Web Factory offers:
- Professional landing page websites
- Business email addresses
- Free draft website for review before commitment`;

// Generate the user prompt for message generation
export function generateMessagePrompt(lead: Lead): string {
  const businessDetails = buildBusinessDetails(lead);
  const format = 'email';
  
  const formatGuidance = `Include a compelling subject line on the first line like "Subject: Your Subject Here".
IMPORTANT: Format the body using HTML tags (NOT markdown). Use:
- <p>...</p> for paragraphs
- <br> for line breaks within paragraphs
- <strong>...</strong> for bold text
- <em>...</em> for italic text
- <a href="https://...">link text</a> for links
Do NOT use markdown syntax like **bold** or [link](url).`;
  
  return `Write a personalized ${format} message to reach out to this business:

${businessDetails}

${formatGuidance}

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

Personalize this message based on their specific details. Format it as a professional HTML email with proper greeting and signature. Remember: Use HTML tags, NOT markdown.`;
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

// Generate follow-up prompt for subsequent outreach
export function generateFollowUpPrompt(
  lead: Lead,
  previousMessageContent: string,
  previousMessageSubject?: string
): string {
  const businessDetails = buildBusinessDetails(lead);
  const format = 'email';
  
  const formatGuidance = `Include a compelling subject line on the first line like "Subject: Your Subject Here".
IMPORTANT: Format the body using HTML tags (NOT markdown). Use:
- <p>...</p> for paragraphs
- <br> for line breaks within paragraphs
- <strong>...</strong> for bold text
- <em>...</em> for italic text
- <a href="https://...">link text</a> for links
Do NOT use markdown syntax like **bold** or [link](url).`;
  
  const previousSubjectText = previousMessageSubject 
    ? `Previous subject: "${previousMessageSubject}"\n`
    : '';
  
  return `Write a polite follow-up ${format} message to this business:

${businessDetails}

${previousSubjectText}Previous message sent:
---
${previousMessageContent}
---

${formatGuidance}

Guidelines for the follow-up:
- Reference the previous outreach naturally without repeating it verbatim
- Be shorter and more concise than the initial outreach
- Maintain professionalism and warmth
- Gently remind them of the offer without being pushy
- Keep the tone consistent with the previous message
- Format it as a professional HTML email with proper greeting and signature. Remember: Use HTML tags, NOT markdown.`;
}

// Type for template data (replaces EmailTemplate from Prisma)
interface EmailTemplateData {
  systemPrompt: string;
  tone?: string | null;
  maxLength?: number | null;
  mustInclude?: string[];
  avoidTopics?: string[];
  bodyTemplate?: string | null;
}

// Build system prompt from EmailTemplate
export function buildSystemPromptFromTemplate(template: EmailTemplateData): string {
  let systemPrompt = template.systemPrompt;
  
  // Add guardrails from template fields
  const guardrails: string[] = [];
  
  if (template.tone) {
    guardrails.push(`Tone: ${template.tone}`);
  }
  
  if (template.maxLength) {
    guardrails.push(`Maximum length: ${template.maxLength} characters`);
  }
  
  if (template.mustInclude && template.mustInclude.length > 0) {
    guardrails.push(`Must include: ${template.mustInclude.join(', ')}`);
  }
  
  if (template.avoidTopics && template.avoidTopics.length > 0) {
    guardrails.push(`Avoid topics: ${template.avoidTopics.join(', ')}`);
  }
  
  if (template.bodyTemplate) {
    guardrails.push(`Base template to personalize from:\n${template.bodyTemplate}`);
  }
  
  if (guardrails.length > 0) {
    systemPrompt += '\n\nAdditional requirements:\n' + guardrails.join('\n');
  }
  
  return systemPrompt;
}

// Enhanced system prompt that incorporates AI training data
export function buildEnhancedSystemPrompt(
  template: EmailTemplateData | null,
  training: {
    aiTone?: string | null;
    aiWritingStyle?: string | null;
    aiCustomInstructions?: string | null;
    knowledgeItems?: { title: string; content: string }[];
    sampleResponses?: { customerQuestion: string; preferredResponse: string }[];
  }
): string {
  // Start with template system prompt or default
  let systemPrompt = template
    ? buildSystemPromptFromTemplate(template)
    : MESSAGE_SYSTEM_PROMPT;

  // Add AI personality settings
  const personality: string[] = [];
  
  if (training.aiTone) {
    personality.push(`Tone: ${training.aiTone}`);
  }
  
  if (training.aiWritingStyle) {
    personality.push(`Writing style: ${training.aiWritingStyle}`);
  }
  
  if (personality.length > 0) {
    systemPrompt += '\n\nAI Personality:\n' + personality.join('\n');
  }

  // Add custom instructions
  if (training.aiCustomInstructions) {
    systemPrompt += '\n\nCustom Instructions:\n' + training.aiCustomInstructions;
  }

  // Add knowledge base
  if (training.knowledgeItems && training.knowledgeItems.length > 0) {
    systemPrompt += '\n\nBusiness Knowledge Base (use this information to answer questions and personalize messages):';
    for (const item of training.knowledgeItems) {
      systemPrompt += `\n\n### ${item.title}\n${item.content}`;
    }
  }

  // Add sample responses
  if (training.sampleResponses && training.sampleResponses.length > 0) {
    systemPrompt += '\n\nSample Responses (use these as style guides for how to respond):';
    for (const sample of training.sampleResponses) {
      systemPrompt += `\n\nCustomer: "${sample.customerQuestion}"\nPreferred Response: "${sample.preferredResponse}"`;
    }
  }

  return systemPrompt;
}
