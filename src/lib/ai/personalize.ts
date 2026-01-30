import { Lead, MessageType } from '@prisma/client';
import { generateText } from 'ai';
import { prisma } from '../db';
import { MESSAGE_SYSTEM_PROMPT, generateMessagePrompt, getGuardrailsPrompt } from './prompts';
import { defaultModel, getLanguageModel, type SimpleProvider } from './providers';

export interface PersonalizeOptions {
  lead: Lead;
  messageType: MessageType;
  provider?: SimpleProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  guardrails?: Record<string, unknown>;
}

export interface PersonalizedMessage {
  content: string;
  subject?: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

// Generate a personalized message for a lead
export async function generatePersonalizedMessage(
  options: PersonalizeOptions
): Promise<PersonalizedMessage> {
  const {
    lead,
    messageType,
    provider = 'OPENROUTER',
    model,
    temperature = 0.7,
    maxTokens = 1000,
    guardrails = {},
  } = options;

  // Get the active AI config from database, or use defaults
  const activeConfig = await prisma.aIConfig.findFirst({
    where: { isActive: true },
  });

  const finalProvider = (activeConfig?.provider || provider) as SimpleProvider;
  const finalModel = activeConfig?.model || model || defaultModel;
  const finalTemperature = activeConfig?.temperature ?? temperature;
  const finalMaxTokens = activeConfig?.maxTokens ?? maxTokens;

  // Build the prompt
  const userPrompt = generateMessagePrompt(lead, messageType);
  const guardrailsAddition = getGuardrailsPrompt(guardrails);
  const fullPrompt = userPrompt + guardrailsAddition;

  // Retry logic for network issues
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate the message using the AI SDK
      const languageModel = getLanguageModel({
        provider: finalProvider,
        model: finalModel,
      });

      const result = await generateText({
        model: languageModel,
        system: MESSAGE_SYSTEM_PROMPT,
        prompt: fullPrompt,
        temperature: finalTemperature,
        maxOutputTokens: finalMaxTokens,
      });

      // Parse the result
      let content = result.text.trim();
      let subject: string | undefined;

      // Extract subject line for emails
      if (messageType === 'EMAIL') {
        const subjectMatch = content.match(/^Subject:\s*(.+?)[\n\r]/i);
        if (subjectMatch) {
          subject = subjectMatch[1].trim();
          content = content.replace(/^Subject:\s*.+?[\n\r]+/i, '').trim();
        }
      }

      // Update AI config usage stats
      if (activeConfig) {
        await prisma.aIConfig.update({
          where: { id: activeConfig.id },
          data: {
            requestsUsed: { increment: 1 },
          },
        });
      }

      return {
        content,
        subject,
        provider: finalProvider,
        model: finalModel,
        tokensUsed: result.usage?.totalTokens,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isNetworkError = lastError.message.includes('socket') || 
                            lastError.message.includes('TLS') ||
                            lastError.message.includes('ECONNREFUSED') ||
                            lastError.message.includes('network');
      
      console.error(`AI generation attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt < maxRetries && isNetworkError) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (!isNetworkError) {
        // Non-network error, don't retry
        break;
      }
    }
  }

  console.error('All AI generation attempts failed:', lastError);
  throw new Error(
    `Failed to generate message: Failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

// Generate messages in batch for multiple leads
export async function generateBatchMessages(
  leads: Lead[],
  messageType: MessageType,
  options?: Partial<PersonalizeOptions>
): Promise<Map<string, PersonalizedMessage>> {
  const results = new Map<string, PersonalizedMessage>();

  // Process leads sequentially to respect rate limits
  for (const lead of leads) {
    try {
      const message = await generatePersonalizedMessage({
        lead,
        messageType,
        ...options,
      });
      results.set(lead.id, message);

      // Add a small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to generate message for lead ${lead.id}:`, error);
    }
  }

  return results;
}

// Regenerate a message with different parameters
export async function regenerateMessage(
  lead: Lead,
  messageType: MessageType,
  previousContent: string,
  feedback?: string
): Promise<PersonalizedMessage> {
  const additionalPrompt = feedback
    ? `\n\nThe previous message was:\n"${previousContent}"\n\nUser feedback: ${feedback}\n\nPlease generate an improved version based on this feedback.`
    : `\n\nPlease generate a different version than this:\n"${previousContent}"`;

  return generatePersonalizedMessage({
    lead,
    messageType,
    guardrails: {
      additionalInstructions: additionalPrompt,
    },
  });
}

// Quick personalization without full AI (fallback)
export function quickPersonalize(lead: Lead, messageType: MessageType): string {
  const greeting = messageType === 'WHATSAPP' ? 'Good day! 👋' : 'Good day,';
  const ratingMention =
    lead.googleRating && lead.reviewCount
      ? `We noticed ${lead.businessName} has an excellent ${lead.googleRating}-star rating with ${lead.reviewCount} reviews on Google - that's fantastic!`
      : `We came across ${lead.businessName} and were impressed by your business.`;

  const websiteMention = lead.website
    ? `We noticed your current website might benefit from a refresh.`
    : `We noticed you don't currently have a website.`;

  const template = `${greeting}

${ratingMention}

${websiteMention}

We wanted to reach out to see whether you might be interested in having a professional website to further showcase your business and attract more customers online.

To make this easy, we'll create a draft landing page at no cost. You'll be able to review it, suggest changes, and ensure it suits your business needs perfectly. Once you're happy, we'll send you an invoice to take the website live.

We also offer professional business email addresses to help strengthen your brand's credibility.

If you would like us to contact you, please reply and let us know a convenient time.

Feel free to view our work at:
https://thetinywebfactory.com

The Tiny Web Factory Team`;

  if (messageType === 'WHATSAPP') {
    // Shorter version for WhatsApp
    return `${greeting}

We noticed ${lead.businessName} ${lead.googleRating ? `has great reviews (${lead.googleRating}⭐)` : 'is doing great work'} but ${lead.website ? 'could use a website refresh' : "doesn't have a website yet"}.

We'd love to create a FREE draft landing page for you - no obligation! Just review it and let us know what you think.

Check out our work: https://thetinywebfactory.com

Interested? Just reply and we'll get started! 🚀

- The Tiny Web Factory Team`;
  }

  return template;
}
