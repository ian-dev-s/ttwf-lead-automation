// Client-safe AI constants (no server-side imports)

// Single provider type
export type SimpleProvider = 'OPENROUTER';

// Available models via OpenRouter
export const modelOptions = [
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'trinity/trinity-large-preview:free', label: 'Trinity Large Preview (Free)' },
];

// Default model
export const defaultModel = 'google/gemini-3-flash-preview';

// Provider display names
export const providerDisplayNames: Record<SimpleProvider, string> = {
  OPENROUTER: 'OpenRouter',
};
