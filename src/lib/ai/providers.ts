import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { AIProvider } from '@prisma/client';

// AI Provider configurations
export interface ProviderConfig {
  provider: AIProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Default models for each provider
export const defaultModels: Record<AIProvider, string> = {
  OPENAI: 'gpt-4o-mini',
  ANTHROPIC: 'claude-3-haiku-20240307',
  GOOGLE: 'gemini-1.5-flash',
};

// Create OpenAI provider instance
export function getOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return createOpenAI({ apiKey });
}

// Create Anthropic provider instance
export function getAnthropicProvider() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return createAnthropic({ apiKey });
}

// Create Google AI provider instance
export function getGoogleProvider() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not configured');
  }
  return createGoogleGenerativeAI({ apiKey });
}

// Get the language model for a specific provider
export function getLanguageModel(config: ProviderConfig) {
  const { provider, model } = config;
  
  switch (provider) {
    case 'OPENAI':
      return getOpenAIProvider()(model);
    case 'ANTHROPIC':
      return getAnthropicProvider()(model);
    case 'GOOGLE':
      return getGoogleProvider()(model);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// Check if a provider is available (has API key configured)
export function isProviderAvailable(provider: AIProvider): boolean {
  switch (provider) {
    case 'OPENAI':
      return !!process.env.OPENAI_API_KEY;
    case 'ANTHROPIC':
      return !!process.env.ANTHROPIC_API_KEY;
    case 'GOOGLE':
      return !!process.env.GOOGLE_AI_API_KEY;
    default:
      return false;
  }
}

// Get all available providers
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = ['OPENAI', 'ANTHROPIC', 'GOOGLE'];
  return providers.filter(isProviderAvailable);
}

// Provider display names
export const providerDisplayNames: Record<AIProvider, string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic (Claude)',
  GOOGLE: 'Google (Gemini)',
};

// Model options for each provider
export const modelOptions: Record<AIProvider, { value: string; label: string }[]> = {
  OPENAI: [
    { value: 'gpt-4o', label: 'GPT-4o (Most capable)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast & affordable)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Budget)' },
  ],
  ANTHROPIC: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Best)' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fast)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Most capable)' },
  ],
  GOOGLE: [
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Fast)' },
    { value: 'gemini-pro', label: 'Gemini Pro' },
  ],
};
