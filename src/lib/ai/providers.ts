import { createOpenAI } from '@ai-sdk/openai';
import { teamApiKeysCollection } from '@/lib/firebase/collections';
import { decrypt, maskSecret } from '@/lib/crypto';

// Re-export client-safe constants
export { modelOptions, defaultModel, providerDisplayNames } from './constants';
export type { SimpleProvider } from './constants';
import type { SimpleProvider } from './constants';

// AI Provider configurations
export interface ProviderConfig {
  provider: SimpleProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Provider configuration (static metadata only)
export const providerConfigs: Record<SimpleProvider, {
  name: string;
  baseURL: string;
  setupUrl: string;
}> = {
  OPENROUTER: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    setupUrl: 'https://openrouter.ai/keys',
  },
};

/**
 * Get the decrypted API key for a provider from Firestore.
 */
export async function getProviderApiKey(teamId: string, provider: string): Promise<string | null> {
  const snapshot = await teamApiKeysCollection(teamId)
    .where('provider', '==', provider)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const apiKeyDoc = snapshot.docs[0].data();

  try {
    return decrypt(apiKeyDoc.encryptedKey);
  } catch {
    console.error(`Failed to decrypt API key for provider ${provider}`);
    return null;
  }
}

/**
 * Get provider instance using team's API key from Firestore.
 */
export async function getProvider(teamId: string, provider: SimpleProvider) {
  const config = providerConfigs[provider];
  const apiKey = await getProviderApiKey(teamId, provider);
  
  if (!apiKey) {
    throw new Error(`No API key configured for ${config.name}. Go to Settings > API Keys to add one.`);
  }
  
  return createOpenAI({
    apiKey,
    baseURL: config.baseURL,
  });
}

/**
 * Get language model for a provider (team-scoped).
 */
export async function getLanguageModel(teamId: string, config: ProviderConfig) {
  const provider = await getProvider(teamId, config.provider);
  return provider(config.model);
}

/**
 * Check if a provider is available (has API key configured) for a team.
 */
export async function isProviderAvailable(teamId: string, provider: string): Promise<boolean> {
  const snapshot = await teamApiKeysCollection(teamId)
    .where('provider', '==', provider)
    .where('isActive', '==', true)
    .limit(1)
    .get();
  return !snapshot.empty;
}

/**
 * Get masked token for display (never returns raw key).
 */
export async function getMaskedToken(teamId: string, provider: string): Promise<string | null> {
  const apiKey = await getProviderApiKey(teamId, provider);
  return maskSecret(apiKey);
}

/**
 * Get all available providers for a team.
 */
export async function getAvailableProviders(teamId: string): Promise<string[]> {
  const snapshot = await teamApiKeysCollection(teamId)
    .where('isActive', '==', true)
    .get();
  return snapshot.docs.map(d => d.data().provider);
}

/**
 * Get provider status (for settings page).
 */
export async function getProviderStatus(teamId: string, provider: SimpleProvider) {
  const config = providerConfigs[provider];
  const available = await isProviderAvailable(teamId, provider);
  const maskedToken = await getMaskedToken(teamId, provider);
  
  return {
    provider,
    name: config.name,
    isAvailable: available,
    maskedToken,
    setupUrl: config.setupUrl,
  };
}
