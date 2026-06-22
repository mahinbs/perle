/**
 * API key pool with round-robin rotation.
 *
 * Activates ONLY when more than one key is configured for a provider. With a
 * single key (the current/default setup) it returns that key every time — i.e.
 * existing behaviour is completely unchanged unless you opt in by adding keys.
 *
 * How to add extra keys (any of these, mix & match):
 *   - Numbered suffixes on the existing var:  OPENAI_API_KEY_2, OPENAI_API_KEY_3, …
 *   - Comma-separated list in the var:         OPENAI_API_KEY=key1,key2,key3
 * The same works for every provider's base var(s) below.
 *
 * Keys may come from the SAME provider account or different accounts — both work
 * (see notes the team asked about). Rotation simply spreads requests across them
 * so no single key hits its per-minute rate limit first.
 */

export type KeyProvider = 'openai' | 'gemini' | 'grok' | 'claude' | 'exa';

// Candidate env var names per provider, in preference order. The FIRST one that
// is set becomes the "primary" (preserving the previous fallback order exactly).
const CANDIDATES: Record<KeyProvider, string[]> = {
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY_FREE', 'GOOGLE_API_KEY_FREE', 'GOOGLE_API_KEY'],
  grok: ['XAI_API_KEY', 'X_API_KEY'],
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  exa: ['EXA_API_KEY'],
};

function splitAdd(pool: string[], raw?: string): void {
  if (!raw) return;
  for (const part of raw.split(',')) {
    const k = part.trim();
    if (k && !pool.includes(k)) pool.push(k);
  }
}

function buildPool(provider: KeyProvider): string[] {
  const pool: string[] = [];
  const candidates = CANDIDATES[provider];

  // Primary key = first candidate that is set (same fallback order as before).
  for (const name of candidates) {
    if (process.env[name]) {
      splitAdd(pool, process.env[name]);
      break;
    }
  }

  // Extra rotation keys = numbered suffixes on any candidate var (_2 … _20).
  for (const name of candidates) {
    for (let i = 2; i <= 20; i++) splitAdd(pool, process.env[`${name}_${i}`]);
  }

  return pool;
}

const pools = new Map<KeyProvider, string[]>();
const counters = new Map<KeyProvider, number>();

// Per-key cooldown: when a key returns a rate-limit error we park it for a short
// window so round-robin skips it instead of handing it out again. Keyed by the
// actual key string; value is the timestamp (ms) until which it's "cooling down".
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 60 * 1000;

// Last key handed out per provider — lets callers report a rate limit without
// having to thread the exact key string back through every provider function.
const lastKeyByProvider = new Map<KeyProvider, string>();

function getPool(provider: KeyProvider): string[] {
  let pool = pools.get(provider);
  if (!pool) {
    pool = buildPool(provider);
    pools.set(provider, pool);
    counters.set(provider, 0);
  }
  return pool;
}

function isCooling(key: string): boolean {
  const until = cooldownUntil.get(key);
  return until !== undefined && Date.now() < until;
}

/**
 * Returns the next key for a provider.
 *   - 0 keys → ''
 *   - 1 key  → that key always (no rotation — default behaviour)
 *   - 2+     → round-robin, SKIPPING any key currently in cooldown. If every key
 *              is cooling down, returns the next one anyway (best effort).
 */
export function getApiKey(provider: KeyProvider): string {
  const pool = getPool(provider);
  if (pool.length === 0) return '';
  if (pool.length === 1) {
    lastKeyByProvider.set(provider, pool[0]);
    return pool[0];
  }

  let idx = (counters.get(provider) ?? 0) % pool.length;
  // Try up to pool.length keys to find one that isn't cooling down.
  for (let tries = 0; tries < pool.length; tries++) {
    const candidate = pool[idx];
    idx = (idx + 1) % pool.length;
    if (!isCooling(candidate)) {
      counters.set(provider, idx);
      lastKeyByProvider.set(provider, candidate);
      return candidate;
    }
  }
  // All keys cooling down — hand out the next one anyway.
  counters.set(provider, idx);
  const fallback = pool[(idx + pool.length - 1) % pool.length];
  lastKeyByProvider.set(provider, fallback);
  return fallback;
}

/** Mark a specific key as rate-limited so it's skipped for the cooldown window. No-op for single-key setups. */
export function reportRateLimit(provider: KeyProvider, key: string): void {
  if (!key) return;
  if (getPool(provider).length <= 1) return; // nothing to skip to
  cooldownUntil.set(key, Date.now() + COOLDOWN_MS);
  console.warn(`⏸️  ${provider} key parked for ${COOLDOWN_MS / 1000}s (rate-limited); rotating to another key`);
}

/** Report a rate limit for a provider's most-recently-used key (when the exact key isn't at hand). */
export function reportRateLimitForProvider(provider: KeyProvider): void {
  const key = lastKeyByProvider.get(provider);
  if (key) reportRateLimit(provider, key);
}

/** How many keys are configured for a provider (1 = no rotation). */
export function keyCount(provider: KeyProvider): number {
  return getPool(provider).length;
}

/** True when rotation is active (more than one key configured). */
export function hasKeyRotation(provider: KeyProvider): boolean {
  return getPool(provider).length > 1;
}
