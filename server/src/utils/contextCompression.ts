import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase.js';
import { getApiKey, reportRateLimitForProvider } from './apiKeys.js';
import type { ConversationMessage } from '../types.js';

/**
 * Perplexity-style context compression.
 *
 * For a logged-in user's conversation:
 *   - Verbatim window: the most-recent `recentLimit` exchanges (5/10/15 by tier).
 *   - Summary: a persisted rolling summary of EVERYTHING older than that window,
 *     stored on the `conversations` row (`summary`, `summary_message_count`).
 *
 * The summary is regenerated only when it drifts (its `summary_message_count`
 * no longer matches the current older-count). With most reloads it's just a
 * single DB read.
 *
 * GRACEFUL: until `database/add_conversation_summary.sql` is run, summary
 * fetch/update calls fail silently and the function falls back to today's
 * behaviour (just the last `recentLimit` messages, no summary).
 */

export interface CompressedContext {
  summary: string | null;
  recent: ConversationMessage[];
}

const SUMMARY_MODEL = 'gemini-2.5-flash-lite';
const SUMMARY_MAX_TOKENS = 600;

function rowsToMessages(rows: Array<{ query: string; answer: string }>): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (const r of rows) {
    if (r.query) out.push({ role: 'user', content: r.query });
    if (r.answer) out.push({ role: 'assistant', content: r.answer });
  }
  return out;
}

// Per-attempt timeout so a slow/hung provider can't stall the request.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('SUMMARY_TIMEOUT')), ms);
    p.then((v) => { clearTimeout(t); res(v); }).catch((e) => { clearTimeout(t); rej(e); });
  });
}

