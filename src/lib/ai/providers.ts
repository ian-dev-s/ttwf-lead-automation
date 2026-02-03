import { createOpenAI } from '@ai-sdk/openai';

// Single provider - OpenRouter
export type SimpleProvider = 'OPENROUTER';

// AI Provider configurations
export interface ProviderConfig {
  provider: SimpleProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Available models via OpenRouter
export const modelOptions = [
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'trinity/trinity-large-preview:free', label: 'Trinity Large Preview (Free)' },
];

// Default model
export const defaultModel = 'google/gemini-3-flash-preview';

// Provider configuration
export const providerConfigs: Record<SimpleProvider, {
  name: string;
  envKey: string;
  baseURL: string;
  setupUrl: string;
}> = {
  OPENROUTER: {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    setupUrl: 'https://openrouter.ai/keys',
  },
};

// Get provider instance
export function getProvider(provider: SimpleProvider) {
  const config = providerConfigs[provider];
  const apiKey = process.env[config.envKey];
  
  if (!apiKey) {
    throw new Error(`${config.envKey} is not configured. Set it up at ${config.setupUrl}`);
  }
  
  return createOpenAI({
    apiKey,
    baseURL: config.baseURL,
  });
}

// Get language model for a provider
export function getLanguageModel(config: ProviderConfig) {
  const provider = getProvider(config.provider);
  return provider(config.model);
}

// Check if a provider is available (has API key configured)
export function isProviderAvailable(provider: SimpleProvider): boolean {
  const config = providerConfigs[provider];
  return !!process.env[config.envKey];
}

// Get masked token for display
export function getMaskedToken(provider: SimpleProvider): string | null {
  const config = providerConfigs[provider];
  const token = process.env[config.envKey];
  
  if (!token) return null;
  
  // Show first 8 and last 4 characters
  if (token.length > 12) {
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  }
  return '••••••••';
}

// Get all available providers
export function getAvailableProviders(): SimpleProvider[] {
  const providers: SimpleProvider[] = ['OPENROUTER'];
  return providers.filter(isProviderAvailable);
}

// Get provider status (for settings page)
export function getProviderStatus(provider: SimpleProvider) {
  const config = providerConfigs[provider];
  const isAvailable = isProviderAvailable(provider);
  const maskedToken = getMaskedToken(provider);
  
  return {
    provider,
    name: config.name,
    isAvailable,
    maskedToken,
    setupUrl: config.setupUrl,
    envKey: config.envKey,
  };
}

// Provider display names
export const providerDisplayNames: Record<SimpleProvider, string> = {
  OPENROUTER: 'OpenRouter',
};
