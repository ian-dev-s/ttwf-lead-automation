/**
 * AI reply generation for inbound emails.
 *
 * Uses the same AI infrastructure as outbound message generation but with
 * a reply-specific system prompt and the incoming email as context.
 */

import { generateText } from 'ai';
import {
  aiConfigsCollection,
  aiConfigDoc,
  teamSettingsDoc,
  aiKnowledgeItemsCollection,
  aiSampleResponsesCollection,
} from '@/lib/firebase/collections';
import { REPLY_SYSTEM_PROMPT, generateReplyPrompt, buildEnhancedSystemPrompt } from './prompts';
import { defaultModel, getLanguageModel, type SimpleProvider } from './providers';

export interface InboundReplyParams {
  teamId: string;
  from: string;       // "Name <email>" or just email
  subject: string;
  bodyText: string;
  leadContext?: {
    businessName?: string;
    industry?: string;
    location?: string;
  } | null;
}

export interface InboundReplyResult {
  subject: string;
  content: string;
  provider: string;
  model: string;
}

/**
 * Generate an AI reply for an inbound email.
 */
export async function generateInboundReply(
  params: InboundReplyParams
): Promise<InboundReplyResult> {
  const { teamId, from, subject, bodyText, leadContext } = params;

  // Parse sender name from "Name <email>" format
  const nameMatch = from.match(/^(.+?)\s*<(.+?)>/);
  const fromName = nameMatch ? nameMatch[1].trim() : from;
  const fromEmail = nameMatch ? nameMatch[2].trim() : from;

  // Get active AI config
  const activeConfigSnap = await aiConfigsCollection(teamId)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  const activeConfig = activeConfigSnap.empty
    ? null
    : { id: activeConfigSnap.docs[0].id, ...activeConfigSnap.docs[0].data() };

  const finalProvider = (activeConfig?.provider || 'OPENROUTER') as SimpleProvider;
  const finalModel = activeConfig?.model || defaultModel;
  const finalTemperature = activeConfig?.temperature ?? 0.7;
  const finalMaxTokens = activeConfig?.maxTokens ?? 1000;

  // Fetch AI training data
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

  // Build enhanced system prompt with reply base + training data
  // We pass a synthetic "template" with our reply system prompt
  const systemPrompt = buildEnhancedSystemPrompt(
    { systemPrompt: REPLY_SYSTEM_PROMPT },
    {
      aiTone: trainingSettings?.aiTone,
      aiWritingStyle: trainingSettings?.aiWritingStyle,
      aiCustomInstructions: trainingSettings?.aiCustomInstructions,
      knowledgeItems,
      sampleResponses,
    }
  );

  // Build the user prompt
  const userPrompt = generateReplyPrompt({
    fromName,
    fromEmail,
    subject,
    bodyText,
    leadContext,
  });

  // Generate with retry
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const languageModel = await getLanguageModel(teamId, {
        provider: finalProvider,
        model: finalModel,
      });

      const result = await generateText({
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: finalTemperature,
        maxOutputTokens: finalMaxTokens,
      });

      let content = result.text.trim();
      let replySubject = `Re: ${subject}`;

      // Extract subject line if provided
      const subjectMatch = content.match(/^Subject:\s*(.+?)[\n\r]/i);
      if (subjectMatch) {
        replySubject = subjectMatch[1].trim();
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
        subject: replySubject,
        content,
        provider: finalProvider,
        model: finalModel,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isNetworkError =
        lastError.message.includes('socket') ||
        lastError.message.includes('TLS') ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('network');

      console.error(`AI reply generation attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries && isNetworkError) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (!isNetworkError) {
        break;
      }
    }
  }

  throw new Error(
    `Failed to generate reply: ${lastError?.message || 'Unknown error'}`
  );
}
