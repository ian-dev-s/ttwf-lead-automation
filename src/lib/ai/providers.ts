import { createOpenAI } from '@ai-sdk/openai';

// Simplified provider type - only GitHub and Cursor
export type SimpleProvider = 'GITHUB' | 'CURSOR';

// AI Provider configurations
export interface ProviderConfig {
  provider: SimpleProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Available models - same for both providers
export const modelOptions = [
  { value: 'claude-4.5-haiku', label: 'Claude 4.5 Haiku' },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
];

// Default model
export const defaultModel = 'claude-4.5-haiku';

// Provider configurations
export const providerConfigs: Record<SimpleProvider, {
  name: string;
  envKey: string;
  baseURL: string;
  tokenPrefix: string;
  setupUrl: string;
}> = {
  GITHUB: {
    name: 'GitHub Copilot',
    envKey: 'GITHUB_TOKEN',
    baseURL: 'https://models.inference.ai.azure.com',
    tokenPrefix: 'ghp_',
    setupUrl: 'https://github.com/settings/tokens',
  },
  CURSOR: {
    name: 'Cursor AI',
    envKey: 'CURSOR_API_KEY',
    baseURL: 'https://api.cursor.sh/v1',
    tokenPrefix: '',
    setupUrl: 'https://cursor.sh/settings',
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
  
  // Show first 4 and last 4 characters
  if (token.length > 12) {
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  }
  return '••••••••';
}

// Get all available providers
export function getAvailableProviders(): SimpleProvider[] {
  const providers: SimpleProvider[] = ['GITHUB', 'CURSOR'];
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
  GITHUB: 'GitHub Copilot',
  CURSOR: 'Cursor AI',
};
