import type { LLMModel } from '../types.js';

/** Fast, cheap model for AI Friend + AI Psychology — not user-selectable. */
export const COMPANION_CHAT_MODEL: LLMModel = 'gemini-lite';

/**
 * Resolve the model id passed into generateAIAnswer / streamAIAnswer.
 * Auto (explicit or free-tier default) → 'auto' so pickModelForAutoMode routes
 * by query (list → GPT, news → Perplexity, etc.). Premium manual picks pass through.
 */
export function resolveActualSearchModel(model: LLMModel, isPremium: boolean): LLMModel {
  if (model === 'auto') return 'auto';
  // Free tier always uses smart Auto routing (frontend sends gemini-lite; backend maps here).
  if (!isPremium) return 'auto';
  return model;
}

/**
 * Companion chat failover — cross-provider so a Gemini 503/overload never
 * surfaces as a user-visible error when another key is available.
 */
export function getCompanionFallbackChain(): LLMModel[] {
  const chain: LLMModel[] = [
    COMPANION_CHAT_MODEL,
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
  ];
  const add = (m: LLMModel) => {
    if (!chain.includes(m)) chain.push(m);
  };
  if (process.env.OPENAI_API_KEY) add('gpt-4o-mini');
  if (process.env.XAI_API_KEY || process.env.X_API_KEY) add('grok-4.3');
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) add('claude-4.5-haiku');
  return chain;
}

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

/** DeepSeek — direct API (OpenAI-compatible) at https://api.deepseek.com/v1 */
export const DEEPSEEK_API_MODELS: Partial<Record<LLMModel, string>> = {
  'deepseek-v3.2': 'deepseek-chat',
  'deepseek-v3.2-exp': 'deepseek-chat',
  'deepseek-v3.1': 'deepseek-chat',
  'deepseek-r1': 'deepseek-reasoner',
};

/** Moonshot / Kimi — direct API (OpenAI-compatible) at https://api.moonshot.cn/v1 */
export const KIMI_API_MODELS: Partial<Record<LLMModel, string>> = {
  'kimi-k2': 'moonshot-v1-32k',
  'kimi-k2.5': 'moonshot-v1-128k',
  'kimi-k2-thinking': 'moonshot-v1-128k',
};

/** Perplexity Sonar — direct API (OpenAI-compatible) at https://api.perplexity.ai */
export const PERPLEXITY_API_MODELS: Partial<Record<LLMModel, string>> = {
  'perplexity-sonar': 'sonar',
  'perplexity-sonar-pro': 'sonar-pro',
  'perplexity-sonar-reasoning-pro': 'sonar-reasoning-pro',
  'perplexity-deep-research': 'sonar-deep-research',
  'perplexity-adv-deep-research': 'sonar-deep-research',
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
  'deepseek-v3.2',
  'deepseek-r1',
  'kimi-k2.5',
  'kimi-k2-thinking',
  'perplexity-sonar-pro',
  'perplexity-sonar-reasoning-pro',
  'perplexity-deep-research',
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

export function isDeepSeekModel(model: LLMModel): boolean {
  return model in DEEPSEEK_API_MODELS;
}

export function isKimiModel(model: LLMModel): boolean {
  return model in KIMI_API_MODELS;
}

export function isPerplexityModel(model: LLMModel): boolean {
  return model in PERPLEXITY_API_MODELS;
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

export function resolveDeepSeekModel(model: LLMModel): string {
  return DEEPSEEK_API_MODELS[model] ?? 'deepseek-chat';
}

export function resolveKimiModel(model: LLMModel): string {
  return KIMI_API_MODELS[model] ?? 'moonshot-v1-32k';
}

export function resolvePerplexityModel(model: LLMModel): string {
  return PERPLEXITY_API_MODELS[model] ?? 'sonar';
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
  if (isDeepSeekModel(requested)) add('deepseek-v3.2');
  if (isKimiModel(requested)) add('kimi-k2');
  if (isPerplexityModel(requested)) add('perplexity-sonar');

  // 2) Cross-provider backups — ALWAYS present (free + premium). If the primary
  //    provider is rate-limited, these give a fast working answer from another model.
  add('gpt-4o-mini');      // OpenAI (fast, cheap)
  add('gemini-lite');      // Google
  add('grok-4.3');         // xAI
  add('claude-4.5-haiku'); // Anthropic
  // Newly-integrated providers are added at the tail so they only kick in once
  // the established backups exhaust. Each is gated on a configured key so we
  // don't pad the chain with providers the deployment can't actually call.
  if (process.env.DEEPSEEK_API_KEY) add('deepseek-v3.2');
  if (process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY) add('kimi-k2');
  if (process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY) add('perplexity-sonar');

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
  // DeepSeek
  'deepseek-v3.2', 'deepseek-v3.2-exp', 'deepseek-v3.1', 'deepseek-r1',
  // Kimi
  'kimi-k2', 'kimi-k2.5', 'kimi-k2-thinking',
  // Perplexity
  'perplexity-sonar', 'perplexity-sonar-pro', 'perplexity-sonar-reasoning-pro',
  'perplexity-deep-research', 'perplexity-adv-deep-research',
] as const;
