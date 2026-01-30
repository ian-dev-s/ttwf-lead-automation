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
  GITHUB: 'gpt-4o-mini',
  CURSOR: 'cursor-small',
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

// Create GitHub Models provider instance (OpenAI-compatible API)
// Get your token at: https://github.com/settings/tokens (needs "models:read" permission)
export function getGitHubProvider() {
  const apiKey = process.env.GITHUB_TOKEN;
  if (!apiKey) {
    throw new Error('GITHUB_TOKEN is not configured. Get one at https://github.com/settings/tokens');
  }
  // GitHub Models API is OpenAI-compatible
  return createOpenAI({
    apiKey,
    baseURL: 'https://models.inference.ai.azure.com',
  });
}

// Create Cursor AI provider instance (OpenAI-compatible API)
// Uses your Cursor API key from the Cursor IDE settings
export function getCursorProvider() {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY is not configured. Find it in Cursor IDE settings.');
  }
  // Cursor uses an OpenAI-compatible API
  return createOpenAI({
    apiKey,
    baseURL: 'https://api.cursor.sh/v1',
  });
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
    case 'GITHUB':
      return getGitHubProvider()(model);
    case 'CURSOR':
      return getCursorProvider()(model);
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
    case 'GITHUB':
      return !!process.env.GITHUB_TOKEN;
    case 'CURSOR':
      return !!process.env.CURSOR_API_KEY;
    default:
      return false;
  }
}

// Get all available providers
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'GITHUB', 'CURSOR'];
  return providers.filter(isProviderAvailable);
}

// Provider display names
export const providerDisplayNames: Record<AIProvider, string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic (Claude)',
  GOOGLE: 'Google (Gemini)',
  GITHUB: 'GitHub Copilot Models',
  CURSOR: 'Cursor AI',
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
  GITHUB: [
    { value: 'gpt-4o', label: 'GPT-4o via GitHub' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini via GitHub' },
    { value: 'o1-preview', label: 'o1-preview (Reasoning)' },
    { value: 'o1-mini', label: 'o1-mini (Fast reasoning)' },
    { value: 'Phi-3.5-MoE-instruct', label: 'Phi-3.5 MoE (Microsoft)' },
    { value: 'Phi-3.5-mini-instruct', label: 'Phi-3.5 Mini (Microsoft)' },
    { value: 'AI21-Jamba-1.5-Large', label: 'Jamba 1.5 Large (AI21)' },
    { value: 'AI21-Jamba-1.5-Mini', label: 'Jamba 1.5 Mini (AI21)' },
    { value: 'Meta-Llama-3.1-405B-Instruct', label: 'Llama 3.1 405B (Meta)' },
    { value: 'Meta-Llama-3.1-70B-Instruct', label: 'Llama 3.1 70B (Meta)' },
    { value: 'Meta-Llama-3.1-8B-Instruct', label: 'Llama 3.1 8B (Meta)' },
    { value: 'Mistral-large-2407', label: 'Mistral Large' },
    { value: 'Mistral-Nemo', label: 'Mistral Nemo' },
    { value: 'Cohere-command-r-plus-08-2024', label: 'Command R+ (Cohere)' },
    { value: 'Cohere-command-r-08-2024', label: 'Command R (Cohere)' },
  ],
  CURSOR: [
    { value: 'cursor-small', label: 'Cursor Small (Fast)' },
    { value: 'gpt-4', label: 'GPT-4 via Cursor' },
    { value: 'gpt-4o', label: 'GPT-4o via Cursor' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 via Cursor' },
    { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet via Cursor' },
  ],
};
