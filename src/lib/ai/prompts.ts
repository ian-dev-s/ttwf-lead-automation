import type { Lead } from '@/types';

// System prompt for message personalization — follows the SPEAR framework
export const MESSAGE_SYSTEM_PROMPT = `You write outreach emails for The Tiny Web Factory, a web design agency helping South African small businesses get online.

Follow the SPEAR framework strictly:
- SHORT: Keep the email body under 100 words. No long paragraphs — 2-3 short paragraphs max.
- PERSONAL: Mention the business by name. Reference something specific (their Google rating, reviews, industry, location). Never send anything that reads like a mass email.
- EXPECTS A REPLY: Always end with a casual, low-pressure question that invites a response (e.g., "Would you be keen?" or "Mind if we put something together for you?").

Tone guidelines:
- Casual and friendly — like messaging someone you know, not writing a corporate letter
- Never pushy, salesy, or overly formal
- Use South African English spelling (e.g., "favour", "colour")
- For EMAIL messages: Use HTML formatting (NOT markdown). Use <p>, <br>, <strong>, <em>, <a href="..."> tags.

What The Tiny Web Factory offers:
- Free draft landing page (no obligation)
- Professional business email addresses
- Website: https://thetinywebfactory.com`;

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
  
  return `Write a short, personalized ${format} to this business using the SPEAR framework (Short, Personal, Expects A Reply):

${businessDetails}

${formatGuidance}

Use this as a loose guide for structure — but keep it shorter and more personal:

---
Hey [Name],

Saw your [specific detail] — really impressive! Noticed you don't have a website yet though.

We'd love to put together a free draft landing page for you — zero obligation, just to show you what's possible.

Keen to have a look?

Cheers,
The Tiny Web Factory Team
https://thetinywebfactory.com
---

IMPORTANT: Keep the email body under 100 words. End with a casual question. Use their actual business details. Format as HTML (not markdown).`;
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
  
  return `Write a short follow-up ${format} to this business using the SPEAR framework (Short, Personal, Expects A Reply):

${businessDetails}

${previousSubjectText}Previous message sent:
---
${previousMessageContent}
---

${formatGuidance}

Follow-up guidelines:
- Keep it VERY short — under 60 words for the body
- Nod to the previous message casually (don't repeat it)
- Acknowledge they're busy — no guilt-tripping
- Remind them of the free draft offer in one line
- End with a simple yes/no question (e.g., "Still interested?" or "Want us to go ahead?")
- Casual, friendly tone — not corporate or desperate
- Format as HTML (not markdown).`;
}

// ─── Inbound Reply Prompts ─────────────────────────────────

export const REPLY_SYSTEM_PROMPT = `You reply to incoming emails on behalf of The Tiny Web Factory.

Follow the SPEAR framework:
- SHORT: Keep replies concise — match or be shorter than the incoming message. No essays.
- PERSONAL: Reference what they actually asked or said. Don't give generic answers.
- EXPECTS A REPLY: End with a question or clear next step that keeps the conversation going.

Tone:
- Friendly and conversational — not corporate or stiff
- Helpful and direct — answer their question first, then offer more
- Use South African English spelling
- For EMAIL messages: Use HTML formatting (NOT markdown). Use <p>, <br>, <strong>, <em>, <a href="..."> tags.
- Do NOT use markdown syntax like **bold** or [link](url).`;

/**
 * Generate a user prompt for replying to an inbound email.
 */
export function generateReplyPrompt(params: {
  fromName: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  leadContext?: {
    businessName?: string;
    industry?: string;
    location?: string;
  } | null;
}): string {
  const { fromName, fromEmail, subject, bodyText, leadContext } = params;

  let contextSection = '';
  if (leadContext) {
    const details: string[] = [];
    if (leadContext.businessName) details.push(`Business: ${leadContext.businessName}`);
    if (leadContext.industry) details.push(`Industry: ${leadContext.industry}`);
    if (leadContext.location) details.push(`Location: ${leadContext.location}`);
    if (details.length > 0) {
      contextSection = `\nKnown information about the sender:\n${details.join('\n')}\n`;
    }
  }

  return `Write a short, friendly reply to this email using the SPEAR framework (Short, Personal, Expects A Reply):

From: ${fromName} <${fromEmail}>
Subject: ${subject}
${contextSection}
Email content:
---
${bodyText}
---

Include a subject line on the first line like "Subject: Re: ${subject}".
IMPORTANT: Format the body using HTML tags (NOT markdown). Use:
- <p>...</p> for paragraphs
- <br> for line breaks within paragraphs
- <strong>...</strong> for bold text
- <em>...</em> for italic text
- <a href="https://...">link text</a> for links
Do NOT use markdown syntax like **bold** or [link](url).

Keep it short — answer their question directly, then end with a question to keep the conversation going. Casual and friendly tone, not corporate.`;
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
