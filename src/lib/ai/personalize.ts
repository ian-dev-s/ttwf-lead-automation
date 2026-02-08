import type { Lead } from '@/types';
import { generateText } from 'ai';
import { aiConfigsCollection, aiConfigDoc, emailTemplatesCollection, teamSettingsDoc, aiKnowledgeItemsCollection, aiSampleResponsesCollection, leadDoc, messagesCollection, messageDoc } from '@/lib/firebase/collections';
import { MESSAGE_SYSTEM_PROMPT, generateMessagePrompt, generateFollowUpPrompt, getGuardrailsPrompt, buildEnhancedSystemPrompt } from './prompts';
import { defaultModel, getLanguageModel, type SimpleProvider } from './providers';

export interface PersonalizeOptions {
  teamId: string;
  lead: Lead;
  provider?: SimpleProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  guardrails?: Record<string, unknown>;
  templatePurpose?: 'outreach' | 'follow_up' | 're_engagement';
  previousMessage?: {
    content: string;
    subject?: string;
  };
}

export interface PersonalizedMessage {
  content: string;
  subject?: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

// Generate a personalized message for a lead (team-scoped)
export async function generatePersonalizedMessage(
  options: PersonalizeOptions
): Promise<PersonalizedMessage> {
  const {
    teamId,
    lead,
    provider = 'OPENROUTER',
    model,
    temperature = 0.7,
    maxTokens = 1000,
    guardrails = {},
    templatePurpose = 'outreach',
    previousMessage,
  } = options;

  // Get the active AI config from Firestore (team-scoped), or use defaults
  const activeConfigSnap = await aiConfigsCollection(teamId)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  const activeConfig = activeConfigSnap.empty
    ? null
    : { id: activeConfigSnap.docs[0].id, ...activeConfigSnap.docs[0].data() };

  const finalProvider = (activeConfig?.provider || provider) as SimpleProvider;
  const finalModel = activeConfig?.model || model || defaultModel;
  const finalTemperature = activeConfig?.temperature ?? temperature;
  const finalMaxTokens = activeConfig?.maxTokens ?? maxTokens;

  // Look up email template from Firestore (team-scoped)
  let systemPrompt = MESSAGE_SYSTEM_PROMPT;
  let templateGuardrails = guardrails;

  // Try default active template first, then any active template
  const defaultTemplateSnap = await emailTemplatesCollection(teamId)
    .where('purpose', '==', templatePurpose)
    .where('isActive', '==', true)
    .where('isDefault', '==', true)
    .limit(1)
    .get();

  let template: any = null;
  if (!defaultTemplateSnap.empty) {
    template = { id: defaultTemplateSnap.docs[0].id, ...defaultTemplateSnap.docs[0].data() };
  } else {
    const anyTemplateSnap = await emailTemplatesCollection(teamId)
      .where('purpose', '==', templatePurpose)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    if (!anyTemplateSnap.empty) {
      template = { id: anyTemplateSnap.docs[0].id, ...anyTemplateSnap.docs[0].data() };
    }
  }

  // Fetch AI training data (team-scoped)
  const [settingsSnap, knowledgeSnap, samplesSnap] = await Promise.all([
    teamSettingsDoc(teamId).get(),
    aiKnowledgeItemsCollection(teamId).get(),
    aiSampleResponsesCollection(teamId).get(),
  ]);

  const trainingSettings = settingsSnap.exists ? settingsSnap.data() : null;
  const knowledgeItems = knowledgeSnap.docs.map((d) => {
    const data = d.data();
    return { title: data.title, content: data.content };
  });
  const sampleResponses = samplesSnap.docs.map((d) => {
    const data = d.data();
    return { customerQuestion: data.customerQuestion, preferredResponse: data.preferredResponse };
  });

  // Build enhanced system prompt with template + training data
  systemPrompt = buildEnhancedSystemPrompt(template, {
    aiTone: trainingSettings?.aiTone,
    aiWritingStyle: trainingSettings?.aiWritingStyle,
    aiCustomInstructions: trainingSettings?.aiCustomInstructions,
    knowledgeItems,
    sampleResponses,
  });

  if (template) {
    // Merge template guardrails with provided guardrails
    templateGuardrails = {
      ...guardrails,
      ...(template.tone && { tone: template.tone }),
      ...(template.maxLength && { maxMessageLength: template.maxLength }),
      ...(template.mustInclude && template.mustInclude.length > 0 && { mustInclude: template.mustInclude }),
      ...(template.avoidTopics && template.avoidTopics.length > 0 && { avoidTopics: template.avoidTopics }),
    };
  }

  // Build the prompt
  const userPrompt = previousMessage
    ? generateFollowUpPrompt(lead, previousMessage.content, previousMessage.subject)
    : generateMessagePrompt(lead);
  const guardrailsAddition = getGuardrailsPrompt(templateGuardrails);
  const fullPrompt = userPrompt + guardrailsAddition;

  // Retry logic for network issues
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate the message using the AI SDK (team-scoped API key)
      const languageModel = await getLanguageModel(teamId, {
        provider: finalProvider,
        model: finalModel,
      });

      const result = await generateText({
        model: languageModel,
        system: systemPrompt,
        prompt: fullPrompt,
        temperature: finalTemperature,
        maxOutputTokens: finalMaxTokens,
      });

      // Parse the result
      let content = result.text.trim();
      let subject: string | undefined;

      // Extract subject line for emails
      const subjectMatch = content.match(/^Subject:\s*(.+?)[\n\r]/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        content = content.replace(/^Subject:\s*.+?[\n\r]+/i, '').trim();
      }

      // Update AI config usage stats
      if (activeConfig) {
        const configRef = aiConfigDoc(teamId, activeConfig.id);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { FieldValue } = require('firebase-admin/firestore');
        await configRef.update({
          requestsUsed: FieldValue.increment(1),
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
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (!isNetworkError) {
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
  teamId: string,
  leads: Lead[],
  options?: Partial<Omit<PersonalizeOptions, 'teamId' | 'lead'>>
): Promise<Map<string, PersonalizedMessage>> {
  const results = new Map<string, PersonalizedMessage>();

  for (const lead of leads) {
    try {
      const message = await generatePersonalizedMessage({
        teamId,
        lead,
        ...options,
      });
      results.set(lead.id, message);

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to generate message for lead ${lead.id}:`, error);
    }
  }

  return results;
}

// Regenerate a message with different parameters
export async function regenerateMessage(
  teamId: string,
  lead: Lead,
  previousContent: string,
  feedback?: string
): Promise<PersonalizedMessage> {
  const additionalPrompt = feedback
    ? `\n\nThe previous message was:\n"${previousContent}"\n\nUser feedback: ${feedback}\n\nPlease generate an improved version based on this feedback.`
    : `\n\nPlease generate a different version than this:\n"${previousContent}"`;

  return generatePersonalizedMessage({
    teamId,
    lead,
    guardrails: {
      additionalInstructions: additionalPrompt,
    },
  });
}

// Quick personalization without full AI (fallback)
export function quickPersonalize(lead: Lead): string {
  const greeting = 'Good day,';
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

The Team`;

  return template;
}

// Generate a follow-up message for a lead (team-scoped)
export async function generateFollowUpMessage(
  teamId: string,
  leadId: string,
  previousMessageId?: string
): Promise<{ id: string; content: string; subject?: string; status: string }> {
  const leadSnap = await leadDoc(teamId, leadId).get();

  if (!leadSnap.exists) {
    throw new Error(`Lead with id ${leadId} not found`);
  }

  const lead = { id: leadSnap.id, ...leadSnap.data()! } as Lead;

  let previousMessage: { content: string; subject?: string } | undefined;

  if (previousMessageId) {
    const msgSnap = await messageDoc(teamId, previousMessageId).get();

    if (!msgSnap.exists) {
      throw new Error(`Message with id ${previousMessageId} not found`);
    }

    const msgData = msgSnap.data()!;
    previousMessage = {
      content: msgData.content,
      subject: msgData.subject || undefined,
    };
  } else {
    const recentMsgSnap = await messagesCollection(teamId)
      .where('leadId', '==', leadId)
      .where('status', '==', 'SENT')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();

    if (recentMsgSnap.empty) {
      throw new Error(`No sent message found for lead ${leadId}`);
    }

    const recentMsg = recentMsgSnap.docs[0].data();
    previousMessage = {
      content: recentMsg.content,
      subject: recentMsg.subject || undefined,
    };
  }

  const personalizedMessage = await generatePersonalizedMessage({
    teamId,
    lead,
    templatePurpose: 'follow_up',
    previousMessage,
  });

  const now = new Date();
  const msgRef = messagesCollection(teamId).doc();
  await msgRef.set({
    leadId,
    type: 'EMAIL',
    content: personalizedMessage.content,
    subject: personalizedMessage.subject || null,
    status: 'DRAFT',
    sentAt: null,
    error: null,
    generatedBy: 'ai',
    aiProvider: personalizedMessage.provider,
    aiModel: personalizedMessage.model,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: msgRef.id,
    content: personalizedMessage.content,
    subject: personalizedMessage.subject,
    status: 'DRAFT',
  };
}