function isRateLimit(e: any): boolean {
  const s = e?.status ?? e?.code;
  const m = `${s ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return s === 429 || s === 503 || m.includes('429') || m.includes('503') ||
    m.includes('rate limit') || m.includes('quota') || m.includes('overloaded') || m.includes('high demand');
}

const SUMMARY_TIMEOUT_MS = 8000;

async function trySummaryGemini(prompt: string): Promise<string | null> {
  const key = getApiKey('gemini');
  if (!key) return null;
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: SUMMARY_MODEL });
    const result = await withTimeout(model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: SUMMARY_MAX_TOKENS, temperature: 0.2 },
    }), SUMMARY_TIMEOUT_MS);
    const text = result.response.text().trim();
    return text || null;
  } catch (e) {
    if (isRateLimit(e)) reportRateLimitForProvider('gemini');
    throw e;
  }
}

async function trySummaryOpenAI(prompt: string): Promise<string | null> {
  const key = getApiKey('openai');
  if (!key) return null;
  try {
    const client = new OpenAI({ apiKey: key });
    const result = await withTimeout(client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: 0.2,
    }), SUMMARY_TIMEOUT_MS);
    const text = (result.choices[0]?.message?.content || '').trim();
    return text || null;
  } catch (e) {
    if (isRateLimit(e)) reportRateLimitForProvider('openai');
    throw e;
  }
}

async function trySummaryClaude(prompt: string): Promise<string | null> {
  const key = getApiKey('claude');
  if (!key) return null;
  try {
    const client = new Anthropic({ apiKey: key });
    const result = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }), SUMMARY_TIMEOUT_MS);
    const text = result.content
      .map((c: any) => (c?.type === 'text' ? c.text : ''))
      .join('')
      .trim();
    return text || null;
  } catch (e) {
    if (isRateLimit(e)) reportRateLimitForProvider('claude');
    throw e;
  }
}

async function trySummaryGrok(prompt: string): Promise<string | null> {
  const key = getApiKey('grok');
  if (!key) return null;
  try {
    // Grok uses an OpenAI-compatible endpoint.
    const client = new OpenAI({ apiKey: key, baseURL: 'https://api.x.ai/v1' });
    const result = await withTimeout(client.chat.completions.create({
      model: 'grok-3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: 0.2,
    }), SUMMARY_TIMEOUT_MS);
    const text = (result.choices[0]?.message?.content || '').trim();
    return text || null;
  } catch (e) {
    if (isRateLimit(e)) reportRateLimitForProvider('grok');
    throw e;
  }
}

/**
 * Build/refresh the summary text for the given older messages.
 *
 * Priority order (cheapest first):
 *   1. Gemini 2.5 Flash Lite  (default, very cheap)
 *   2. OpenAI gpt-4o-mini      (fallback when Gemini fails)
 *   3. Claude Haiku 4.5         (next fallback)
 *   4. Grok-3-mini              (last resort)
 *
 * Each attempt is capped at 8s. Rate-limit errors park the key (see apiKeys)
 * so the next request rotates / skips. Returns null only when ALL providers
 * fail or no provider key is configured.
 */
async function buildSummary(
  olderRows: Array<{ query: string; answer: string }>,
  previousSummary: string | null
): Promise<string | null> {
  if (olderRows.length === 0) return null;

  // Compact transcript text. Cap each turn so a 1000-message thread still fits.
  const transcript = olderRows
    .map((r, i) => {
      const q = (r.query || '').slice(0, 600);
      const a = (r.answer || '').slice(0, 1200);
      return `[${i + 1}] User: ${q}\nAssistant: ${a}`;
    })
    .join('\n\n');

  const carry = previousSummary
    ? `Existing summary so far (extend it; don't repeat verbatim):\n${previousSummary}\n\n`
    : '';

  const prompt = `${carry}Summarize the conversation transcript below into a TIGHT, faithful set of bullet notes the assistant can rely on later. Focus on:
- The user's goals, preferences, constraints, and decisions made
- Concrete facts/numbers/names the user shared or that the assistant gave them
- Open questions or things the user said they'd do next
Avoid filler, marketing tone, and meta-commentary. ≤ 400 words. Plain text, bullet list.

TRANSCRIPT:
${transcript}`;

  const attempts: Array<{ name: string; fn: () => Promise<string | null> }> = [
    { name: 'gemini-flash-lite', fn: () => trySummaryGemini(prompt) },
    { name: 'openai-4o-mini',     fn: () => trySummaryOpenAI(prompt) },
    { name: 'claude-haiku',       fn: () => trySummaryClaude(prompt) },
    { name: 'grok-3-mini',        fn: () => trySummaryGrok(prompt) },
  ];

  let lastErr: unknown = null;
  for (const a of attempts) {
    try {
      const text = await a.fn();
      if (text) {
        if (a.name !== 'gemini-flash-lite') {
          console.log(`✅ Summary fallback used: ${a.name}`);
        }
        return text;
      }
      // text === null → no key configured for this provider; skip to next.
    } catch (e) {
      lastErr = e;
      console.warn(`⚠️ Summary ${a.name} failed:`, e instanceof Error ? e.message : e);
    }
  }
  console.warn('contextCompression: all summary providers failed; returning null.', lastErr);
  return null;
}

export async function buildCompressedContext(
  userId: string,
  conversationId: string,
  recentLimit: number
): Promise<CompressedContext> {
  // 1) Count messages cheaply (head: true skips rows).
  const { count, error: countErr } = await supabase
    .from('conversation_history')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (countErr || count === null) {
    // DB read failed — degrade to "just fetch the last N" path.
    const { data } = await supabase
      .from('conversation_history')
      .select('query, answer')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(recentLimit);
    const recent = rowsToMessages((data || []).reverse());
    return { summary: null, recent };
  }

  // 2) Short conversation → unchanged behaviour, no summary needed.
  if (count <= recentLimit) {
    const { data } = await supabase
      .from('conversation_history')
      .select('query, answer')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(recentLimit);
    const recent = rowsToMessages((data || []).reverse());
    return { summary: null, recent };
  }

  const olderCount = count - recentLimit;

  // 3) See if the stored summary already covers olderCount messages.
  let existingSummary: string | null = null;
  let existingSummaryCount = 0;
  let canPersistSummary = true;
  try {
    const { data: convRow, error: convErr } = await supabase
      .from('conversations')
      .select('summary, summary_message_count')
      .eq('id', conversationId)
      .single();
    if (convErr) {
      // Most likely: columns missing (pre-migration). Skip summarization entirely.
      canPersistSummary = false;
    } else {
      existingSummary = (convRow as any)?.summary ?? null;
      existingSummaryCount = (convRow as any)?.summary_message_count ?? 0;
    }
  } catch {
    canPersistSummary = false;
  }

  // 4) Fetch the most-recent window (regardless of summary state).
  const { data: recentRows } = await supabase
    .from('conversation_history')
    .select('query, answer')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(recentLimit);
  const recent = rowsToMessages((recentRows || []).reverse());

  // 5) Reuse stored summary if it's up to date.
  if (existingSummary && existingSummaryCount === olderCount) {
    return { summary: existingSummary, recent };
  }

  // Pre-migration → no summary path available, just degrade gracefully.
  if (!canPersistSummary) {
    return { summary: existingSummary, recent };
  }

  // 6) Rebuild the summary from the older messages and persist it.
  const { data: olderRows, error: olderErr } = await supabase
    .from('conversation_history')
    .select('query, answer')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(olderCount);
  if (olderErr || !olderRows) return { summary: existingSummary, recent };

  const newSummary = await buildSummary(olderRows, existingSummary);
  if (!newSummary) {
    // Couldn't build (e.g. Gemini unavailable) — keep whatever we had.
    return { summary: existingSummary, recent };
  }

  try {
    await supabase
      .from('conversations')
      .update({ summary: newSummary, summary_message_count: olderCount } as any)
      .eq('id', conversationId)
      .eq('user_id', userId);
  } catch {
    /* best effort */
  }

  return { summary: newSummary, recent };
}
