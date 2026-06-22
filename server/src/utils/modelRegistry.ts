import type { LLMModel } from '../types.js';

/** UI model id → provider API model id */
export const OPENAI_API_MODELS: Partial<Record<LLMModel, string>> = {
  'gpt-5': 'gpt-4o',
  'gpt-5.1': 'gpt-4o',
  'gpt-5.2': 'gpt-4o',
  'gpt-5.3': 'gpt-4o',
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.5': 'gpt-5.5',
  'gpt-5.5-pro': 'gpt-5.5-pro',
  'gpt-4.1': 'gpt-4.1',
  'gpt-4.1-mini': 'gpt-4.1-mini',
  'gpt-4.1-nano': 'gpt-4.1-nano',
  'o3': 'o3',
  'o4-mini': 'o4-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4': 'gpt-4o-mini',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
};

export const GEMINI_API_MODELS: Partial<Record<LLMModel, string>> = {
  'gemini-2.0-latest': 'gemini-3.5-flash',
  'gemini-3.0': 'gemini-3.5-flash',
  'gemini-3.1': 'gemini-3.1-pro-preview',
  'gemini-3.1-flash': 'gemini-3.5-flash',
  'gemini-3.5-flash': 'gemini-3.5-flash',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-lite': 'gemini-2.5-flash-lite',
  'auto': 'gemini-2.5-flash-lite',
  'gemini-pro': 'gemini-2.5-pro',
  'gemini-pro-vision': 'gemini-2.5-pro',
};

export const CLAUDE_API_MODELS: Partial<Record<LLMModel, string>> = {
  'claude-4.8-opus': 'claude-opus-4-8',
  'claude-4.7-opus': 'claude-opus-4-7',
  'claude-4.6-sonnet': 'claude-sonnet-4-6',
  'claude-4.6-opus': 'claude-opus-4-6',
  'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
  'claude-4.5-opus': 'claude-opus-4-5-20251101',
  'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
  'claude-4-sonnet': 'claude-sonnet-4-20250514',
  'claude-4-opus': 'claude-opus-4-20250514',
  'claude-4.1-opus': 'claude-opus-4-1-20250805',
  'claude-3-haiku': 'claude-haiku-4-5-20251001',
};

export const GROK_API_MODELS: Partial<Record<LLMModel, string>> = {
  'grok-4.3': 'grok-4.3',
  'grok-4.20': 'grok-4.20',
  'grok-4-heavy': 'grok-4.3',
  'grok-4-fast': 'grok-4.3',
  'grok-code-fast-1': 'grok-build-0.1',
  'grok-3': 'grok-4.3',
  'grok-3-mini': 'grok-4.3',
  'grok-beta': 'grok-4.3',
};

export const NEW_MODEL_IDS: LLMModel[] = [
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.5-pro',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o3',
  'o4-mini',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'claude-4.8-opus',
  'claude-4.7-opus',
  'grok-4.3',
  'grok-4.20',
];

export function isOpenAIModel(model: LLMModel): boolean {
  return model in OPENAI_API_MODELS;
}

export function isGeminiModel(model: LLMModel): boolean {
  return model in GEMINI_API_MODELS;
}

export function isClaudeModel(model: LLMModel): boolean {
  return model in CLAUDE_API_MODELS;
}

export function isGrokModel(model: LLMModel): boolean {
  return model in GROK_API_MODELS;
}

export function resolveOpenAIModel(model: LLMModel): string {
  return OPENAI_API_MODELS[model] ?? 'gpt-4o-mini';
}

export function resolveGeminiModel(model: LLMModel): string {
  return GEMINI_API_MODELS[model] ?? 'gemini-2.5-flash-lite';
}

export function resolveClaudeModel(model: LLMModel): string {
  return CLAUDE_API_MODELS[model] ?? 'claude-sonnet-4-6';
}

export function resolveGrokModel(model: LLMModel): string {
  return GROK_API_MODELS[model] ?? 'grok-4.3';
}

/** Max files per request (images + documents) */
export function getMaxAttachments(model: LLMModel, isPremium: boolean): number {
  if (!isPremium) return 2;
  if (isClaudeModel(model)) return 20;
  if (isGeminiModel(model)) return 10;
  if (isOpenAIModel(model)) return 10;
  if (isGrokModel(model)) return 5;
  return 5;
}

/**
 * Silent failover — user never sees which model actually answered.
 * Always includes CROSS-PROVIDER backups (for free users too) so a rate-limited
 * primary provider fails over to a working provider instead of failing. Ordering:
 * requested model → one quick same-provider variant → other providers by speed/cost.
 */
export function getSilentFallbackChain(requested: LLMModel, _isPremium: boolean): LLMModel[] {
  const chain: LLMModel[] = [requested];
  const add = (m: LLMModel) => {
    if (!chain.includes(m)) chain.push(m);
  };

  // 1) One quick same-provider variant (handles non-rate-limit errors cheaply).
  if (isOpenAIModel(requested)) add('gpt-4o-mini');
  if (isClaudeModel(requested)) add('claude-4.5-haiku');
  if (isGrokModel(requested)) add('grok-3-mini');
  if (isGeminiModel(requested)) add('gemini-3.5-flash');

  // 2) Cross-provider backups — ALWAYS present (free + premium). If the primary
  //    provider is rate-limited, these give a fast working answer from another model.
  add('gpt-4o-mini');      // OpenAI (fast, cheap)
  add('gemini-lite');      // Google
  add('grok-4.3');         // xAI
  add('claude-4.5-haiku'); // Anthropic

  return chain;
}

export const LLM_MODEL_ENUM = [
  'auto',
  'gpt-5', 'gpt-5.1', 'gpt-5.2', 'gpt-5.3', 'gpt-5.4', 'gpt-5.5', 'gpt-5.5-pro',
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini',
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
  'gemini-2.0-latest', 'gemini-3.0', 'gemini-3.1', 'gemini-3.1-flash',
  'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-lite',
  'claude-4.8-opus', 'claude-4.7-opus',
  'claude-4.5-sonnet', 'claude-4.5-opus', 'claude-4.6-sonnet', 'claude-4.6-opus',
  'claude-4.5-haiku', 'claude-4-sonnet', 'claude-4-opus', 'claude-4.1-opus', 'claude-3-haiku',
  'grok-4.3', 'grok-4.20', 'grok-3', 'grok-3-mini',
  'grok-4-heavy', 'grok-4-fast', 'grok-code-fast-1', 'grok-beta',
  'gemini-pro', 'gemini-pro-vision', 'llama-2', 'mistral-7b',
] as const;
