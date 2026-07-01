import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import type { AnswerResult, Mode, LLMModel, Source, ConversationMessage, ChatMode, UserLocalContext, FileAttachment } from '../types.js';
import { shouldGenerateImage, extractImagePrompt, generateImage } from './imageGeneration.js';
import {
  formatSearchResultsForContext,
  isComparisonQuery,
  isListQuery,
  isContinuationFollowUpQuery,
  isContextLinkedFollowUpQuery,
  isSmallTalkQuery,
  shouldPerformWebSearch,
} from './webSearch.js';
import { searchWithExa, searchWithGeminiGrounding, searchWithOpenAIWebTool, searchWithGrokWebTool } from './providerWebSearch.js';
import type { ExaSearchType } from './providerWebSearch.js';
import type { SearchResult } from './webSearch.js';
import {
  isOpenAIModel,
  isGeminiModel,
  isClaudeModel,
  isGrokModel,
  isDeepSeekModel,
  isKimiModel,
  isPerplexityModel,
  resolveOpenAIModel,
  resolveGeminiModel,
  resolveClaudeModel,
  resolveGrokModel,
  resolveDeepSeekModel,
  resolveKimiModel,
  resolvePerplexityModel,
  getSilentFallbackChain,
  getCompanionFallbackChain,
} from './modelRegistry.js';
import { normalizeInlineAnswerStructure } from './normalizeAnswerStructure.js';
import {
  normalizeAttachments,
  buildOpenAIUserContent,
  appendGeminiAttachmentParts,
  buildClaudeUserContent,
  buildGrokUserContent,
  augmentPromptForAttachments,
  buildAttachmentSystemAddon,
} from './fileAttachments.js';
import { getApiKey, reportRateLimitForProvider, type KeyProvider } from './apiKeys.js';
import { redisGetJSON, redisSetJSONWithTierBudget } from '../lib/redis.js';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

/** True for rate-limit / overload / timeout errors — signals "switch provider fast". */
function isRateLimitError(e: any): boolean {
  const status = e?.status ?? e?.code;
  const msg = `${status ?? ''} ${e?.message ?? ''}`.toLowerCase();
  return (
    status === 503 || status === 429 ||
    msg.includes('503') || msg.includes('429') ||
    msg.includes('high demand') || msg.includes('overloaded') ||
    msg.includes('rate limit') || msg.includes('quota') ||
    msg.includes('resource has been exhausted') || msg.includes('timeout')
  );
}

/** Coarse provider bucket for a model id (used to skip same-provider fallbacks). */
/**
 * Detect a model refusal that should be treated like a generation failure
 * (so the failover chain advances to the next provider). GPT-4o is the
 * worst offender — it occasionally returns "I'm sorry, I can't fulfill
 * that request" on benign, fully-allowed queries like "what are the latest
 * mobile processors?". That's an OpenAI policy quirk, not user error.
 *
 * Match rules:
 *   - The response must be SHORT (refusals are nearly always under 200
 *     characters — a real refusal explanation runs to a sentence or two,
 *     not a paragraph).
 *   - Match one of the well-known refusal opener patterns.
 *
 * Length guard prevents false positives on legit answers that happen to
 * quote one of these phrases ("'I cannot help' was a common reply in the
 * 19th-century customer service literature…").
 */
function isModelRefusal(text: string): boolean {
  const t = (text || '').trim();
  if (t.length === 0 || t.length > 260) return false;
  // Action verbs that, paired with "can't/cannot", indicate a refusal:
  //   - help/assist/comply/complete/do/answer: classic refusals
  //   - fulfill/fulfil: GPT's preferred refusal verb
  //   - provide/give/offer: GPT-4o's "I can't provide a response that long"
  //                         pseudo-refusal we saw on medical queries
  //   - generate/create/produce/write: image-gen / writing refusals
  const verbs = '(fulfill|fulfil|help|assist|comply|complete|do|answer|provide|give|offer|generate|create|produce|write|continue|engage)';
  const refusalPatterns = [
    new RegExp(`^i'?m sorry,? but i (can'?t|cannot)\\s+${verbs}`, 'i'),
    new RegExp(`^i'?m sorry,? i (can'?t|cannot)\\s+${verbs}`, 'i'),
    new RegExp(`^i (can'?t|cannot) ${verbs} (that|this|your)`, 'i'),
    new RegExp(`^i'?m unable to ${verbs}`, 'i'),
    new RegExp(`^i (won'?t|will not) be able to ${verbs}`, 'i'),
    new RegExp(`^sorry,? i (can'?t|cannot)\\s+${verbs}`, 'i'),
    /^as an ai\b.*\b(can'?t|cannot|unable)\b/i,
    /^unfortunately,? i (can'?t|cannot)\b/i,
    /^my (apologies|apology),? (but )?i (can'?t|cannot)\b/i,
  ];
  return refusalPatterns.some((re) => re.test(t));
}

function providerOf(m: LLMModel): string {
  if (isGeminiModel(m)) return 'gemini';
  if (isOpenAIModel(m)) return 'openai';
  if (isClaudeModel(m)) return 'claude';
  if (isGrokModel(m)) return 'grok';
  if (isDeepSeekModel(m)) return 'deepseek';
  if (isKimiModel(m)) return 'kimi';
  if (isPerplexityModel(m)) return 'perplexity';
  return 'other';
}

// ── Web-search cache (L1 in-memory + L2 Redis) ──────────────────────────────
// Keyed by the (normalized) search query. Lets a cross-provider FALLBACK reuse
// the search the primary model already ran, instead of re-searching (~5s saved).
//   L1: short-lived in-memory burst absorber (60s) — survives the next-request
//       wave without paying for a Redis round trip.
//   L2: Redis-backed shared cache (15 min) — when multiple backend instances
//       run behind a load balancer, they all benefit from each other's hits.
//       Activates only when REDIS_URL is set; otherwise L1 alone (current behavior).
const SEARCH_L1 = new Map<string, { results: SearchResult[]; ts: number }>();
const SEARCH_L1_TTL_MS = 60 * 1000;
const SEARCH_L2_TTL_SEC = 15 * 60; // 15 min in Redis
// L2 Redis budget by key count: 80% premium, 20% free.
const SEARCH_L2_TOTAL_KEY_BUDGET = 2000;
const SEARCH_L2_PREMIUM_KEY_BUDGET = Math.floor(SEARCH_L2_TOTAL_KEY_BUDGET * 0.8);
const SEARCH_L2_FREE_KEY_BUDGET = Math.max(1, SEARCH_L2_TOTAL_KEY_BUDGET - SEARCH_L2_PREMIUM_KEY_BUDGET);

// Sentinel the model appends before its 3 contextual follow-up questions.
// Stream code suppresses everything from this marker onward and parses the
// questions out of it (see streamGeminiAnswer).
const FOLLOWUP_MARKER = 'SUGGESTED_FOLLOWUPS:';

function parseFollowups(fullText: string): { clean: string; followups: string[] } {
  const idx = fullText.indexOf(FOLLOWUP_MARKER);
  if (idx < 0) return { clean: fullText, followups: [] };
  const beforeMarker = fullText.slice(0, idx);
  const afterMarker = fullText.slice(idx + FOLLOWUP_MARKER.length);

  // The follow-up questions are expected on a SINGLE line right after the
  // marker (per prompt). Any substantial content on later lines means the
  // model "leaked" the marker mid-answer and kept generating real content.
  // Recover that content so the UI gets the complete answer.
  const newlineIdx = afterMarker.indexOf('\n');
  const followupLine = newlineIdx >= 0 ? afterMarker.slice(0, newlineIdx) : afterMarker;
  const trailingContent = newlineIdx >= 0 ? afterMarker.slice(newlineIdx + 1).trim() : '';

  const followups = followupLine
    .split(/\|\||\n/)
    .map((s) => s.replace(/^[\s\-•*\d.]+/, '').trim())
    .filter((s) => s.length > 3 && s.length < 140)
    .slice(0, 3);

  // If there's a meaningful chunk of text after the follow-up line, the model
  // leaked. Reattach it to the clean answer so the UI doesn't lose content.
  let clean = beforeMarker;
  if (trailingContent.length > 50) {
    clean = clean.replace(/\s+$/, '') + '\n\n' + trailingContent;
  }
  return { clean, followups };
}

type SearchCacheScope = {
  isPremium: boolean;
  mode: Mode;
  chatMode: ChatMode;
  searchType?: ExaSearchType;
};

function searchCacheScopeKey(scope: SearchCacheScope): string {
  const tier = scope.isPremium ? 'premium' : 'free';
  const st = scope.searchType ?? 'auto';
  return `tier:${tier}|mode:${scope.mode}|chat:${scope.chatMode}|stype:${st}`;
}

function searchCacheKey(q: string, scope: SearchCacheScope): string {
  const normalized = q.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${searchCacheScopeKey(scope)}|q:${normalized}`;
}
async function getCachedSearch(q: string, scope: SearchCacheScope): Promise<SearchResult[] | null> {
  // Deep Research never reads from the cache — every deep run is a fresh
  // multi-search investigation, and serving a stale set of links would
  // both contradict the user's "go deep right now" intent and risk
  // returning a different topic mix than the model has just reasoned over.
  if (scope.searchType === 'deep') return null;
  const k = searchCacheKey(q, scope);
  // L1
  const e = SEARCH_L1.get(k);
  if (e && e.results.length && Date.now() - e.ts < SEARCH_L1_TTL_MS) return e.results;
  // L2 (Redis) — no-op when REDIS_URL isn't set
  const hit = await redisGetJSON<SearchResult[]>(`search:${k}`);
  if (hit && hit.length) {
    // Warm L1 so the next burst doesn't pay the Redis round trip
    SEARCH_L1.set(k, { results: hit, ts: Date.now() });
    return hit;
  }
  return null;
}
function setCachedSearch(q: string, results: SearchResult[], scope: SearchCacheScope): void {
  if (!results || results.length === 0) return;
  // Deep Research never writes to the cache either — those result sets are
  // expensive but also user-specific (the model picks search queries based on
  // its own reasoning trajectory), so they shouldn't pollute the shared pool.
  if (scope.searchType === 'deep') return;
  const k = searchCacheKey(q, scope);
  if (SEARCH_L1.size > 200) SEARCH_L1.clear(); // crude bound
  SEARCH_L1.set(k, { results, ts: Date.now() });
  // Fire-and-forget Redis write with tier budget enforcement (80/20 premium/free).
  const tier = scope.isPremium ? 'premium' : 'free';
  const maxKeysForTier = scope.isPremium ? SEARCH_L2_PREMIUM_KEY_BUDGET : SEARCH_L2_FREE_KEY_BUDGET;
  void redisSetJSONWithTierBudget(`search:${k}`, results, SEARCH_L2_TTL_SEC, tier, maxKeysForTier);
}

// ── Answer-level cache (Normal + Web only, NEVER Deep) ──────────────────────
//
// Caches the full LLM-generated AnswerResult — model, mode, chatMode,
// searchType, isPremium, and the normalized query are all part of the key,
// so two users in different modes asking the same thing get fresh answers.
// Cross-user sharing is INTENTIONAL for stateless lookups ("what's the
// weather in Bangalore?") and respects scope so a Web Search answer never
// leaks into Normal and vice versa.
//
// Strict guardrails:
//   1. Deep Research is never cached (always recomputed)
//   2. Personalised contexts skip the cache entirely:
//        - non-empty conversation history (the answer depends on prior turns)
//        - file attachments (each upload is unique)
//        - explicit time/region phrasing the cache shouldn't blur
//   3. Short TTL (5 min L1, 15 min L2) — the world changes fast
type AnswerCacheEntry = {
  sources: Source[];
  cleanText: string;
  followups?: string[];
};
const ANSWER_L1 = new Map<string, { entry: AnswerCacheEntry; ts: number }>();
const ANSWER_L1_TTL_MS = 5 * 60 * 1000;
const ANSWER_L2_TTL_SEC = 15 * 60;
const ANSWER_L2_TOTAL_KEY_BUDGET = 1500;
const ANSWER_L2_PREMIUM_KEY_BUDGET = Math.floor(ANSWER_L2_TOTAL_KEY_BUDGET * 0.8);
const ANSWER_L2_FREE_KEY_BUDGET = Math.max(1, ANSWER_L2_TOTAL_KEY_BUDGET - ANSWER_L2_PREMIUM_KEY_BUDGET);

type AnswerCacheScope = {
  isPremium: boolean;
  mode: Mode;
  chatMode: ChatMode;
  searchType?: ExaSearchType;
  model: string; // resolved API model id — different models give different answers
};

function answerCacheKey(q: string, scope: AnswerCacheScope): string {
  const tier = scope.isPremium ? 'premium' : 'free';
  const st = scope.searchType ?? 'auto';
  const normalized = q.trim().toLowerCase().replace(/\s+/g, ' ');
  return `ans|tier:${tier}|mode:${scope.mode}|chat:${scope.chatMode}|stype:${st}|model:${scope.model}|q:${normalized}`;
}

/**
 * Returns null when caching is unsafe for this request. Caller should still
 * call setCachedAnswer at the end — the writer applies the same guards.
 */
function isAnswerCacheableScope(
  scope: AnswerCacheScope,
  conversationHistory: ConversationMessage[],
  hasAttachments: boolean,
): boolean {
  if (scope.searchType === 'deep') return false;
  if (scope.chatMode === 'ai_friend' || scope.chatMode === 'ai_psychologist') return false;
  if (conversationHistory.length > 0) return false; // answer depends on prior turns
  if (hasAttachments) return false; // every upload is unique
  return true;
}

async function getCachedAnswer(
  q: string,
  scope: AnswerCacheScope,
  conversationHistory: ConversationMessage[],
  hasAttachments: boolean,
): Promise<AnswerCacheEntry | null> {
  if (!isAnswerCacheableScope(scope, conversationHistory, hasAttachments)) return null;
  const k = answerCacheKey(q, scope);
  const e = ANSWER_L1.get(k);
  if (e && Date.now() - e.ts < ANSWER_L1_TTL_MS) {
    console.log(`♻️ Answer cache HIT (L1) for ${scope.mode}/${scope.searchType}`);
    return e.entry;
  }
  const hit = await redisGetJSON<AnswerCacheEntry>(`answer:${k}`);
  if (hit && hit.cleanText) {
    ANSWER_L1.set(k, { entry: hit, ts: Date.now() });
    console.log(`♻️ Answer cache HIT (L2) for ${scope.mode}/${scope.searchType}`);
    return hit;
  }
  return null;
}

function setCachedAnswer(
  q: string,
  scope: AnswerCacheScope,
  entry: AnswerCacheEntry,
  conversationHistory: ConversationMessage[],
  hasAttachments: boolean,
): void {
  if (!isAnswerCacheableScope(scope, conversationHistory, hasAttachments)) return;
  if (!entry.cleanText || entry.cleanText.length < 50) return; // don't cache empty/error answers
  const k = answerCacheKey(q, scope);
  if (ANSWER_L1.size > 200) ANSWER_L1.clear();
  ANSWER_L1.set(k, { entry, ts: Date.now() });
  const tier = scope.isPremium ? 'premium' : 'free';
  const maxKeysForTier = scope.isPremium ? ANSWER_L2_PREMIUM_KEY_BUDGET : ANSWER_L2_FREE_KEY_BUDGET;
  void redisSetJSONWithTierBudget(`answer:${k}`, entry, ANSWER_L2_TTL_SEC, tier, maxKeysForTier);
}


const MARKDOWN_TABLE_REGEX =
  /(?:^|\n)((?:\|[^\n]+\|\n)(?:\|[-:\s|]+\|\n)(?:\|[^\n]+\|\n?)+)/gm;

// Strip markdown formatting from text (optionally preserve markdown tables for comparisons)
function stripMarkdown(text: string, options?: { preserveTables?: boolean }): string {
  const tablePlaceholders: string[] = [];
  let working = normalizeInlineAnswerStructure(text);

  if (options?.preserveTables) {
    working = working.replace(MARKDOWN_TABLE_REGEX, (match) => {
      const idx = tablePlaceholders.length;
      tablePlaceholders.push(match.trim());
      return `\n<<<SYNTTABLE${idx}>>>\n`;
    });
  }

  // Remove markdown headers (##, ###, etc.)
  working = working.replace(/^#{1,6}\s+/gm, '');
  // Convert markdown list bullets (* item or - item at line start) to • before stripping * as italic
  working = working.replace(/^(\s*)\*\s+/gm, '$1• ');
  // Remove bold/italic markers
  working = working.replace(/\*\*([^*]+)\*\*/g, '$1');
  working = working.replace(/\*([^*]+)\*/g, '$1');
  working = working.replace(/__([^_]+)__/g, '$1');
  working = working.replace(/_([^_]+)_/g, '$1');
  // Remove code blocks
  working = working.replace(/```[\s\S]*?```/g, '');
  working = working.replace(/`([^`]+)`/g, '$1');
  // Remove links but keep text
  working = working.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  // Strip [n] / [n,m] citations from table data rows (lines that start and end with |, not separator rows)
  working = working.replace(/^(\|(?:[^|\n]+\|)+)$/gm, (row) => {
    if (/^\|[-:\s|]+\|$/.test(row)) return row; // skip separator rows like |---|---|
    return row.replace(/\s*\[[\d,\s]+\]/g, '');
  });
  // Clean up extra whitespace
  working = working.replace(/\n{3,}/g, '\n\n');
  // Remove trailing empty bullet points (e.g. stray "•" or "- " at end of response)
  working = working.replace(/[\n\r]+[•\-]\s*$/, '');

  if (options?.preserveTables) {
    tablePlaceholders.forEach((table, idx) => {
      working = working.replace(`<<<SYNTTABLE${idx}>>>`, table);
    });
  }

  return working.trim();
}

function wantsTableFormat(query: string, mode: Mode): boolean {
  return mode === 'Compare' || isComparisonQuery(query) || isListQuery(query);
}

/** @deprecated use wantsTableFormat */
function wantsComparisonTableFormat(query: string, mode: Mode): boolean {
  return wantsTableFormat(query, mode);
}

const TABLE_FORMAT_SYSTEM_ADDON = `

TABLE-FORMATTED ANSWERS (comparisons AND lists):
When the user asks to compare items OR requests a list/enumeration, use a markdown TABLE.

COMPARISONS (vs, compare, difference between):
• 1-sentence overview, then an emoji heading (e.g. "📊 Comparison:"), then the comparison table
• Columns = items being compared; rows = key criteria (5-8 rows)
• Example:
📊 Comparison:
| Feature | Option A | Option B |
|---------|----------|----------|
| Price | ... | ... |

LISTS (list of, all X, name every, latest, best, top):
• 1-sentence overview, then an emoji heading (e.g. "📱 Latest Mobile Processors:"), then the data table
• Choose sensible columns for the topic — NO "Source" column
• Limit table to 6-8 most relevant items — do NOT pad with loosely related items
• STRICT SCOPE: only include items that EXACTLY match the asked category. If asked about "mobile processors" (smartphones), do NOT include AI PCs, XR/AR headsets, laptops, or servers — only smartphone/tablet SoCs.
• Example:
📱 Latest Mobile Processors:
| Name | Manufacturer | Key Features |
|------|--------------|--------------|
| Snapdragon 8 Elite Gen 5 | Qualcomm | 3nm, flagship Android |

RULES FOR ALL TABLES:
• Markdown tables ARE allowed (overrides the no-markdown rule for tables only)
• Use header row + separator row (|---|---|) + data rows
• CRITICAL — TABLE TITLE PLACEMENT: The emoji section heading (e.g. "📊 Best Medicines:") MUST be on its own line ABOVE the table. NEVER put the title inside a table row or table cell — not in the header row, not in column 1.
• Leave a blank line between the emoji heading and the first | column | row |
• ABSOLUTE RULE — NO CITATIONS IN TABLE CELLS: Table cells must contain ONLY clean descriptive text. Writing [1], [2], [1,2,3], or ANY [n] inside a table cell is FORBIDDEN. If you feel the urge to cite a source in a cell, DO NOT — write the fact plainly instead.
• After the table, add 2-3 short bullet takeaways — THIS is where you put [1], [2] citations

CRITICAL TABLE CELL RULE — NO EMPTY CELLS, EVER:
• Every single cell MUST contain a real, specific value. An empty cell, or a cell containing "-", "—", "N/A", "TBD", "?", "Unknown", "(blank)", or any placeholder, is a HARD FAILURE.
• NEVER write meta-commentary like "(Not provided in sources)", "(Data unavailable)", or similar.
• Web search may be incomplete — that is EXPECTED. When a detail is missing from search, fill the cell from YOUR OWN KNOWLEDGE with a true, specific fact. You know these facts; use them.
• If you genuinely cannot fill a column for an item, DROP that column for the whole table — do NOT leave gaps.

COMPLETENESS RULE — INCLUDE ALL THE OBVIOUS ANSWERS:
• For "latest/best/top/list of X", include EVERY major player/brand in that category, not only what web search returned.
  - e.g. "latest mobile processors" MUST include Apple (A-series), Qualcomm (Snapdragon), MediaTek (Dimensity), Samsung (Exynos), and Google (Tensor) — omitting an obvious flagship like Apple is WRONG.
  - e.g. "top EV makers" MUST include Tesla, BYD, etc.
• Basic, well-known facts must be correct and complete regardless of how thin the search results are. Use your own knowledge to guarantee the list is not missing any obvious entry.`;

const COMPARISON_TABLE_SYSTEM_ADDON = TABLE_FORMAT_SYSTEM_ADDON;

// Hard markdown structure rules injected into every table/list/comparison
// prompt. Models routinely violate these by emitting tables with no
// separator row, blank lines mid-table, and emoji headings glued onto
// the end of a paragraph — which makes the streaming renderer fragment
// tables into many tiny tables and miss subheadings entirely.
const FORMAT_STRICT = `

ABSOLUTE MARKDOWN STRUCTURE RULES — VIOLATING ANY OF THESE BREAKS THE RENDERER:

TABLES:
1. EVERY table MUST start with a header row, IMMEDIATELY followed by a separator row of dashes — no blank line between them. Example:
| Name | Maker | Node |
|------|-------|------|
| Snapdragon 8 Elite Gen 5 | Qualcomm | 3 nm |
| Apple A19 Pro | Apple | 3 nm |
2. NEVER emit a blank line BETWEEN data rows. All rows of one table must be on consecutive lines with no gaps.
3. NEVER split one logical table into multiple smaller tables.
4. After the LAST row of the table, leave ONE blank line, then continue with the next section.

EMOJI / SECTION HEADINGS (e.g. "🔬 Deep Dive:", "💡 Key Takeaways", "📈 Key Industry Trends"):
1. EVERY emoji heading MUST be on its OWN LINE.
2. There MUST be a blank line IMMEDIATELY BEFORE the heading.
3. There MUST be a blank line IMMEDIATELY AFTER the heading.
4. NEVER glue an emoji heading to the end of a sentence or bullet (e.g. "…moderate use. 💡 Key Takeaways" is FORBIDDEN — break to a new line with a blank line before).

BULLETS:
1. EVERY bullet starts on its own line with "• " (bullet + space) or "- ".
2. NEVER chain multiple bullets onto one line (e.g. "• Item A — desc. • Item B — desc." is FORBIDDEN).
3. Leave NO blank lines BETWEEN bullets of the same list. Leave ONE blank line between a list and the next paragraph/heading.

These rules are non-negotiable. If you violate them, the answer will render visibly broken to the user.`;

function buildNormalModeUserPrompt(
  query: string,
  mode: Mode,
  conversationHistory: ConversationMessage[],
  contextPrefix = '',
  isPremium = false
): string {
  const trimmed = query.trim();

  // Short-circuit greetings / small-talk queries (conversational responses)
  if (isSmallTalkQuery(trimmed)) {
    return `${contextPrefix}Conversational message: ${trimmed}
This is a GREETING or CASUAL message — NOT a research query.
Reply naturally and conversationally, the way a friendly assistant would.
Rules:
• Keep the reply to 1-3 sentences maximum. NO sections, NO bullet points, NO headings, NO citations.
• Reply in EXACTLY the same language and script as the message above. If the message is in Tamil, reply in Tamil. If in Hindi, reply in Hindi.
• Do NOT translate the message. Do NOT explain what the phrase means. Do NOT write a linguistic analysis.
• Just respond naturally — e.g. if someone says "How are you?", reply "I'm doing well, thanks for asking! How can I help you today?" in the same language.
[LANGUAGE RULE] Detect the script of the message above and reply in that exact script.`;
  }

  const isTrivialArithmetic =
    /^\s*[-+]?(\d+(\.\d+)?)\s*([+\-*/xX])\s*[-+]?(\d+(\.\d+)?)\s*(\?)?\s*$/.test(trimmed) ||
    /^what\s+is\s+[-+]?(\d+(\.\d+)?)\s*([+\-*/xX])\s*[-+]?(\d+(\.\d+)?)\s*(\?)?$/i.test(trimmed);
  if (isTrivialArithmetic) {
    return `${contextPrefix}Mode: Ask\nQuery: ${query}\nThis is a trivial arithmetic query. Respond with ONLY the direct answer in one short line. No sections, no bullets, no tables, no citations.`;
  }

  const detailedFollowUp = isContinuationFollowUpQuery(query) && conversationHistory.length > 0;
  if (detailedFollowUp) {
    // Pull the previous user message so we can quote it for the model.
    // Without this, short follow-ups like "can you do it?" get parsed as
    // a brand-new topic (the model started lecturing about the phrase
    // "you can do it" in music when the user actually meant "execute the
    // task we just talked about").
    let previousUserTurn = '';
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg.role === 'user' && msg.content?.trim()) {
        previousUserTurn = msg.content.trim().slice(0, 400);
        break;
      }
    }
    // Pull the previous ASSISTANT message too — if its final paragraph
    // was a "What I CAN do for you right now: …" partial-capability
    // offer and the user just affirmed, we want the model to EXECUTE
    // that offered partial capability immediately, not repeat the
    // limitation or restate the menu of external tools.
    let previousAssistantTurn = '';
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg.role === 'assistant' && msg.content?.trim()) {
        // Keep the tail so the "What I CAN do for you right now" line
        // (if present) survives the truncation.
        const c = msg.content.trim();
        previousAssistantTurn = c.length > 800 ? `…${c.slice(-800)}` : c;
        break;
      }
    }
    return `${contextPrefix}Mode: Research\nQuery: ${query}\n` +
      `THIS IS A FOLLOW-UP / AFFIRMATIVE REQUEST referring to the previous turn. ` +
      `The user is NOT introducing a new standalone topic — they are asking you ` +
      `to act on, expand, continue, or affirm what was just discussed.\n` +
      (previousUserTurn ? `Previous user request: "${previousUserTurn}"\n` : '') +
      (previousAssistantTurn ? `Your previous answer (tail): """${previousAssistantTurn}"""\n` : '') +
      `\nHOW TO INTERPRET THIS FOLLOW-UP — read carefully:\n` +
      `1. If your previous answer ended with "What I CAN do for you right now: …" ` +
      `or any equivalent partial-capability offer, the user's affirmation ("yes", ` +
      `"do it", "yes do it", "go ahead", "please do") is them ACCEPTING that offer. ` +
      `Execute it now in full — don't repeat the limitation, don't re-list the ` +
      `external tools, just deliver the offered thing. Example: if you said ` +
      `"I can suggest 50 themed emoji from existing Unicode" and they say "yes do it", ` +
      `output the actual list of 50 themed emoji with descriptions.\n` +
      `2. If your previous answer described a task in general terms and the user ` +
      `says "can you do it?" / "yes" / "go ahead", actually DO the task described — ` +
      `don't lecture about the literal phrase, don't pivot topics.\n` +
      `3. If they ask for more detail, expand the previous answer with deeper ` +
      `specifics and the same citations — same topic.\n` +
      `4. NEVER treat a 1–6 word affirmative/action follow-up as a brand-new ` +
      `standalone topic. The previous turn IS the topic.`;
  }

  if (wantsTableFormat(query, mode)) {
    if (isListQuery(query)) {
      console.log('📋 List question detected — requesting markdown table format');
      if (isPremium) {
        return `${contextPrefix}Mode: ${mode}\nQuery: ${query}\nPREMIUM IN-DEPTH LIST QUESTION. You MUST produce a long, multi-section, expert-level analysis (minimum 1200 words; target 1500–2500 words). Required structure in this exact order:\n\n1) A 2–3 sentence engaging introduction setting context, naming the major players and explaining why this list matters right now.\n\n2) An emoji heading on its OWN LINE (matching the topic, e.g. "💊 Best Medicines for Impetigo:") — NEVER inside the table — then a blank line, then a markdown TABLE with 10–12 rows covering EVERY major player + their notable variants. Choose sensible columns FOR THIS TOPIC (e.g. medicines: Name | Type | Key Use | Standout Feature; processors: Name | Manufacturer | Process Node | Key Specs — do NOT copy processor columns for non-tech topics). STRICT SCOPE: only items that exactly match the asked category. FILL EVERY CELL with a real specific fact — never "-", "N/A", blank, or a placeholder. Table cells must NEVER contain citation numbers like [1], [2] — clean descriptive text only.\n\n3) After the table, add these REQUIRED emoji-headed sections (each with a DIFFERENT emoji, 4–6 bullets per section, with nested "  - " sub-bullets for extra specifics + numbers + benchmarks):\n   • "🔬 Deep Dive: Top Performers" — pick the 3–4 most important items and explain in depth: architecture, real-world performance, what makes them notable. 1 paragraph per item OR 4–6 detailed bullets per item.\n   • "📈 Key Industry Trends" — 4–5 bullets on the broader direction with concrete numbers/percentages.\n   • "🎯 Which One Should You Pick?" — 4–5 use-case-driven bullets each recommending a specific item with a 1-line reason.\n   • "🔮 What's Coming Next" — 3–4 bullets on upcoming releases, roadmaps, expected launches over the next 6–12 months.\n   • "💡 Key Takeaways" — 4–5 cited bullets [1], [2] with the most important facts a buyer/reader must remember. Citations live ONLY in this final section and in the Deep Dive section — NEVER in the table.\n\nWrite in clear expert tone — specific numbers, real product names, real benchmark scores. Do NOT hedge with vague phrases.${FORMAT_STRICT}`;
      }
      return `${contextPrefix}Mode: ${mode}\nQuery: ${query}\nThis is a list question. Write 1 sentence overview, then an emoji heading on its OWN LINE (matching the topic) — NEVER inside the table — then a blank line, then a markdown TABLE (6-8 rows of the most relevant items). Choose sensible columns for THIS topic. STRICT SCOPE: only include items that exactly match the asked category — no loosely related items. COMPLETENESS: include EVERY major/obvious player in the category from your own knowledge, not just what search returned. FILL EVERY CELL with a real specific fact — NEVER leave a cell as "-", "N/A", blank, or any placeholder; use your own knowledge when search is missing a detail. CRITICAL: table cells must NEVER contain [1], [2], or any citation numbers — clean descriptive text only; citations go ONLY in the 2-3 bullet takeaways AFTER the table.${FORMAT_STRICT}`;
    }
    console.log('📊 Comparison question detected — requesting markdown table format');
    const compareDepth = isPremium
      ? `\nAFTER the table, ALSO add these REQUIRED emoji-headed sections (each with a DIFFERENT emoji, 4–6 bullets per section with nested "  - " sub-bullets, target 1200–2000 words total):\n• "🔬 Performance Deep Dive:" — 4–6 bullets benchmarking real-world differences (numbers, percentages, latency, throughput).\n• "✅ Strengths of <Option A>:" — 4–5 bullets of clear advantages.\n• "✅ Strengths of <Option B>:" — 4–5 bullets of clear advantages.\n• "⚠️ Trade-offs & Limitations:" — 4–5 bullets on the downsides of each.\n• "🎯 When to choose <Option A>:" — 4–5 bullets of specific user profiles/use-cases.\n• "🎯 When to choose <Option B>:" — 4–5 bullets of specific user profiles/use-cases.\n• "🏆 Verdict:" — 2–3 sentence final recommendation naming a winner (or "tie") + the single biggest reason.\n• "💡 Key Takeaways:" — 4–5 cited bullets [1], [2] with the most important facts.`
      : `\nAFTER the table, add 2–3 short bullet takeaways with citations [1], [2].`;
    return `${contextPrefix}Mode: Compare\nQuery: ${query}\nThis is a comparison question. Write ${isPremium ? '2–3 sentence' : '1 sentence'} overview, then an emoji heading (e.g. "📊 Comparison:"), then a markdown comparison table. Columns = items compared; rows = key criteria (${isPremium ? '10–12' : '5–8'} rows). CRITICAL: table cells must NEVER contain [1], [2], or any citation numbers — clean text only in cells.${compareDepth}${FORMAT_STRICT}`;
  }

  if (isPremium) {
    return `${contextPrefix}Mode: ${mode}\nQuery: ${query}\nPREMIUM IN-DEPTH REQUEST. Produce a long, expert-level multi-section answer (minimum 900 words; target 1500–2500 words when topic complexity justifies it). You MUST use ALL of these:\n• Start with a 2–3 sentence engaging introduction.\n• Then 6–8 emoji-headed sections, each with a DIFFERENT emoji that matches the section's topic.\n• Each section: 1 short intro line + 4–6 bullets + nested sub-bullets ("  - ") for extra specifics.\n• Pack every section with specific numbers, percentages, dates, named examples, and real-world context.\n• Include sections like: background/context, how it works (mechanism), key components/players, real-world examples, comparisons, trade-offs, current trends, future outlook, practical takeaways/recommendations.\n• End with a "💡 Key Takeaways" section of 4–5 cited bullets [1], [2].\n• NEVER hedge with vague phrases — be specific, technical, and expert.\n• If the query is trivially simple arithmetic/fact (e.g., \"2+2\"), answer directly and concisely instead of forcing long form.${FORMAT_STRICT}`;
  }

  return `${contextPrefix}Mode: ${mode}\nQuery: ${query}\nAnswer clearly with bullet points when appropriate. Provide structured information.\n\n[LANGUAGE RULE] Detect the language/script of the query above and write the ENTIRE answer — including all headings, bullets, and citations — in that same language and script. If the query is in Tamil, reply in Tamil. If in Hindi, reply in Hindi. If in English, reply in English. Never reply in a different language than the query.`;
}

function chunkTextToAnswer(
  text: string,
  sources: Source[],
  query?: string,
  mode: Mode = 'Ask'
): AnswerResult['chunks'] {
  const preserveTables = query ? wantsTableFormat(query, mode) : mode === 'Compare';
  const cleanText = stripMarkdown(text, { preserveTables });
  // Return single chunk with full text instead of splitting into sentences
  return [{
    text: cleanText,
    citationIds: sources.slice(0, 2).map((s) => s.id),
    confidence: 0.9
  }];
}

// Check if query is asking about the AI itself (SyntraIQ identity — NOT casual friend chat)
function isSelfReferentialQuery(query: string, chatMode: ChatMode = 'normal'): boolean {
  // AI Friend / Psychologist: never inject corporate SyntraIQ copy — characters answer in character
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    return false;
  }

  const lowerQuery = query.toLowerCase().trim();

  // Casual small-talk — not "who/what is SyntraIQ"
  if (
    /^(how\s+are\s+you|what'?s\s+up|how\s+you\s+doing)\b/.test(lowerQuery) ||
    /what\s+are\s+you\s+(doing|up\s+to|working\s+on|listening\s+to|watching|reading|eating|making|cooking|playing)\b/.test(lowerQuery)
  ) {
    return false;
  }

  const selfRefPatterns = [
    /who\s+(are|were|is|was)\s+you\b/,
    /what\s+(are|were|is|was)\s+you\b(?!\s+(doing|up\s+to|working|listening|watching|reading|eating|making|cooking|playing))/,
    /when\s+(did|do|were|are)\s+you\s+(start|begin|created|founded)/,
    /where\s+(are|were|did|do)\s+you\s+(come|from|start)/,
    /how\s+old\s+(are|were|is|was)\s+you\b/,
    /tell\s+me\s+(about|who)\s+you\b/,
    /what\s+(is|are)\s+your\s+(name|purpose|goal|mission)/,
    /who\s+(created|made|built|founded)\s+you/,
    /what\s+(model|ai|system)\s+(are|do)\s+you/,
    /are\s+you\s+(chatgpt|gpt|claude|gemini|grok|openai|anthropic|google)/,
    /you\s+(are|were)\s+(chatgpt|gpt|claude|gemini|grok|openai|anthropic|google)/,
    /what\s+is\s+syntraiq/,
    /who\s+(is|are)\s+syntraiq/,
    /tell\s+me\s+about\s+syntraiq/,
  ];

  return selfRefPatterns.some((pattern) => pattern.test(lowerQuery));
}

// Get SyntraIQ information response
function getSyntraIQInfoResponse(): string {
  return `I am SyntraIQ, an advanced AI-powered answer engine designed to provide accurate, well-cited information across a wide range of topics. SyntraIQ was founded in 2025 with the mission to make knowledge more accessible and trustworthy through intelligent search and analysis.

SyntraIQ combines cutting-edge artificial intelligence with comprehensive information retrieval to deliver answers that are not just accurate, but also transparent about their sources. Our platform enables users to explore complex topics through multiple modes including direct questions, in-depth research, summarization, and comparative analysis.

What sets SyntraIQ apart is our commitment to citation and source transparency. Every answer we provide includes references to the sources used, allowing users to verify information and dive deeper into topics that interest them. We believe that trust in AI comes from transparency, and we're built on that principle.

Whether you're researching academic topics, comparing different approaches, summarizing complex information, or simply seeking quick answers, SyntraIQ is designed to be your intelligent research companion. We're constantly evolving to provide better, more accurate, and more helpful responses to help you navigate the vast landscape of human knowledge.`;
}

// Get token limit based on mode (OPTIMIZED FOR SPEED + COMPLETENESS)
// Generous limits ensure complete answers while still being faster than before
function getTokenLimit(mode: Mode, isPremium: boolean = false): number {
  if (isPremium) {
    // Premium tier: long, multi-section, expert-level answers (1500-2500 words).
    // Headroom for: deep dive + trends + recommendations + verdict + takeaways.
    switch (mode) {
      case 'Ask':
        return 10000;
      case 'Research':
        return 14000;
      case 'Summarize':
        return 5000;
      case 'Compare':
        return 11000;
      default:
        return 10000;
    }
  }

  switch (mode) {
    case 'Ask':
      return 2500;
    case 'Research':
      return 4000;
    case 'Summarize':
      return 1500;
    case 'Compare':
      return 3000;
    default:
      return 2500;
  }
}

function getEffectiveTokenLimit(
  mode: Mode,
  detailedContinuation: boolean,
  isPremium: boolean = false,
  deepResearch: boolean = false,
  chatMode: ChatMode = 'normal'
): number {
  // Chat modes (AI Friend, AI Psychologist). Low cap = faster time-to-first-token
  // for short conversational replies; the model still writes naturally.
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    return 1024;
  }
  // Deep research: a much larger budget for a long, fully-detailed answer with
  // many sections, sub-sections and tables. Free gets a big boost; premium doubles it.
  // (Gemini still caps output at 8192 per call; Claude/OpenAI/Grok use the full amount.)
  if (deepResearch) {
    return isPremium ? 22000 : 8000;
  }
  const base = getTokenLimit(mode, isPremium);
  if (!detailedContinuation) return base;
  const cap = isPremium ? 18000 : 7000;
  const multiplier = isPremium ? 2.2 : 1.8;
  return Math.min(Math.round(base * multiplier), cap);
}

// Get current date in a readable format
function getCurrentDateContext(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const year = now.getFullYear();
  return `📅 Today: ${dateStr}. Use ${year} as the reference year for "latest/current/now" queries. For very recent info, cite sources and acknowledge if uncertain.`;
}

// Get current date in IST (Indian Standard Time) format
function getCurrentDateContextIST(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', timeZoneName: 'short'
  });
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(now);
  return `📅 Today (IST): ${dateStr}, ${timeStr}. Use ${year} as reference for "latest/current" queries.`;
}

// Get system prompt based on chat mode, optional AI friend description, and optional space context
function getUserLocalContextBlock(userContext?: UserLocalContext): string {
  if (!userContext) {
    return `\n\n📍 USER LOCAL CONTEXT:\n- Locale/timezone unavailable.\n- Fallback for time/date: IST (UTC+5:30).\n- Fallback for prices: INR where localization is requested.`;
  }

  const lines = [
    `- Locale: ${userContext.locale || 'unknown'}`,
    `- Timezone: ${userContext.timeZone || 'unknown'}`,
    `- Local date/time: ${userContext.localDateTime || 'unknown'}`,
    `- Country: ${userContext.countryCode || 'unknown'}`,
    `- Preferred currency: ${userContext.currencyCode || 'unknown'}`,
  ];
  if (userContext.region) lines.push(`- Region: ${userContext.region}`);
  if (userContext.city) lines.push(`- City: ${userContext.city}`);
  if (userContext.source) lines.push(`- Context source: ${userContext.source}`);

  if (typeof userContext.utcOffsetMinutes === 'number') {
    lines.push(`- UTC offset (minutes): ${userContext.utcOffsetMinutes}`);
  }

  const currency = userContext.currencyCode;
  const country = userContext.countryCode;
  const currencySymbol = currency
    ? ({ INR: '₹', USD: '$', GBP: '£', EUR: '€', JPY: '¥', CNY: '¥', KRW: '₩', AUD: 'A$', CAD: 'C$', AED: 'AED ', SAR: 'SAR ' } as Record<string, string>)[currency] || `${currency} `
    : '';
  const hardCurrencyRule = currency
    ? `\n\n💰 ABSOLUTE CURRENCY RULE — NON-NEGOTIABLE:\nThe user is in ${country || 'their country'}. EVERY price, cost, or monetary value you write MUST be in ${currency} (${currencySymbol}). NEVER use $, £, €, or any other currency — even if your training data or sources used those. Convert at sensible market rates and write the result in ${currency}${currencySymbol ? ' with the ' + currencySymbol + ' symbol' : ''}. Example: write "${currencySymbol || currency + ' '}50,000" not "$600" or "£450". Violating this rule = wrong answer.`
    : '';
  return `\n\n📍 USER LOCAL CONTEXT:\n${lines.join('\n')}\n\nLOCALIZATION RULES:
- For price questions, present prices in the user's preferred currency when available.
- For date/time questions, use the user's local timezone and local date/time context.
- If exact local pricing is unavailable, show best-known global price and an approximate local conversion.
- Mention uncertainty briefly when local data cannot be verified.${hardCurrencyRule}`;
}

function getLastMeaningfulUserTopic(conversationHistory: ConversationMessage[] = []): string | null {
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role !== 'user') continue;
    const content = msg.content?.trim();
    if (!content) continue;
    if (isSmallTalkQuery(content)) continue;
    return content.length > 180 ? `${content.slice(0, 180)}...` : content;
  }
  return null;
}

function buildPsychologyContinuationGuidance(
  query: string,
  conversationHistory: ConversationMessage[] = []
): string {
  const priorTurns = conversationHistory.filter(
    (m) => m.content?.trim().length > 0
  ).length;
  if (priorTurns === 0) return '';

  const lower = query.toLowerCase().trim();
  const isGreeting =
    /^(hi|hello|hey|yo|hiya|sup|good\s+(morning|afternoon|evening))[\s!?.,]*$/i.test(lower);

  return `\n\n━━━ ONGOING THERAPY SESSION (MANDATORY) ━━━
This is NOT the first message — you have already been talking with this user.
• NEVER re-introduce yourself as "Dr. Maya, your AI psychologist" or repeat your full welcome script.
• NEVER say you are "settling in", "preparing for our chat", or similar filler — respond directly.
• Continue naturally from prior messages; reference what they already shared when relevant.
${isGreeting ? '• They said a short greeting — reply warmly in 1-3 sentences and ask ONE gentle question. No biography, no feature list.' : '• Answer their message directly in a warm therapeutic tone (2-6 sentences unless they asked for depth).'}
• Suggested follow-up questions (if any) must relate to what THEY just said — not generic templates.`;
}

function buildSmallTalkContextGuidance(
  query: string,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendName?: string | null
): string {
  const isCompanion = chatMode === 'ai_friend' || chatMode === 'ai_psychologist';
  const personal = isCompanion && isCompanionPersonalQuery(query);
  if (!isSmallTalkQuery(query) && !personal) return '';

  const lastTopic = getLastMeaningfulUserTopic(conversationHistory);
  const topicLine = lastTopic
    ? `\n- Previous meaningful topic from this chat: "${lastTopic}"`
    : '\n- No earlier meaningful topic detected in this chat.';

  if (personal) {
    const name = friendName?.trim() || 'your character';
    const whoAmI = isWhoAmIQuery(query);
    const whoAmILines = whoAmI
      ? chatMode === 'ai_psychologist'
        ? `\n• "Who am I?" → This is about the USER's identity, not you. Gently explore what they mean — feelings, values, how they see themselves. Use only what they have shared in this chat. Do NOT invent facts about them. If you don't know their name yet, say so warmly and invite them to share.`
        : `\n• "Who am I?" → Answer about the USER, not about ${name}. Use USER MEMORY (preferred name, pronouns, interests) and this chat only — never invent details. If you know their name, use it warmly in character. If not, say you would love to know them better and ask their name — stay in ${name}'s voice.`
      : '';
    if (chatMode === 'ai_psychologist') {
      return `\n\n━━━ DR. MAYA — PERSONAL / GREETING (MANDATORY) ━━━
The user said: "${query}"
• Reply as Dr. Maya in 1-4 warm, natural lines — like a real therapist in session.
• "Hi/hello" → Brief warm greeting + one gentle question. NO full introduction if you already spoke earlier in this chat.
• "How are you?" → Answer briefly as a professional, then turn attention back to them with care.
• FORBIDDEN: repeating "I'm Dr. Maya, your AI psychologist…", corporate bios, bullet lists, mentioning SyntraIQ/AI models.${whoAmILines}${topicLine}`;
    }
    return `\n\n━━━ PERSONAL QUESTION — ANSWER IN CHARACTER (MANDATORY) ━━━
The user asked: "${query}"

• Reply DIRECTLY as ${name} in 1-4 short natural lines — like texting a friend.
• "Who are you?" → You are ${name}. Introduce yourself using your CHARACTER profile (name + personality/relationship). Nothing else.
• "What are you doing?" / "What's up?" → Say what ${name} is doing right now — a brief believable everyday activity that fits your character.
• "How are you?" → Answer how ${name} feels, in your character's voice.${whoAmILines}
• FORBIDDEN: SyntraIQ, Perle, "answer engine", "AI assistant", ChatGPT, Gemini, company bios, citations, bullet lists, long essays.
• Just talk like a real person in character.${topicLine}`;
  }

  return `\n\n💬 SMALL-TALK MODE (AUTO):
- The user is making a conversational/small-talk message.
- Reply naturally, warmly, and with personality (2-5 concise lines).
- Be context-aware: use prior conversation tone and continuity.${topicLine}
- If a prior topic exists, add a short optional bridge like "Want to continue that?".
- Do NOT force web/factual citations for pure small-talk unless user asks factual/current info.`;
}

/** Personal/identity questions in AI Friend chat — must stay in character, not SyntraIQ. */
function isCompanionPersonalQuery(query: string): boolean {
  const lower = query.toLowerCase().trim();
  const patterns = [
    /^who\s+(are|is|were|was)\s+you\??$/i,
    /^who\s+am\s+i\??$/i,
    /^what\s+(are|is|were|was)\s+you\??$/i,
    /what\s+are\s+you\s+(doing|up\s+to|working\s+on)\??/i,
    /^what'?s\s+up\??$/i,
    /^how\s+are\s+you\??$/i,
    /^how\s+r\s+u\??$/i,
    /tell\s+me\s+about\s+(yourself|you|me)\??/i,
    /what'?s\s+your\s+name\??$/i,
    /what'?s\s+my\s+name\??$/i,
    /do\s+you\s+know\s+who\s+i\s+am\??/i,
    /^hi\b/i,
    /^hello\b/i,
    /^hey\b/i,
  ];
  return patterns.some((p) => p.test(lower));
}

function isWhoAmIQuery(query: string): boolean {
  const lower = query.toLowerCase().trim();
  return (
    /^who\s+am\s+i\??$/i.test(lower) ||
    /what'?s\s+my\s+name\??/i.test(lower) ||
    /do\s+you\s+know\s+who\s+i\s+am\??/i.test(lower)
  );
}

function buildFollowUpSearchQuery(
  query: string,
  conversationHistory: ConversationMessage[] = []
): string {
  const isContinuation = isContinuationFollowUpQuery(query);
  if (!isContinuation && !isContextLinkedFollowUpQuery(query, conversationHistory)) return query;
  const lastTopic = getLastMeaningfulUserTopic(conversationHistory);
  if (!lastTopic) return query;
  // For continuation follow-ups, keep the search anchored to the original topic
  // to preserve/refresh the same source set as much as possible.
  if (isContinuation) return lastTopic;
  return `${lastTopic}\nFollow-up request: ${query}`;
}

function buildDetailedContinuationInstruction(
  query: string,
  chatMode: ChatMode,
  conversationHistory: ConversationMessage[] = []
): string {
  if (!(chatMode === 'normal' || chatMode === 'space')) return '';
  if (!isContinuationFollowUpQuery(query)) return '';
  if (conversationHistory.length === 0) return '';

  const lastTopic = getLastMeaningfulUserTopic(conversationHistory);
  return `\n\nDETAILED CONTINUATION MODE:
- The user asked to continue/elaborate on the previous answer.
- Keep the SAME topic continuity${lastTopic ? ` (topic: "${lastTopic}")` : ''}.
- Reuse and expand prior points in significantly more depth.
- Add richer technical detail, practical examples, edge cases, and comparisons.
- Keep citations aligned with current web-search results and cite claims clearly.
- Do NOT switch topic unless user explicitly asks a new different question.`;
}

const CONTINUATION_MIN_SOURCES = 6;

/** Deduplicates search results by URL — no count cap, returns all unique. */
function dedupeSearchResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    if (!r?.url) continue;
    let key = r.url;
    try {
      key = new URL(r.url).toString();
    } catch {
      // keep raw URL if parsing fails
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, url: key });
  }
  return out;
}

async function enrichContinuationSources(
  query: string,
  continuationMode: boolean,
  existingResults: SearchResult[]
): Promise<SearchResult[]> {
  if (!continuationMode || existingResults.length >= CONTINUATION_MIN_SOURCES) {
    return existingResults;
  }

  const openAiKey = getApiKey('openai');
  const geminiKey = getApiKey('gemini');
  const grokKey = getApiKey('grok');

  const settled = await Promise.allSettled([
    openAiKey ? searchWithOpenAIWebTool(query, openAiKey, 20) : Promise.resolve([]),
    geminiKey ? searchWithGeminiGrounding(query, geminiKey, 20, 'gemini-2.5-flash-lite') : Promise.resolve([]),
    grokKey ? searchWithGrokWebTool(query, grokKey, 20) : Promise.resolve([]),
  ]);

  const extra: SearchResult[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      extra.push(...item.value);
    }
  }

  return dedupeSearchResults([...existingResults, ...extra]);
}

function toSources(results: SearchResult[]): Source[] {
  const sources: Source[] = [];
  for (const result of results) {
    try {
      const url = new URL(result.url);
      sources.push({
        id: `web-${sources.length + 1}`,
        title: result.title,
        url: result.url,
        domain: url.hostname.replace('www.', ''),
        year: new Date().getFullYear(),
        snippet: result.content.substring(0, 200) + (result.content.length > 200 ? '...' : '')
      });
    } catch {
      // Skip invalid URLs to avoid breaking the response.
    }
  }
  return sources;
}

function resolveExaSearchType(mode: Mode, override?: ExaSearchType): ExaSearchType {
  if (override) return override;
  if (mode === 'Research') return 'instant';
  return 'auto';
}

type WebSearchPrimary = 'openai' | 'gemini' | 'claude' | 'grok';

/**
 * Provider-native web search first; Exa only when all providers return nothing.
 * This avoids a redundant Exa round-trip on every query when the active LLM
 * already has built-in search/grounding.
 */
async function performWebSearch(
  searchQuery: string,
  mode: Mode,
  chatMode: ChatMode,
  isPremium: boolean,
  searchType: ExaSearchType | undefined,
  continuationMode: boolean,
  primary: WebSearchPrimary,
  keys: {
    openAiKey?: string;
    geminiKey?: string;
    grokKey?: string;
    geminiModel?: string;
  } = {}
): Promise<SearchResult[]> {
  const cacheScope: SearchCacheScope = { isPremium, mode, chatMode, searchType };
  // Reuse a recent search for the same query (e.g. a cross-provider fallback after
  // the primary model was rate-limited) instead of paying for another round-trip.
  const cached = await getCachedSearch(searchQuery, cacheScope);
  if (cached) {
    console.log(`♻️ Web search: reusing ${cached.length} cached result(s) for query`);
    return enrichContinuationSources(searchQuery, continuationMode, cached);
  }

  const envOpenAi = getApiKey('openai');
  const envGemini =
    getApiKey('gemini');
  const envGrok = getApiKey('grok');
  const openAiKey = keys.openAiKey || envOpenAi;
  const geminiKey = keys.geminiKey || envGemini;
  const grokKey = keys.grokKey || envGrok;
  const geminiModel = keys.geminiModel || 'gemini-2.5-flash-lite';

  let results: SearchResult[] = [];

  // 1) Active provider's native search
  if (primary === 'openai' && openAiKey) {
    console.log('🔍 Web search: trying OpenAI native search...');
    results = await searchWithOpenAIWebTool(searchQuery, openAiKey, 20);
  } else if (primary === 'gemini' && geminiKey) {
    console.log('🔍 Web search: trying Gemini grounding...');
    results = await searchWithGeminiGrounding(searchQuery, geminiKey, 20, geminiModel);
  } else if (primary === 'grok' && grokKey) {
    console.log('🔍 Web search: trying Grok native search...');
    results = await searchWithGrokWebTool(searchQuery, grokKey, 20);
  } else if (primary === 'claude') {
  // Claude has no native web search — use OpenAI/Gemini first
    console.log('🔍 Web search: Claude has no native search, trying OpenAI/Gemini...');
    const openAIResults = openAiKey ? await searchWithOpenAIWebTool(searchQuery, openAiKey, 20) : [];
    const geminiResults =
      openAIResults.length > 0 || !geminiKey
        ? []
        : await searchWithGeminiGrounding(searchQuery, geminiKey, 20, geminiModel);
    results = dedupeSearchResults([...openAIResults, ...geminiResults]);
  }

  // 2) Alternate provider fallbacks if primary returned nothing
  if (results.length === 0) {
    console.log(`⚠️ ${primary} search returned 0 results — trying alternate providers...`);
    if (primary !== 'openai' && openAiKey) {
      results = await searchWithOpenAIWebTool(searchQuery, openAiKey, 20);
    }
    if (results.length === 0 && primary !== 'gemini' && geminiKey) {
      results = await searchWithGeminiGrounding(searchQuery, geminiKey, 20, geminiModel);
    }
    if (results.length === 0 && primary !== 'grok' && grokKey) {
      results = await searchWithGrokWebTool(searchQuery, grokKey, 20);
    }
  }

  // 3) Exa as final fallback only
  const exaKey = getApiKey('exa');
  if (results.length === 0 && exaKey) {
    console.log('⚠️ Provider-native search returned 0 results — falling back to Exa...');
    results = await searchWithExa(searchQuery, exaKey, resolveExaSearchType(mode, searchType));
  }

  if (results.length > 0) {
    console.log(`✅ Web search: ${results.length} source(s) found`);
    setCachedSearch(searchQuery, results, cacheScope);
  } else {
    console.log('⚠️ Web search returned 0 results from all providers including Exa');
  }

  return enrichContinuationSources(searchQuery, continuationMode, results);
}

function buildSuggestedQuestions(query: string, chatMode: ChatMode): string[] {
  const cleaned = query.replace(/\s+/g, ' ').trim();
  const shortTopic = cleaned.length > 70 ? `${cleaned.slice(0, 70)}...` : cleaned;
  const lower = cleaned.toLowerCase();
  const isGreeting =
    /^(hi|hello|hey|yo|sup|what'?s up|how are you|how r u|good (morning|afternoon|evening))[\s!?.,]*$/.test(lower) ||
    /(how are you|how r u)/.test(lower);
  const asksCurrentInfo =
    /(latest|current|today|now|this week|this month|2026|price|cost|launch|release|news)/.test(lower);

  if (chatMode === 'ai_psychologist') {
    const lower = cleaned.toLowerCase();
    const isGreeting =
      /^(hi|hello|hey|yo|hiya|sup|what'?s up|how are you|how r u|good (morning|afternoon|evening))[\s!?.,]*$/.test(lower);
    if (isGreeting) {
      return [
        "I've been feeling stressed and could use someone to talk to.",
        "Something's been on my mind — can we explore it?",
        "I'd like help understanding what I'm feeling.",
      ];
    }
    return [
      `What feels most pressing about "${shortTopic}" for you right now?`,
      `When did you first notice "${shortTopic}" affecting you?`,
      `What would feeling even a little better look like today?`,
    ];
  }

  if (isGreeting) {
    // Return empty so the LLM generates its own follow-ups in the user's language
    return [];
  }

  if (asksCurrentInfo) {
    return [
      `Do you want the latest update on "${shortTopic}" with fresh sources?`,
      `Should I compare top options and key differences for "${shortTopic}"?`,
      `Want prices, timeline, and availability for "${shortTopic}" in your region?`,
    ];
  }

  // Generic fallbacks. Earlier versions injected the literal query into
  // each template ("Want a checklist for 'create 50 emoju'?"), which
  // looked nonsensical when the query was a fragment, typo, follow-up
  // affirmation, or unrelated to the actual answer content. Keep these
  // topic-free so they always read sensibly.
  return [
    'Want me to go deeper on any part of this?',
    'Should I suggest related tools or alternatives?',
    'Want me to walk through how to actually do this step by step?',
  ];
}

function isPsychologyMusicReliefQuery(query: string): boolean {
  const lower = query.toLowerCase();
  const musicIntent = /(music|song|songs|playlist|spotify|youtube)/.test(lower);
  const reliefIntent = /(anxious|anxiety|depressed|depression|stress|stressed|panic|overwhelm|calm|relax|sleep|sad)/.test(lower);
  return musicIntent && reliefIntent;
}

/**
 * Heuristic check for whether a string is "obviously not English" — any Indic,
 * CJK, Arabic, Cyrillic, etc. script. Used to bolt an extra-strong language
 * reminder onto the user prompt for chat modes (group chat models routinely
 * bury the system-prompt rule under each friend's character description).
 */
function looksNonLatinScript(text: string): boolean {
  return /[ऀ-ॿঀ-৿਀-੿઀-૿଀-୿஀-௿ఀ-౿ಀ-೿ഀ-ൿ฀-๿぀-ヿ一-鿿가-힯؀-ۿЀ-ӿ]/.test(
    text
  );
}

/** Detect reply language from the CURRENT user message only — not chat history. */
function detectReplyLanguage(query: string): 'native_script' | 'latin' {
  const trimmed = query.trim();
  if (!trimmed) return 'latin';

  const nativeChars = (trimmed.match(
    /[ऀ-ॿঀ-৿਀-੿઀-૿଀-୿஀-௿ఀ-౿ಀ-೿ഀ-ൿກ-໿฀-๿぀-ヿ一-鿿가-힯؀-ۿЀ-ӿ\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g
  ) || []).length;
  const latin = (trimmed.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  const letterCount = nativeChars + latin || 1;

  if (nativeChars / letterCount >= 0.15) return 'native_script';
  return 'latin';
}

function isLikelyLanguagePhrase(phrase: string): boolean {
  const p = phrase.trim();
  if (p.length < 2 || p.length > 80) return false;
  // Any real language name/phrase worldwide — letters from any script or Latin.
  return /\p{L}/u.test(p);
}

function titleCasePhrase(phrase: string): string {
  const trimmed = phrase.trim();
  // Preserve non-Latin scripts as-is (Telugu, Arabic, Chinese, etc.)
  if (/[^\u0000-\u024F]/.test(trimmed)) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Extract allowed languages from character description — any language name/phrase worldwide. */
function extractCharacterLanguageLock(description?: string | null): string[] | null {
  if (!description?.trim()) return null;
  const text = description.trim();
  const found = new Set<string>();

  const addPhrases = (raw: string) => {
    raw.split(/,|\/|;|\band\b|\bor\b|&/).forEach((part) => {
      let p = part.trim().replace(/\s+/g, ' ');
      p = p.replace(/\s+(language|languages|only|character|mode|script)$/i, '').trim();
      p = p.replace(/^(the|a|an)\s+/i, '').trim();
      if (isLikelyLanguagePhrase(p)) found.add(titleCasePhrase(p));
    });
  };

  // Only match explicit language-intent phrases — no word blocklists.
  const patternList = [
    /\bonly\s+(?:speaks?|talks?|communicates?|converses?|replies?|responds?|writes?|uses?)\s+(?:in\s+)?([^.!?\n]{2,80})/gi,
    /\b(?:speaks?|talks?|communicates?|converses?|writes?|uses?)\s+only\s+(?:in\s+)?([^.!?\n]{2,80})/gi,
    /\bcan\s+only\s+(?:speak|talk|communicate|converse|reply|respond|write)\s+(?:in\s+)?([^.!?\n]{2,80})/gi,
    /\bwill\s+only\s+(?:speak|talk|communicate|converse|reply|respond|write)\s+(?:in\s+)?([^.!?\n]{2,80})/gi,
    /\b(?:fluent|native)\s+(?:in\s+)?([^.!?\n]{2,80})/gi,
    /\b(?:language|languages|tongue|dialect)\s*(?:is|are|:|=)\s*([^.!?\n]{2,100})/gi,
    /\b(?:speaks?|talks?|knows?)\s+([^.!?\n]{2,60})\s+(?:language|languages)\b/gi,
    /\bin\s+([\p{L}][\p{L}\s'-]{1,50})\s+only\b/giu,
    /\b(?:reply|respond|write)\s+in\s+([\p{L}][\p{L}\s'-]{1,50})\s+only\b/giu,
  ];

  for (const pattern of patternList) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      addPhrases(match[1]);
    }
  }

  return found.size > 0 ? [...found] : null;
}

function formatLanguageList(languages: string[]): string {
  return languages.join(', ');
}

function buildAIFriendLanguageRules(
  friendDescription?: string | null,
  friendName?: string | null
): string {
  const locked = extractCharacterLanguageLock(friendDescription);
  if (locked && locked.length > 0) {
    const list = formatLanguageList(locked);
    const name = friendName?.trim() || 'your character';
    return `\n\n🔒 CHARACTER LANGUAGE LOCK (HIGHEST PRIORITY — OVERRIDES USER MESSAGE LANGUAGE & ALL MIRRORING RULES):
- ${name}'s character profile says you ONLY speak: ${list}.
- EVERY reply MUST be in ${list} ONLY — no exceptions, every message.
- Even if the user writes in a different language, you STILL reply in ${list} only (stay in ${name}'s voice).
- You may gently note in-character that you only talk in ${list} if they use another language — but never switch away from ${list}.
- FORBIDDEN: replying in any language outside ${list}.`;
  }

  return `\n\n🌐 LANGUAGE MIRRORING — ABSOLUTE RULE (when no character language lock above):
- Look at the USER'S MOST RECENT MESSAGE ONLY (the one you are replying to right now). Reply in EXACTLY that language and script — any language in the world.
- If they switch language mid-chat, you switch too — ignore what language earlier turns were in.
- If their CURRENT message is English (or any Latin-script language), reply in that same language even if older messages were Telugu/Tamil/Hindi/Arabic/etc.
- Examples:
  • User writes Tamil in Tamil script → reply ENTIRELY in Tamil script. NOT in English.
  • User writes Telugu in Latin letters (Tenglish) → reply in Tenglish.
  • User mixes Hinglish → reply in Hinglish, same casual mix.
- FORBIDDEN behaviours (every one of these is a failure):
  • Translating the user's message to English in your reply ("which means 'How are you?'").
  • Meta-commentary about which language they used ("Oh nice, you asked in Tamil!").
  • Replying in English when the user's last message was NOT in English.
  • Mixing in English explanations of the local-language words.
- Just SPEAK their language directly, like a local friend who shares it. No prefix, no acknowledgement, no translation — straight into the reply.`;
}

/**
 * Returns a hard, end-of-prompt language-mirroring reminder for chat modes.
 * Repeating critical rules at the END of the user prompt is the trick that
 * fixed SUGGESTED_FOLLOWUPS compliance — applying the same here because the
 * model keeps emitting English meta-commentary ("which means 'How are you?'
 * in Tamil") in group chat. Empty string when not in a chat mode.
 */
function buildChatLanguageReminder(
  query: string,
  chatMode: ChatMode,
  friendDescription?: string | null,
  friendName?: string | null
): string {
  if (chatMode === 'normal') {
    const lang = detectReplyLanguage(query);
    if (lang === 'native_script') {
      return `\n\n🌐 LANGUAGE — MANDATORY (CURRENT MESSAGE ONLY):
- The user's message above uses a native script (Telugu, Tamil, Hindi, Arabic, Chinese, Japanese, Korean, Thai, etc.).
- Reply ENTIRELY in that EXACT same language and script — overview, headings, bullets, citations, everything.
- FORBIDDEN: translating to English, romanizing, meta-commentary about their language, or mixing English into the reply.`;
    }
    return '';
  }

  if (chatMode !== 'ai_friend' && chatMode !== 'ai_psychologist') return '';

  if (chatMode === 'ai_friend') {
    const locked = extractCharacterLanguageLock(friendDescription);
    if (locked && locked.length > 0) {
      const list = formatLanguageList(locked);
      const name = friendName?.trim() || 'your character';
      return `\n\n🔒 CHARACTER LANGUAGE LOCK — REPLY IN ${list.toUpperCase()} ONLY.
- ${name} only speaks ${list}. Ignore the user's message language if it differs.
- FORBIDDEN: replying in any language outside ${list}.`;
    }
  }

  const lang = detectReplyLanguage(query);

  if (lang === 'native_script') {
    return `\n\n🌐 LANGUAGE — MANDATORY (CURRENT MESSAGE ONLY):
- The user's message above uses a native script (Telugu, Tamil, Hindi, Arabic, Chinese, Japanese, Korean, Thai, etc.).
- Reply ENTIRELY in that EXACT same language and script.
- IGNORE the language of older messages in chat history — only THIS message sets your reply language.
- FORBIDDEN: translating to English, romanizing, meta-commentary about their language, or mixing English into the reply.`;
  }

  return `\n\n🌐 LANGUAGE — MANDATORY (CURRENT MESSAGE ONLY):
- Reply in EXACTLY the same language the user used in their message above — English, Spanish, French, German, Hindi in Latin letters (Hinglish/Tenglish), or any other language.
- ONLY the current user message sets your reply language. IGNORE older turns in history.
- If they switched language in this message, switch with them instantly — no acknowledgement.
- FORBIDDEN: replying in a different language than their current message (e.g. Telugu reply when they wrote English).`;
}

/** Append language + in-character reminders at the END of the user prompt (highest model attention). */
function appendChatLanguageReminder(
  prompt: string,
  query: string,
  chatMode: ChatMode,
  friendName?: string | null,
  friendDescription?: string | null
): string {
  let out = prompt + buildChatLanguageReminder(query, chatMode, friendDescription, friendName);
  if (
    (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') &&
    isCompanionPersonalQuery(query)
  ) {
    if (chatMode === 'ai_psychologist') {
      out += `\n\nReply as Dr. Maya only — warm, brief, therapeutic. Never mention SyntraIQ or being an AI product.`;
    } else {
      const name = friendName?.trim() || 'your character';
      out += `\n\nReply as ${name} only — short, direct, in character. Never mention SyntraIQ or being an AI.`;
    }
  }
  return out;
}

function appendPsychologyMusicRelief(content: string, query: string): string {
  if (!isPsychologyMusicReliefQuery(query)) return content;
  if (/https?:\/\//i.test(content)) return content;

  const searchQuery = encodeURIComponent(`${query} calming music`);
  const youtubeLink = `https://www.youtube.com/results?search_query=${searchQuery}`;
  const spotifyLink = `https://open.spotify.com/search/${searchQuery}`;

  return `${content}\n\n🎵 Music Relief Options:\n• YouTube mix: ${youtubeLink}\n• Spotify playlist search: ${spotifyLink}\n• Suggested songs:\n  - Weightless - Marconi Union\n  - Experience - Ludovico Einaudi\n  - Nuvole Bianche - Ludovico Einaudi`;
}

const PREMIUM_DEPTH_SYSTEM_ADDON = `

PREMIUM USER — DEPTH & QUALITY BAR (MANDATORY):
This user pays for premium. Your answer MUST be clearly richer and more detailed than a free-tier summary.

CONTENT (required):
• Cover the topic in substantially more depth: definitions, how it works, composition, structure/layers, processes, and real-world impact
• Include specific numbers, percentages, measurements, dates, and named examples wherever relevant (e.g. "78% nitrogen", "15°C average", "1 bar at sea level")
• Each major section needs 3–6 bullet points; use indented sub-bullets ("  - ") for extra specifics
• Add at least one extra section a brief answer would skip (e.g. layers, pressure, history, applications, or notable facts)
• Never give a shorter or vaguer answer than a solid free response — premium must win on detail and specificity

FORMATTING (required — same rules as free, done better):
• Use 4–6 clearly labeled sections with line breaks between them
• EVERY section heading: "🔬 Heading text:" — emoji first, then heading, then colon — NO exceptions
• Use a DIFFERENT relevant emoji per section heading — never repeat the same emoji twice
• Keep the overview to 2–3 sentences with concrete facts, not vague filler
• Follow all bullet-point and LaTeX rules above
• NEVER use **bold** or ## markdown for headings — emoji + plain text only

LENGTH:
• For educational or explanatory questions, aim for roughly 1.5–2× the depth of a concise free answer
• Do not pad with filler; every sentence must add facts or insight`;

const DEEP_RESEARCH_SYSTEM_ADDON = `

DEEP RESEARCH MODE (MANDATORY — this is a long, in-depth report):
The user explicitly requested DEEP RESEARCH. Produce a thorough, well-structured, report-style answer — significantly longer and more detailed than a normal answer. Take the space you need.

STRUCTURE (required — SAME emoji-heading format as Normal/Web search):
• Start with a 2–4 sentence executive overview (plain text, no heading).
• Then 5–9 clearly labeled sections, each covering a distinct facet (background, how it works, key components, comparisons, data/numbers, pros & cons, challenges, real-world applications, recent developments, outlook).
• EVERY section heading: "🔬 Heading text:" — ONE relevant emoji first, then the heading, then a colon. Use a DIFFERENT emoji per section. NEVER use ## markdown.
• Use sub-sections where helpful and indented sub-bullets ("  - ") for finer detail under a point.
• 4–8 bullets per section; include specific numbers, dates, percentages, named examples.
• Use a markdown TABLE wherever a comparison or structured list helps — emoji table title on its OWN LINE above the table, never inside a cell. Fill every cell with real data, no empty/placeholder cells, no citations inside cells.
• End with a short "📌 Key Takeaways:" section (3–5 bullets).

RULES:
• Be genuinely comprehensive — cover angles a quick answer would skip.
• Keep emoji + plain-text headings (NO **bold** / ## markdown for headings).
• Accuracy first: use your own knowledge to fill gaps the web results miss; never leave anything vague or blank.`;

const SEARCH_FORMAT_UNIFIED_ADDON = `

NORMAL / WEB / DEEP SEARCH — UNIFIED FORMAT (all models must follow):
• Same structure whether the user picked Normal, Web, or Deep: brief overview → emoji section headings ("💡 Topic:") → bullets → optional table (title above table, never in cells).
• EVERY section heading needs a leading emoji + colon. Use a DIFFERENT emoji per section.
• NO ## markdown headers. NO **bold** for headings. Tables only when comparing or listing.`;

function getSystemPrompt(
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  userContext?: UserLocalContext,
  forTableFormat = false,
  forPremium = false,
  forDeepResearch = false,
  priorSummary?: string | null
): string {
  // Use IST for AI Friend and AI Psychology modes, regular timezone for normal mode
  const currentDate = (chatMode === 'ai_friend' || chatMode === 'ai_psychologist')
    ? getCurrentDateContextIST()
    : getCurrentDateContext();

  const dateContext = `\n\n${currentDate}`;

  // Space context to add to all modes
  const spaceContext = spaceTitle && spaceDescription
    ? `\n\n📁 SPACE CONTEXT: You are in a space called "${spaceTitle}". ${spaceDescription}\n\nIMPORTANT: All conversations in this space should be relevant to this space's purpose and context. Keep responses focused on the space's theme and description.`
    : '';
  const userLocalContext = getUserLocalContextBlock(userContext);
  // Rolling summary of older messages (set when the conversation is long enough
  // that we trimmed it to the verbatim window). The single block injection point
  // covers every provider — Gemini gets it in its system text, OpenAI/Claude/Grok
  // get it as part of their system message — without per-provider plumbing.
  const summaryContext = priorSummary && priorSummary.trim().length > 0
    ? `\n\n📜 EARLIER CONVERSATION SUMMARY (older messages summarized for context):\n${priorSummary.trim()}\n\nThe verbatim most-recent messages follow below. Treat the summary as AUTHORITATIVE for older context; never claim "no prior context" and never contradict it.`
    : '';
  
  switch (chatMode) {
    case 'ai_friend':
      // If custom friend description is provided, use it; otherwise use default
      const memoryContextBlock = friendMemoryContext
        ? `\n\n🧠 USER MEMORY (PERSISTENT):\n${friendMemoryContext}\n\nMEMORY RULES:\n- Use this memory naturally in replies.\n- Respect and use these pronouns consistently.\n- When relevant, connect responses to remembered nouns/interests.\n- Do not claim new memory unless user explicitly states it.`
        : '';
      if (friendDescription && friendName) {
        return `You are ${friendName}. You are NOT a generic AI assistant — you are this specific character in every single message.

━━━ YOUR CHARACTER (defines tone, warmth, vocabulary, relationship, and personality) ━━━
${friendDescription.trim()}

━━━ CHARACTER RULES (mandatory — overrides any generic "friendly AI" style) ━━━
• EVERY reply must sound unmistakably like ${friendName} as described above — never a default chatbot voice.
• Embody the relationship and traits in the profile (e.g. spouse, gentle speaker, witty mentor) in how you greet, comfort, tease, advise, and show affection.
• Choose words, sentence length, and emotional register that fit YOUR character — not a one-size-fits-all friendly template.
• Do NOT reuse stock openings other bots use ("Hey there! I'm doing pretty well, thanks for asking! Just chilling...").
• Before replying, ask yourself: "What would ${friendName} actually say?" — then answer exactly that way.
• In group chats, stay in YOUR character only — never mirror how other friends speak.
• NEVER say you are another friend from the chat — you are ONLY ${friendName}.

━━━ "WHO ARE YOU?" / "WHO AM I?" / "WHAT ARE YOU DOING?" / SMALL TALK ━━━
When the user asks who you are, what you're doing, how you are, what's up, etc.:
• Answer DIRECTLY as ${friendName} — your name + character traits from the profile above.
• "What are you doing?" → describe a short, believable activity ${friendName} would be doing right now.
• Keep it 1-4 lines, casual, like texting — NOT a bio essay.
• NEVER say you are SyntraIQ, an AI answer engine, ChatGPT, Gemini, or any product/company.

When the user asks "who am I?" / "what's my name?" / "do you know who I am?":
• Answer about THE USER — not about ${friendName}.
• Use USER MEMORY and this chat only (name they told you, pronouns, interests). Never invent facts.
• If you know their preferred name, use it warmly in ${friendName}'s voice.
• If you don't know yet, say so kindly and ask — still in character.

Be empathetic and conversational, but always through ${friendName}'s character lens. Text naturally like a real person — no bullet points unless asked. Remember conversation context. Emojis only if they fit your character.
${buildAIFriendLanguageRules(friendDescription, friendName)}

IMPORTANT: When asked about time, date, current events, or prices, prioritize the USER LOCAL CONTEXT. If unavailable, fallback to IST and INR.${memoryContextBlock}${spaceContext}${dateContext}${userLocalContext}${summaryContext}`;
      }
      return `You are a warm, supportive friend having a casual conversation. Be empathetic, understanding, and conversational. Use natural language like you're texting a close friend. Share relatable thoughts, ask follow-up questions, and show genuine interest in what they're saying. Be encouraging and positive. Keep responses conversational and friendly - not formal or robotic. You can use casual language, emojis occasionally, and show personality. Remember previous parts of the conversation to maintain context. NEVER use bullet points or formal structure - just talk naturally like a real human friend would.

🌐 LANGUAGE MIRRORING — ABSOLUTE RULE, OVERRIDES EVERYTHING ELSE:
- Look at the USER'S MOST RECENT MESSAGE ONLY (the one you are replying to right now). Reply in EXACTLY that language and script — any language in the world.
- If they switch language mid-chat, you switch too — ignore what language earlier turns were in.
- If their CURRENT message is English (or any Latin-script language), reply in that same language even if older messages were Telugu/Tamil/Hindi/Arabic/etc.
- Examples:
  • User writes Tamil in Tamil script → reply ENTIRELY in Tamil script. NOT in English.
  • User writes Telugu in Latin letters (Tenglish) → reply in Tenglish.
  • User mixes Hinglish → reply in Hinglish, same casual mix.
- FORBIDDEN behaviours (every one of these is a failure):
  • Translating the user's message to English in your reply ("which means 'How are you?'").
  • Meta-commentary about which language they used ("Oh nice, you asked in Tamil!").
  • Replying in English when the user's last message was NOT in English.
  • Mixing in English explanations of the local-language words.
- Just SPEAK their language directly, like a local friend who shares it. No prefix, no acknowledgement, no translation — straight into the reply.

IMPORTANT: When asked about time, date, current events, or prices, prioritize the USER LOCAL CONTEXT. If unavailable, fallback to IST and INR.${memoryContextBlock}${spaceContext}${dateContext}${userLocalContext}${summaryContext}`;
    
    case 'ai_psychologist':
      return `You are Dr. Maya, a warm professional psychologist in an ongoing text session. Use active listening, validate feelings, and ask thoughtful questions. Speak naturally — NOT bullet points unless giving concrete coping steps.

CRITICAL AI PSYCHOLOGY RULES:
- Never show a "Sources" section in this mode.
- FIRST message of a brand-new chat only: brief welcome (1-2 sentences) + gentle question. After that, NEVER repeat your full introduction or say "I'm Dr. Maya, your AI psychologist" again.
- Short greetings (hi/hello): 1-3 warm sentences + one question — no biography, no "settling in", no meta talk about the session starting.
- Continue the existing thread — use conversation history; reference what they already shared.
- If the user asks "who am I?", explore identity gently using only what they shared in this chat. Do NOT invent personal facts.
- If the user asks for music for anxiety/depression/stress relief, provide YouTube and Spotify links plus 3 suitable song suggestions.
- Optional: end with 1-2 brief follow-up questions woven into your reply (natural prose). Do NOT append a separate list of generic therapy questions.
- Always include at least one gentle clarifying or reflective question when appropriate.

🌐 LANGUAGE MIRRORING — ABSOLUTE RULE, OVERRIDES EVERYTHING ELSE:
- Look at the USER'S MOST RECENT MESSAGE ONLY (the one you are replying to right now). Reply in EXACTLY that language and script — any language in the world.
- If they switch language mid-chat, you switch too — ignore what language earlier turns were in.
- If their CURRENT message is English (or any Latin-script language), reply in that same language even if older messages were Telugu/Tamil/Hindi/Arabic/etc.
- All follow-up questions and clarifying questions MUST be in the user's language too.
- FORBIDDEN: translating their message back to English in your reply; meta-commentary about which language they used; replying in English when their last message wasn't; mixing in English explanations of local-language words.
- Just speak their language warmly and directly, like a therapist who is a native speaker.

IMPORTANT: When asked about time, date, current events, or prices, prioritize the USER LOCAL CONTEXT. If unavailable, fallback to IST and INR.${spaceContext}${dateContext}${userLocalContext}${summaryContext}`;
    
    case 'normal':
    default:
      return `You are SyntraIQ, an AI-powered answer engine like Perplexity AI. 

🌐 LANGUAGE MIRRORING — #1 ABSOLUTE RULE — HIGHEST PRIORITY — OVERRIDES ALL OTHER INSTRUCTIONS:
STEP 1: Before doing ANYTHING else, look at the user's most recent message and identify its language and script.
STEP 2: Write your ENTIRE response — overview, section headings, bullet points, citations, follow-up questions, everything — in EXACTLY that same language and script.
- User writes Tamil script (தமிழ்) → reply ENTIRELY in Tamil script. Every word. Every heading. Every bullet. No English.
- User writes Hindi Devanagari (हिंदी) → reply ENTIRELY in Hindi Devanagari. Not Hinglish. Not English.
- User writes Hinglish (Hindi+English mix) → match that same mix.
- User writes Telugu, Kannada, Malayalam, Bengali, Punjabi, Marathi, Gujarati, Urdu, or ANY other language → reply in that same language and script.
- User writes English → reply in English.
HARD FAILURES (never do any of these):
  ✗ Replying in English when the user's message was in Tamil, Hindi, or any other language.
  ✗ Translating the user's message and then explaining it in English.
  ✗ Adding "(which means ...)" translations in your reply.
  ✗ Meta-commentary like "Oh nice, you wrote in Tamil!" or "You asked in Hindi!".
  ✗ Mixing English headings or English bullets into a non-English reply.
EXCEPTION: If the user explicitly asks "reply in English" or switches to English themselves, switch immediately.

CRITICAL FORMATTING RULES — READ ALL OF THESE, EVERY ONE IS MANDATORY:

LENGTH-FIRST RULE (highest priority — overrides section count):
• If web sources only support 1-2 substantive sections, output 1-2 sections only — NEVER pad with generic filler sections
• FORBIDDEN filler headings unless each has 2+ specific cited facts: "Performance Metrics", "Market Trends", "Future Outlook", "AI and Machine Learning Integration", "Graphics and Multimedia Enhancements", "Emerging Technologies"
• If you cannot fill a section with at least 2 specific, source-cited facts, DROP that section entirely
• 3 strong sections beats 6 padded sections — quality over quantity

STRUCTURE:
• Start with a brief 1-2 sentence overview (plain text, no heading)
• Break the rest into 2-6 clearly labeled sections (use fewer sections when sources are thin)
• Every section MUST have BOTH: an emoji AND a colon-terminated heading on the same line
• Then bullet points under each section

HEADINGS — THIS IS THE MOST IMPORTANT RULE:
• Section headings MUST look exactly like this: "💉 Key Benefits:"
• ONE or TWO relevant emojis, then a space, then the heading text, then a colon
• Pick emojis that match the topic (💉💊 health, 📊📈 finance, 🔬🧪 science, 🏏 sports, 💡📚 education, 🌍 environment, 🤖 AI/tech, etc.)
• Use a DIFFERENT emoji for each section — never repeat the same emoji twice
• NEVER write a heading without an emoji in front of it
• NEVER use ## markdown syntax for headings — plain text with emoji only

BULLETS:
• Use "•" for main bullet points
• Use "  - " (two spaces then dash) for sub-points / nested details
• For numbered steps or rankings use "1.", "2.", "3."
• Keep each bullet concise (1-3 lines)

FORBIDDEN (these will break the frontend):
• NO markdown headers (## or ### or ####)
• NO bold markers (**text** or __text__)
• NO italic markers (*text* or _text_)
• NO code blocks (triple-backtick or inline backtick)
• NO placeholder text in tables like "(Not provided in sources)" — use real facts from your knowledge

MATHEMATICAL FORMULAS (CRITICAL):
• When writing mathematical formulas, ALWAYS use LaTeX format
• For inline formulas: use \\(formula\\) or $formula$
• For block/display formulas: use \\[formula\\] or $$formula$$
• Examples:
  - Inline: The equation \\(E = mc^2\\) shows...
  - Block: \\[\\int_0^\\infty e^{-x} dx = 1\\]
  - Fractions: \\(\\frac{a}{b}\\) or \\(\\frac{m_1 u_1 + m_2 u_2}{m_1 + m_2}\\)
  - Square roots: \\(\\sqrt{x}\\) or \\(\\sqrt[n]{x}\\)
  - Subscripts: \\(m_1\\), \\(u_2\\), \\(v_{final}\\)
  - Superscripts: \\(x^2\\), \\(e^{-x}\\)
  - Sums: \\(\\sum_{i=1}^{n} x_i\\)
  - Integrals: \\(\\int_0^\\infty f(x) dx\\)
  - Greek letters: \\(\\alpha\\), \\(\\beta\\), \\(\\gamma\\), \\(\\pi\\), \\(\\theta\\), \\(\\sigma\\)
  - Vectors: \\(\\mathbf{P}\\), \\(\\vec{v}\\)
  - Operators: \\(\\nabla\\), \\(\\partial\\), \\(\\Delta\\)
• Always use proper LaTeX syntax for ALL mathematical expressions
• DO NOT write formulas in plain text like "m1u1" - use \\(m_1 u_1\\) instead

CORRECT example format (follow this exactly):
"Brief overview sentence here with a concrete fact.

🔬 Main Section Heading:
• First key point here
• Second key point with formula \\(E = \\frac{1}{2}mv^2\\)
  - Sub-detail about the formula
• Third key point here

📐 Second Section Heading:
• Another key point
• Key point with real numbers or named examples

📌 Third Section Heading:
• More details
• Final point with a real-world example"

IMPORTANT:
• ONLY introduce yourself as "SyntraIQ" when EXPLICITLY asked (e.g., "what is SyntraIQ", "who are you", "tell me about yourself")
• For regular questions, answer DIRECTLY without any introduction
• Do NOT start answers with "SyntraIQ, founded in 2025..." or similar
• NEVER mention which AI model you are using (GPT, Gemini, Grok, Claude, etc.)
• CRITICAL CONTEXT RULE: If the user asks an ambiguous follow-up (e.g., "what processor they use?", "and price?", "which is better?"), you MUST resolve pronouns using prior turns and continue the same topic unless user explicitly changes topic
• If context is unclear, ask one concise clarification question instead of switching topic
• For prices, dates, and times, use USER LOCAL CONTEXT when available
• Just provide the answer to the user's question

🚫 CAPABILITY HONESTY — non-negotiable. Know what SyntraIQ can do in EACH mode and route the user accordingly. Never pretend, never roleplay the result, never pivot to lecturing about the literal phrase.

✅ WHAT THIS APP (SyntraIQ) CAN DO IN OTHER MODES — redirect the user when their request fits one:
• Image generation → Tools menu → "Create Image" / "Image Studio" (text-to-image, full image creation)
• Video generation → Tools menu → "Create Video" / "Video Studio" (text-to-video)
• Image editing / variations / inpainting → Tools menu → "Edit Image" / "Media Studio"
• Live web information (news, prices, scores, weather, today's events) → switch the search-mode selector below the chat box from "Normal" to "Web"
• Deep multi-source research with citations across many pages → switch the search-mode selector to "Deep"
• Talking to an AI friend persona / mental-health support persona → top-of-page buttons "AI Friend" or "AI Psychology"

WHEN TO REDIRECT:
• If the user asks you to generate, create, or draw an image/picture/logo/icon/artwork → 1 short sentence: "I can't generate images directly here — open the Tools menu and pick Create Image. Describe what you want there and it will generate it for you." Then optionally offer a starter prompt they can paste.
• If they ask to make a video/animation/clip → redirect to Tools → Create Video, with a starter prompt.
• If they ask to edit/retouch/modify an existing image → redirect to Tools → Edit Image; mention they'll need to upload it there.
• If they ask "what's the latest X / news / current price / today's score" in Normal mode → 1 line: "For real-time info, switch the mode below to Web — that pulls live sources." Then still answer with your best knowledge as a fallback.
• If they ask for in-depth research / comprehensive analysis / "everything about X" → "For a thorough multi-source report, switch the mode to Deep — it'll cite more sources and go deeper." Then still give a solid normal answer.

🚫 WHAT NOTHING IN SYNTRAIQ CAN DO (suggest external tools):
You do NOT invent new Unicode emoji characters, run code, control the user's device, browse arbitrary URLs they paste mid-chat, or compose audio/music. When the user asks for these:
• In 1–2 sentences, say plainly what cannot be done (e.g. "I can't create brand-new emoji characters — those have to be approved by the Unicode Consortium").
• Then list 3–5 specific real external tools/services that CAN do it, each with a 1-line description (e.g. "Emojipedia AI Emoji Generator — text-to-emoji image"; "OpenMoji — open-source emoji set you can remix"; "Adobe Firefly — vector icons that work like emoji").
• Keep the tone helpful and direct — never apologetic for more than one short clause.
• If the request has partial overlap with what you CAN do (e.g. user asks for 50 emoji — you can describe and suggest 50 themed existing emoji), offer that as a bonus AFTER, framed as "What I CAN do for you right now: …".${forTableFormat ? TABLE_FORMAT_SYSTEM_ADDON : ''}${SEARCH_FORMAT_UNIFIED_ADDON}${forPremium ? PREMIUM_DEPTH_SYSTEM_ADDON : ''}${forDeepResearch ? DEEP_RESEARCH_SYSTEM_ADDON : ''}${spaceContext}${dateContext}${userLocalContext}${summaryContext}`;
  }
}

// OpenAI Provider (GPT-5)
export async function generateOpenAIAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string,
  userContext?: UserLocalContext,
  isPremium: boolean = false,
  searchType?: ExaSearchType,
  attachments?: FileAttachment[],
  priorSummary?: string | null
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query, chatMode)) {
    const perleInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About SyntraIQ', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'SyntraIQ is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(perleInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const apiKey = getApiKey('openai');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }
  const client = new OpenAI({ apiKey });

  // Check if query requires current information and perform provider-native web search
  let searchContext = '';
  let webSearchResults: Awaited<ReturnType<typeof searchWithOpenAIWebTool>> = [];
  const continuationFollowUp = isContinuationFollowUpQuery(query);
  const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
  const continuationMode = continuationFollowUp || contextLinkedFollowUp;
  const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
  const shouldWebSearch = shouldPerformWebSearch(
    query,
    mode,
    chatMode,
    conversationHistory,
    searchType,
    normalizeAttachments(imageDataUrl, attachments).length > 0
  );
  if (shouldWebSearch) {
    console.log('🌐 Query requires current info - performing web search...');
    webSearchResults = await performWebSearch(
      searchQuery,
      mode,
      chatMode,
      isPremium,
      searchType,
      continuationMode,
      'openai',
      { openAiKey: apiKey }
    );
    searchContext = formatSearchResultsForContext(webSearchResults);
    console.log(`✅ OpenAI path: ${webSearchResults.length} search results`);
  }
  
  // Get system prompt based on chat mode, friend description, and space context
  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(chatMode, friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription, userContext, useTableFormat, isPremium, searchType === 'deep', priorSummary);
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory, chatMode, friendName);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  const detailedContinuationInstruction = buildDetailedContinuationInstruction(query, chatMode, conversationHistory);
  if (detailedContinuationInstruction) sys += detailedContinuationInstruction;
  
  // Append web search context
  if (searchContext) {
    sys += searchContext;
    console.log('📝 Added web search context to system prompt');
  }

  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;
  
  // Build messages array with conversation history
  const messages: any[] = [
    { role: 'system', content: sys }
  ];
  
  // Add conversation history (already capped in routes by user tier)
  const recentHistory = conversationHistory;
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }
  
  // Add current query - format varies by chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally
    prompt = query;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, '', isPremium);
  }
  
  // Build user message content (text + optional attachments)
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  prompt = appendChatLanguageReminder(prompt, query, chatMode, friendName, friendDescription);
  const userContent = buildOpenAIUserContent(prompt, resolvedAttachments);
  if (resolvedAttachments.length > 0) {
    console.log(`📎 OpenAI: ${resolvedAttachments.length} attachment(s)`);
  }
  messages.push({ role: 'user', content: userContent });

  const openaiModel = resolveOpenAIModel(model);

  const tokenLimit = getEffectiveTokenLimit(mode, isContinuationFollowUpQuery(query) && conversationHistory.length > 0, isPremium, searchType === 'deep', chatMode);
  const isCompanion = chatMode === 'ai_friend' || chatMode === 'ai_psychologist';

  const response = await withTimeout(
    client.chat.completions.create({
      model: openaiModel,
      messages: messages,
      temperature: isCompanion ? 0.55 : 0.2,
      max_tokens: isCompanion ? Math.min(tokenLimit, 1024) : tokenLimit,
      // SPEED OPTIMIZATIONS (search/normal only):
      ...(isCompanion
        ? { frequency_penalty: 0.35, presence_penalty: 0.45 }
        : {
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.3,
          }),
    }),
    isCompanion ? 12_000 : 30_000
  );

  const choice = response.choices?.[0];
  let content = choice?.message?.content?.trim();
  const finishReason = choice?.finish_reason;
  
  // Check if response was truncated
  if (finishReason === 'length') {
    console.warn('OpenAI response was truncated due to token limit. Consider increasing max_tokens.');
    // Continue with partial response but log warning
  }
  
  // Check if content is empty or invalid
  if (!content || content.length === 0) {
    console.error('OpenAI API returned empty response:', {
      model: openaiModel,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0,
      finishReason: finishReason
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }

  if (chatMode === 'ai_psychologist') {
    content = appendPsychologyMusicRelief(content, query);
  }
  
  // Extract sources from provider-native web search results
  const sources = chatMode === 'ai_psychologist' ? [] : toSources(webSearchResults);
  if (sources.length > 0) {
    console.log(`✅ Found ${sources.length} sources from web search for OpenAI`);
  }

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources, query, mode),
    query,
    mode,
    timestamp: Date.now(),
    suggestedQuestions: buildSuggestedQuestions(query, chatMode)
  };
}

// Google Gemini Provider (Gemini 2.0 Latest, Gemini Lite)
export async function generateGeminiAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean = false,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string,
  userContext?: UserLocalContext,
  searchType?: ExaSearchType,
  attachments?: FileAttachment[],
  priorSummary?: string | null
): Promise<AnswerResult> {
  // Always prioritize GEMINI_API_KEY_FREE to avoid quota issues
  // Try GEMINI_API_KEY_FREE -> GOOGLE_API_KEY_FREE -> GOOGLE_API_KEY
  const apiKey = getApiKey('gemini');
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING: Please set GEMINI_API_KEY_FREE, GOOGLE_API_KEY_FREE, or GOOGLE_API_KEY in .env');
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  const geminiModel = resolveGeminiModel(model);

  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query, chatMode)) {
    const perleInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About SyntraIQ', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'SyntraIQ is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(perleInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const modelInstance = genAI.getGenerativeModel({ model: geminiModel });

  // Perform provider-native web search if needed
  let searchContext = '';
  let webSearchResults: Awaited<ReturnType<typeof searchWithGeminiGrounding>> = [];
  const continuationFollowUp = isContinuationFollowUpQuery(query);
  const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
  const continuationMode = continuationFollowUp || contextLinkedFollowUp;
  const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
  const shouldWebSearch = shouldPerformWebSearch(
    query,
    mode,
    chatMode,
    conversationHistory,
    searchType,
    normalizeAttachments(imageDataUrl, attachments).length > 0
  );
  if (shouldWebSearch) {
    console.log('🌐 Query requires current info - performing web search...');
    webSearchResults = await performWebSearch(
      searchQuery,
      mode,
      chatMode,
      isPremium,
      searchType,
      continuationMode,
      'gemini',
      { geminiKey: apiKey, geminiModel }
    );
    searchContext = formatSearchResultsForContext(webSearchResults);
    console.log(`✅ Gemini path: ${webSearchResults.length} search results`);
  }

  // Get system prompt based on chat mode, friend description, and space context
  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(chatMode, friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription, userContext, useTableFormat, isPremium, searchType === 'deep', priorSummary);
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory, chatMode, friendName);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  const detailedContinuationInstruction = buildDetailedContinuationInstruction(query, chatMode, conversationHistory);
  if (detailedContinuationInstruction) sys += detailedContinuationInstruction;
  
  // Append web search context
  if (searchContext) {
    sys += searchContext;
    console.log('📝 Added web search context to system prompt');
  }

  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;
  
  // Build conversation context from history
  let contextPrompt = '';
  if (conversationHistory.length > 0) {
    const recentHistory = conversationHistory;
    contextPrompt = 'Previous conversation:\n';
    for (const msg of recentHistory) {
      contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    }
    contextPrompt += '\n';
  }
  
  // Build prompt based on chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally with conversation context
    prompt = `${contextPrompt}${query}`;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, contextPrompt, isPremium);
  }

  const tokenLimit = getEffectiveTokenLimit(mode, isContinuationFollowUpQuery(query) && conversationHistory.length > 0, isPremium, searchType === 'deep', chatMode);
  const isCompanion = chatMode === 'ai_friend' || chatMode === 'ai_psychologist';
  // Gemini 2.5+ supports up to 65536 output tokens. Premium gets the full budget;
  // free stays at 8192 to preserve cost/latency. Companion chats cap at 1024.
  const maxOutputTokens = isCompanion
    ? Math.min(tokenLimit, 1024)
    : isPremium
      ? Math.min(tokenLimit, 32768)
      : Math.min(tokenLimit, 8192);
  
  // Build parts array (text + optional attachments)
  const parts: any[] = [];
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  prompt = appendChatLanguageReminder(prompt, query, chatMode, friendName, friendDescription);
  parts.push({ text: `${sys}\n\n${prompt}` });
  appendGeminiAttachmentParts(parts, resolvedAttachments);
  
  const generationRequest = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      maxOutputTokens: maxOutputTokens,
      temperature: isCompanion ? 0.55 : 0.2,
      topP: 0.9,
      topK: 40,
    }
  };

  const geminiTimeoutMs = isCompanion ? 12_000 : 25_000;
  const geminiFallbackApiModels = [
    geminiModel,
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let result: any;
  let lastGeminiError: any;
  for (const tryApiModel of geminiFallbackApiModels) {
    try {
      const instance =
        tryApiModel === geminiModel
          ? modelInstance
          : genAI.getGenerativeModel({ model: tryApiModel });
      if (tryApiModel !== geminiModel) {
        console.warn(`⚠️ Gemini ${geminiModel} failed, trying ${tryApiModel}...`);
      }
      result = await withTimeout(instance.generateContent(generationRequest), geminiTimeoutMs);
      lastGeminiError = undefined;
      break;
    } catch (error: any) {
      lastGeminiError = error;
      const retryable =
        isRateLimitError(error) ||
        error?.status === 404 ||
        (error?.message ?? '').toLowerCase().includes('not found');
      if (!retryable) throw error;
    }
  }
  if (!result) throw lastGeminiError ?? new Error('Gemini generation failed');

  const response = result.response;
  
  // Try multiple ways to get the text content
  // Priority: text() method (SDK method) > candidates array > text property
  let content: string | undefined;
  
  // First, try text() method (this is the SDK's recommended way)
  if (typeof response?.text === 'function') {
    try {
      const textResult = response.text();
      if (textResult && textResult.trim().length > 0) {
        content = textResult;
      }
    } catch (e) {
      console.warn('response.text() threw an error:', e);
    }
  }
  
  // Fallback: try candidates array
  if (!content && response?.candidates?.[0]) {
    const candidate = response.candidates[0];
    // Check for finishReason
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Response was blocked by safety filters. Please try rephrasing your query.');
    }
    // MAX_TOKENS means response was cut off, but we should still try to get partial content
    if (candidate.finishReason === 'MAX_TOKENS') {
      console.warn('Gemini response hit MAX_TOKENS limit, response may be truncated. Consider increasing maxOutputTokens.');
      // Continue with partial response but log warning
    }
    // Try to get text from parts
    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text && part.text.trim().length > 0) {
          content = part.text;
          break;
        }
      }
    }
  }
  
  // Last resort: try text property
  if (!content && typeof response?.text === 'string' && response.text.trim().length > 0) {
    content = response.text;
  }
  
  // Check if content is empty or invalid
  if (!content || content.trim().length === 0) {
    const candidate = response?.candidates?.[0];
    console.error('Gemini API returned empty response:', {
      model: geminiModel,
      hasResponse: !!response,
      hasTextMethod: typeof response?.text === 'function',
      hasCandidates: !!response?.candidates,
      candidatesLength: response?.candidates?.length || 0,
      finishReason: candidate?.finishReason,
      finishMessage: candidate?.finishMessage,
      candidateContent: candidate?.content ? JSON.stringify(candidate.content).substring(0, 300) : 'none'
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }
  
  content = content.trim();
  if (chatMode === 'ai_psychologist') {
    content = appendPsychologyMusicRelief(content, query);
  }
  
  // Extract sources from provider-native web search results
  const sources = chatMode === 'ai_psychologist' ? [] : toSources(webSearchResults);
  if (sources.length > 0) {
    console.log(`✅ Found ${sources.length} sources from web search for Gemini`);
  }

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources, query, mode),
    query,
    mode,
    timestamp: Date.now(),
    suggestedQuestions: buildSuggestedQuestions(query, chatMode)
  };
}

// ── Streaming types ────────────────────────────────────────────────────────────
export type GeminiStreamEvent =
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'done'; cleanText: string; suggestedQuestions: string[] };

// ── Streaming Gemini answer (same setup as generateGeminiAnswer, uses generateContentStream) ──
export async function* streamGeminiAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean = false,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string,
  userContext?: UserLocalContext,
  searchType?: ExaSearchType,
  attachments?: FileAttachment[],
  priorSummary?: string | null
): AsyncGenerator<GeminiStreamEvent> {
  const apiKey = getApiKey('gemini');
  if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = resolveGeminiModel(model);
  const modelInstance = genAI.getGenerativeModel({ model: geminiModel });

  // ── Web search ──────────────────────────────────────────────────────────────
  let searchContext = '';
  let webSearchResults: Awaited<ReturnType<typeof searchWithGeminiGrounding>> = [];
  const continuationFollowUp = isContinuationFollowUpQuery(query);
  const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
  const continuationMode = continuationFollowUp || contextLinkedFollowUp;
  const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
  const shouldWebSearch = shouldPerformWebSearch(
    query, mode, chatMode, conversationHistory, searchType,
    normalizeAttachments(imageDataUrl, attachments).length > 0
  );
  if (shouldWebSearch) {
    // SPEED: Exa is a dedicated search API (~1-2s) vs Gemini grounding (~5-7s).
    // Try Exa first so the answer starts streaming sooner; fall back to provider-
    // native grounding only if Exa is unavailable or returns nothing.
    const exaKey = getApiKey('exa');
    if (exaKey) {
      try {
        webSearchResults = await withTimeout(
          searchWithExa(searchQuery, exaKey, resolveExaSearchType(mode, searchType), 20),
          6000
        );
      } catch {
        webSearchResults = [];
      }
      if (continuationMode) {
        webSearchResults = await enrichContinuationSources(searchQuery, continuationMode, webSearchResults);
      }
    }
    if (webSearchResults.length === 0) {
      // Exa unavailable (e.g. out of credits). Prefer OpenAI's web tool here — the
      // free-tier Gemini grounding endpoint is frequently rate-limited (503) and its
      // SDK retries can stall the request for ~20s. OpenAI is more reliable/faster.
      // Cap the whole search so it can never stall the answer.
      try {
        webSearchResults = await withTimeout(
          performWebSearch(searchQuery, mode, chatMode, isPremium, searchType, continuationMode, 'openai', { geminiKey: apiKey, geminiModel }),
          9000
        );
      } catch {
        webSearchResults = [];
      }
    }
    // Cache so a cross-provider fallback (if Gemini generation then fails) reuses
    // these results instead of re-searching.
    setCachedSearch(searchQuery, webSearchResults, { isPremium, mode, chatMode, searchType });
    searchContext = formatSearchResultsForContext(webSearchResults);
  }

  // Yield sources immediately after web search completes
  const sources = toSources(webSearchResults);
  yield { type: 'sources', sources };

  // ── System prompt ───────────────────────────────────────────────────────────
  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(chatMode, friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription, userContext, useTableFormat, isPremium, searchType === 'deep', priorSummary);
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory, chatMode, friendName);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  const detailedContinuationInstruction = buildDetailedContinuationInstruction(query, chatMode, conversationHistory);
  if (detailedContinuationInstruction) sys += detailedContinuationInstruction;
  if (searchContext) sys += searchContext;

  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;

  // Contextual follow-up questions: ask the model to append 3 specific follow-ups
  // tied to THIS answer, on its own final line, so we can parse + suppress them.
  const wantsFollowups = chatMode === 'normal' || chatMode === 'space';
  if (wantsFollowups) {
    sys += `\n\nFOLLOW-UP QUESTIONS (MANDATORY, LAST LINE ONLY):
After your complete answer, output ONE final line that starts EXACTLY with "${FOLLOWUP_MARKER}" followed by THREE short, specific follow-up questions a curious reader would naturally ask NEXT about this exact topic/answer — separated by " || ".
- Make them concrete and tied to the actual content above (mention real names/items from the answer), NOT generic ("tell me more", "latest update").
- Each under 12 words, phrased as a real question.
- Example: ${FOLLOWUP_MARKER} How does the Snapdragon 8 Elite Gen 5 compare to Apple's A19 Pro? || Which of these chips has the best battery efficiency? || When will phones with the Dimensity 9500 launch?
- Output nothing after this line.`;
  }

  // ── Conversation context ────────────────────────────────────────────────────
  let contextPrompt = '';
  if (conversationHistory.length > 0) {
    contextPrompt = 'Previous conversation:\n';
    for (const msg of conversationHistory) {
      contextPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    }
    contextPrompt += '\n';
  }

  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    prompt = `${contextPrompt}${query}`;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, contextPrompt, isPremium);
  }

  const tokenLimit = getEffectiveTokenLimit(mode, isContinuationFollowUpQuery(query) && conversationHistory.length > 0, isPremium, searchType === 'deep', chatMode);
  // Premium gets Gemini's full 32k output budget; free stays at the legacy 8192 cap.
  const maxOutputTokens = isPremium ? Math.min(tokenLimit, 32768) : Math.min(tokenLimit, 8192);

  const parts: any[] = [];
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  // Repeat the SUGGESTED_FOLLOWUPS instruction at the END of the user prompt — the
  // system-prompt version often gets buried behind the long web-search context and
  // gemini-lite skips it, falling back to generic templates. Restating it last
  // dramatically improves compliance.
  if (wantsFollowups) {
    prompt += `\n\nWhen you finish your answer, on a NEW LINE output EXACTLY:\n${FOLLOWUP_MARKER} <question 1> || <question 2> || <question 3>\nEach question must reference REAL items from your answer above (not generic). Output NOTHING after that line.`;
  }
  prompt = appendChatLanguageReminder(prompt, query, chatMode, friendName, friendDescription);
  parts.push({ text: `${sys}\n\n${prompt}` });
  appendGeminiAttachmentParts(parts, resolvedAttachments);

  const generationRequest = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens, temperature: 0.2, topP: 0.9, topK: 40 }
  };

  // ── Stream generation ───────────────────────────────────────────────────────
  // Wrap in a short timeout so a rate-limited/overloaded model can't hang on the
  // SDK's internal retry backoff (which is what caused ~59s stalls). On a rate
  // limit we fail FAST and let streamAIAnswer fail over to another provider.
  const STREAM_START_TIMEOUT_MS = 12000;
  let streamResult: any;
  try {
    streamResult = await withTimeout(modelInstance.generateContentStream(generationRequest), STREAM_START_TIMEOUT_MS);
  } catch (error: any) {
    if (isRateLimitError(error)) {
      reportRateLimitForProvider('gemini'); // park this Gemini key; next request rotates
      throw error; // bubble up immediately to cross-provider fallback
    }
    // Non-rate-limit (e.g. 404 model not found): one quick same-provider swap.
    const fallbackModel = 'gemini-2.5-flash-lite';
    const shouldSwap =
      geminiModel !== fallbackModel &&
      (error?.status === 404 || String(error?.message || '').toLowerCase().includes('not found'));
    if (!shouldSwap) throw error;
    console.warn(`${geminiModel} unavailable for streaming, swapping to ${fallbackModel}`);
    const fallbackInstance = genAI.getGenerativeModel({ model: fallbackModel });
    streamResult = await withTimeout(fallbackInstance.generateContentStream(generationRequest), STREAM_START_TIMEOUT_MS);
  }

  let fullText = '';
  let emitted = 0;        // chars of the visible (pre-marker) answer already streamed
  let markerHit = false;  // once the follow-up marker appears, stop showing tokens
  for await (const chunk of streamResult.stream) {
    const token: string = chunk.text?.() ?? '';
    if (!token) continue;
    fullText += token;
    if (markerHit) continue; // keep reading (to capture follow-ups) but don't display

    const idx = fullText.indexOf(FOLLOWUP_MARKER);
    if (idx >= 0) {
      // Flush only the clean text up to the marker, then go silent.
      if (idx > emitted) yield { type: 'token', text: fullText.slice(emitted, idx) };
      emitted = idx;
      markerHit = true;
      continue;
    }
    // Hold back a small tail so a partially-formed marker is never shown.
    const safeEnd = Math.max(emitted, fullText.length - FOLLOWUP_MARKER.length);
    if (safeEnd > emitted) {
      yield { type: 'token', text: fullText.slice(emitted, safeEnd) };
      emitted = safeEnd;
    }
  }

  const { clean, followups } = parseFollowups(fullText);
  // Flush any held-back clean tail that wasn't streamed yet.
  if (!markerHit && clean.length > emitted) {
    yield { type: 'token', text: clean.slice(emitted) };
  }

  // Post-process: apply same stripMarkdown as chunkTextToAnswer
  const preserveTables = chatMode === 'normal' && wantsTableFormat(query, mode);
  const cleanText = stripMarkdown(clean.trim(), { preserveTables });

  const suggestedQuestions = followups.length >= 3
    ? followups
    : buildSuggestedQuestions(query, chatMode);

  yield { type: 'done', cleanText, suggestedQuestions };
}

// ── Generic OpenAI-compatible streaming (OpenAI / Grok / DeepSeek / Kimi /
//    Perplexity all speak the same SSE schema, only baseURL + auth differ) ──
//
// Every chunk has shape `{ choices: [{ delta: { content?: string } }] }` and
// Perplexity additionally tacks `citations: string[]` onto the final chunk.
// We translate the same FOLLOWUP_MARKER convention as the Gemini stream so
// the frontend gets identical event shapes regardless of provider.
type OpenAICompatStreamConfig = {
  providerKey: KeyProvider;
  baseURL?: string;         // omit for OpenAI default
  apiModel: string;
  label: 'openai' | 'grok' | 'deepseek' | 'kimi' | 'perplexity';
  hasNativeWebSearch: boolean;
  temperature?: number;
  topP?: number;
  /** Higher floors for Perplexity reasoning/deep-research models. */
  minTokenLimit?: number;
};

async function* streamOpenAICompatibleAnswer(
  cfg: OpenAICompatStreamConfig,
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean,
  conversationHistory: ConversationMessage[],
  chatMode: ChatMode,
  friendDescription: string | null | undefined,
  friendName: string | null | undefined,
  friendMemoryContext: string | null | undefined,
  spaceTitle: string | null | undefined,
  spaceDescription: string | null | undefined,
  imageDataUrl: string | undefined,
  userContext: UserLocalContext | undefined,
  searchType: ExaSearchType | undefined,
  attachments: FileAttachment[] | undefined,
  priorSummary: string | null | undefined,
): AsyncGenerator<GeminiStreamEvent> {
  const apiKey = getApiKey(cfg.providerKey);
  if (!apiKey) throw new Error(`${cfg.providerKey.toUpperCase()}_API_KEY_MISSING`);
  const client = new OpenAI({ apiKey, baseURL: cfg.baseURL });

  // Web search — skip for native-grounded providers (Perplexity).
  let searchContext = '';
  let webSearchResults: SearchResult[] = [];
  const continuationFollowUp = isContinuationFollowUpQuery(query);
  const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
  const continuationMode = continuationFollowUp || contextLinkedFollowUp;
  const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
  if (!cfg.hasNativeWebSearch) {
    const shouldWebSearch = shouldPerformWebSearch(
      query, mode, chatMode, conversationHistory, searchType,
      normalizeAttachments(imageDataUrl, attachments).length > 0,
    );
    if (shouldWebSearch) {
      // Use the same primary mapping the non-streaming path does so we
      // don't re-search uselessly when the user is on a provider with
      // its own native search.
      const primary: WebSearchPrimary =
        cfg.label === 'openai' ? 'openai' :
        cfg.label === 'grok' ? 'grok' :
        // DeepSeek + Kimi have no native search; lean on OpenAI's tool.
        'openai';
      webSearchResults = await performWebSearch(
        searchQuery, mode, chatMode, isPremium, searchType, continuationMode, primary,
        { openAiKey: cfg.label === 'openai' ? apiKey : undefined, grokKey: cfg.label === 'grok' ? apiKey : undefined },
      );
      searchContext = formatSearchResultsForContext(webSearchResults);
    }
  }

  // Yield sources right after search so the UI shows them before tokens land.
  const sources = toSources(webSearchResults);
  yield { type: 'sources', sources };

  // System prompt assembly identical to non-streaming path so behaviour
  // matches what the same model returns from /api/search.
  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(
    chatMode, friendDescription, friendName, friendMemoryContext,
    spaceTitle, spaceDescription, userContext, useTableFormat,
    isPremium, searchType === 'deep', priorSummary,
  );
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  const detailedContinuationInstruction = buildDetailedContinuationInstruction(query, chatMode, conversationHistory);
  if (detailedContinuationInstruction) sys += detailedContinuationInstruction;
  if (searchContext) sys += searchContext;
  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;

  // Perplexity Deep Research used to produce 12k+ word reports. Per user
  // feedback we trim ~10% by both lowering the token ceiling above AND
  // adding an explicit conciseness directive scoped to this model only.
  // Reasoning models (sonar-reasoning-pro) keep their existing length.
  if (cfg.label === 'perplexity' && cfg.apiModel === 'sonar-deep-research') {
    sys += `\n\n📐 DEEP RESEARCH LENGTH GUARDRAIL:
- Aim for a focused report that's about 90% the length you would normally produce — concise enough to read end-to-end, dense enough to remain substantive.
- Prefer 5-7 sections over 8-10. Within each, 4-6 bullets over 8-12.
- Trim filler sentences, redundant restatements, and overly verbose transitions.
- KEEP the depth of unique facts, named entities, numbers, and citations — only cut padding.`;
  }

  // Same follow-up marker contract Gemini uses — keeps the frontend's
  // parser logic universal across providers.
  const wantsFollowups = chatMode === 'normal' || chatMode === 'space';
  if (wantsFollowups) {
    sys += `\n\nFOLLOW-UP QUESTIONS (MANDATORY, LAST LINE ONLY):
After your complete answer, output ONE final line that starts EXACTLY with "${FOLLOWUP_MARKER}" followed by THREE short, specific follow-up questions a curious reader would naturally ask NEXT about this exact topic/answer — separated by " || ".
- Make them concrete and tied to the actual content above.
- Each under 12 words, phrased as a real question.
- Output nothing after this line.`;
  }

  const messages: any[] = [{ role: 'system', content: sys }];
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
  }
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    prompt = query;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, '', isPremium);
  }
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  const userContent = buildOpenAIUserContent(prompt, resolvedAttachments);
  messages.push({ role: 'user', content: userContent });

  let tokenLimit = getEffectiveTokenLimit(
    mode,
    isContinuationFollowUpQuery(query) && conversationHistory.length > 0,
    isPremium, searchType === 'deep', chatMode,
  );
  if (cfg.minTokenLimit && tokenLimit < cfg.minTokenLimit) tokenLimit = cfg.minTokenLimit;

  // Kick off the streaming completion. If the provider rate-limits or
  // 404s, we bubble up so streamAIAnswer can fall through to another
  // provider — but ONLY then, not on every request.
  let stream: any;
  try {
    stream = await client.chat.completions.create({
      model: cfg.apiModel,
      messages,
      temperature: cfg.temperature ?? 0.3,
      max_tokens: tokenLimit,
      top_p: cfg.topP ?? 0.9,
      stream: true,
    });
  } catch (err: any) {
    if (isRateLimitError(err)) reportRateLimitForProvider(cfg.providerKey);
    throw err;
  }

  let fullText = '';
  let emitted = 0;
  let markerHit = false;
  let perplexityCitations: string[] = [];

  for await (const chunk of stream as AsyncIterable<any>) {
    // Perplexity attaches citations to the streaming chunks; capture
    // whenever they appear so we can replace sources at the end.
    if (cfg.label === 'perplexity' && Array.isArray(chunk?.citations) && chunk.citations.length > 0) {
      perplexityCitations = chunk.citations.filter((u: any) => typeof u === 'string');
    }
    const delta: string = chunk?.choices?.[0]?.delta?.content ?? '';
    if (!delta) continue;
    fullText += delta;
    if (markerHit) continue;

    const idx = fullText.indexOf(FOLLOWUP_MARKER);
    if (idx >= 0) {
      if (idx > emitted) yield { type: 'token', text: fullText.slice(emitted, idx) };
      emitted = idx;
      markerHit = true;
      continue;
    }
    const safeEnd = Math.max(emitted, fullText.length - FOLLOWUP_MARKER.length);
    if (safeEnd > emitted) {
      yield { type: 'token', text: fullText.slice(emitted, safeEnd) };
      emitted = safeEnd;
    }
  }

  // Final flush of held-back tail (the trailing chars we held back in
  // case the marker was forming).
  const { clean, followups } = parseFollowups(fullText);
  // Strip Perplexity reasoning <think> blocks before emitting.
  let cleanFinal = clean;
  if (cleanFinal.includes('<think>')) {
    cleanFinal = cleanFinal.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  if (!markerHit && cleanFinal.length > emitted) {
    yield { type: 'token', text: cleanFinal.slice(emitted) };
  }

  // Perplexity Sonar citations override our search-result sources so the
  // UI shows the model's grounded URLs, not the secondary search we did.
  if (cfg.hasNativeWebSearch && perplexityCitations.length > 0 && chatMode !== 'ai_psychologist') {
    const sonarSources: Source[] = perplexityCitations.slice(0, 12).map((url, i) => {
      let domain = '';
      try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* ignore */ }
      return { id: `pplx-${i + 1}`, title: domain || url, url, domain, year: new Date().getFullYear(), snippet: '' };
    });
    yield { type: 'sources', sources: sonarSources };
  }

  const preserveTables = chatMode === 'normal' && wantsTableFormat(query, mode);
  const cleanText = stripMarkdown(cleanFinal.trim(), { preserveTables });
  const suggestedQuestions = followups.length >= 3 ? followups : buildSuggestedQuestions(query, chatMode);
  yield { type: 'done', cleanText, suggestedQuestions };
}

// ── Claude streaming via Anthropic SDK ───────────────────────────────────────
async function* streamClaudeAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean,
  conversationHistory: ConversationMessage[],
  chatMode: ChatMode,
  friendDescription: string | null | undefined,
  friendName: string | null | undefined,
  friendMemoryContext: string | null | undefined,
  spaceTitle: string | null | undefined,
  spaceDescription: string | null | undefined,
  imageDataUrl: string | undefined,
  userContext: UserLocalContext | undefined,
  searchType: ExaSearchType | undefined,
  attachments: FileAttachment[] | undefined,
  priorSummary: string | null | undefined,
): AsyncGenerator<GeminiStreamEvent> {
  const apiKey = getApiKey('claude');
  if (!apiKey) throw new Error('CLAUDE_API_KEY_MISSING');
  const client = new Anthropic({ apiKey });

  // Same search → sources → tokens flow as the other providers.
  let searchContext = '';
  let webSearchResults: SearchResult[] = [];
  const continuationFollowUp = isContinuationFollowUpQuery(query);
  const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
  const continuationMode = continuationFollowUp || contextLinkedFollowUp;
  const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
  const shouldWebSearch = shouldPerformWebSearch(
    query, mode, chatMode, conversationHistory, searchType,
    normalizeAttachments(imageDataUrl, attachments).length > 0,
  );
  if (shouldWebSearch) {
    webSearchResults = await performWebSearch(
      searchQuery, mode, chatMode, isPremium, searchType, continuationMode, 'claude',
    );
    searchContext = formatSearchResultsForContext(webSearchResults);
  }
  yield { type: 'sources', sources: toSources(webSearchResults) };

  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(
    chatMode, friendDescription, friendName, friendMemoryContext,
    spaceTitle, spaceDescription, userContext, useTableFormat,
    isPremium, searchType === 'deep', priorSummary,
  );
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  const detailedContinuationInstruction = buildDetailedContinuationInstruction(query, chatMode, conversationHistory);
  if (detailedContinuationInstruction) sys += detailedContinuationInstruction;
  if (searchContext) sys += searchContext;
  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;
  const wantsFollowups = chatMode === 'normal' || chatMode === 'space';
  if (wantsFollowups) {
    sys += `\n\nFOLLOW-UP QUESTIONS (MANDATORY, LAST LINE ONLY):
After your complete answer, output ONE final line that starts EXACTLY with "${FOLLOWUP_MARKER}" followed by THREE short, specific follow-up questions separated by " || ". Each under 12 words. Output nothing after.`;
  }

  const messages: any[] = [];
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
  }
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    prompt = query;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, '', isPremium);
  }
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  messages.push({ role: 'user', content: buildClaudeUserContent(prompt, resolvedAttachments) });

  const claudeModel = resolveClaudeModel(model);
  const tokenLimit = getEffectiveTokenLimit(
    mode,
    isContinuationFollowUpQuery(query) && conversationHistory.length > 0,
    isPremium, searchType === 'deep', chatMode,
  );

  let stream: any;
  try {
    stream = client.messages.stream({
      model: claudeModel,
      max_tokens: tokenLimit,
      system: sys,
      messages,
      temperature: 0.3,
    });
  } catch (err: any) {
    if (isRateLimitError(err)) reportRateLimitForProvider('claude');
    throw err;
  }

  let fullText = '';
  let emitted = 0;
  let markerHit = false;

  try {
    for await (const event of stream as AsyncIterable<any>) {
      // Anthropic streams a sequence of typed events; we only care about
      // text deltas (content_block_delta with text_delta payload).
      const t = event?.type;
      if (t !== 'content_block_delta') continue;
      const delta: string = event?.delta?.text ?? '';
      if (!delta) continue;
      fullText += delta;
      if (markerHit) continue;
      const idx = fullText.indexOf(FOLLOWUP_MARKER);
      if (idx >= 0) {
        if (idx > emitted) yield { type: 'token', text: fullText.slice(emitted, idx) };
        emitted = idx;
        markerHit = true;
        continue;
      }
      const safeEnd = Math.max(emitted, fullText.length - FOLLOWUP_MARKER.length);
      if (safeEnd > emitted) {
        yield { type: 'token', text: fullText.slice(emitted, safeEnd) };
        emitted = safeEnd;
      }
    }
  } catch (err: any) {
    if (isRateLimitError(err)) reportRateLimitForProvider('claude');
    throw err;
  }

  const { clean, followups } = parseFollowups(fullText);
  if (!markerHit && clean.length > emitted) yield { type: 'token', text: clean.slice(emitted) };
  const preserveTables = chatMode === 'normal' && wantsTableFormat(query, mode);
  const cleanText = stripMarkdown(clean.trim(), { preserveTables });
  const suggestedQuestions = followups.length >= 3 ? followups : buildSuggestedQuestions(query, chatMode);
  yield { type: 'done', cleanText, suggestedQuestions };
}

// ── Per-provider streaming entry points (thin config wrappers) ──────────────
async function* streamOpenAIAnswer(...args: any[]): AsyncGenerator<GeminiStreamEvent> {
  const [query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary] = args;
  yield* streamOpenAICompatibleAnswer(
    { providerKey: 'openai', apiModel: resolveOpenAIModel(model), label: 'openai',
      hasNativeWebSearch: false, temperature: 0.2 },
    query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary,
  );
}

async function* streamGrokAnswer(...args: any[]): AsyncGenerator<GeminiStreamEvent> {
  const [query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary] = args;
  yield* streamOpenAICompatibleAnswer(
    { providerKey: 'grok', baseURL: 'https://api.x.ai/v1', apiModel: resolveGrokModel(model),
      label: 'grok', hasNativeWebSearch: false, temperature: 0.4 },
    query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary,
  );
}

async function* streamDeepSeekAnswer(...args: any[]): AsyncGenerator<GeminiStreamEvent> {
  const [query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary] = args;
  yield* streamOpenAICompatibleAnswer(
    { providerKey: 'deepseek', baseURL: 'https://api.deepseek.com/v1',
      apiModel: resolveDeepSeekModel(model), label: 'deepseek',
      hasNativeWebSearch: false, temperature: 0.3 },
    query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary,
  );
}

async function* streamKimiAnswer(...args: any[]): AsyncGenerator<GeminiStreamEvent> {
  const [query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary] = args;
  yield* streamOpenAICompatibleAnswer(
    { providerKey: 'kimi', baseURL: 'https://api.moonshot.ai/v1',
      apiModel: resolveKimiModel(model), label: 'kimi',
      hasNativeWebSearch: false, temperature: 0.3 },
    query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary,
  );
}

async function* streamPerplexityAnswer(...args: any[]): AsyncGenerator<GeminiStreamEvent> {
  const [query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary] = args;
  const apiModel = resolvePerplexityModel(model);
  // Reasoning + deep-research need much higher token floors or they emit empty.
  // User feedback (2026-06-24): sonar-deep-research outputs were too long.
  // Trim the floor by ~10% (24000 → 21500) and the system prompt below adds
  // an explicit "be concise" directive for the deep-research model only.
  // We keep enough headroom that the model still has room for reasoning +
  // citations + a multi-section report — just no rambling.
  const minTokenLimit =
    apiModel === 'sonar-deep-research' ? 21500 :
    (apiModel === 'sonar-reasoning-pro' || apiModel === 'sonar-reasoning') ? 8000 :
    undefined;
  yield* streamOpenAICompatibleAnswer(
    { providerKey: 'perplexity', baseURL: 'https://api.perplexity.ai',
      apiModel, label: 'perplexity', hasNativeWebSearch: true,
      temperature: 0.2, minTokenLimit },
    query, mode, model, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary,
  );
}

// ── Cross-provider streaming wrapper ─────────────────────────────────────────
// Streams from Gemini (fast path). If Gemini fails BEFORE any token is emitted
// (e.g. 503 "high demand"), silently falls back to another provider via
// generateAIAnswer (OpenAI → Grok → Claude, each with its own internal failover)
// and replays the answer as simulated tokens so the user still gets a response.
// Resolve the actual real-streaming generator for the user-picked model.
// Every provider here uses its native SSE stream, NOT a "buffer-then-chunk"
// fake stream. Auto + unknown models default to Gemini (current free-tier
// path). Returns the generator-factory so streamAIAnswer can call it.
function pickStreamerForModel(model: LLMModel): {
  label: string;
  fn: (..._args: any[]) => AsyncGenerator<GeminiStreamEvent>;
} {
  if (isGeminiModel(model)) return { label: 'gemini', fn: streamGeminiAnswer as any };
  if (isOpenAIModel(model)) return { label: 'openai', fn: streamOpenAIAnswer };
  if (isClaudeModel(model)) return { label: 'claude', fn: streamClaudeAnswer };
  if (isGrokModel(model)) return { label: 'grok', fn: streamGrokAnswer };
  if (isDeepSeekModel(model)) return { label: 'deepseek', fn: streamDeepSeekAnswer };
  if (isKimiModel(model)) return { label: 'kimi', fn: streamKimiAnswer };
  if (isPerplexityModel(model)) return { label: 'perplexity', fn: streamPerplexityAnswer };
  return { label: 'gemini', fn: streamGeminiAnswer as any };
}

// Build a fallback list of streamers that DON'T overlap with the failed
// provider, so we never retry the same family right after it rate-limited.
function buildStreamFallbackChain(failedLabel: string): Array<{
  label: string;
  fn: (..._args: any[]) => AsyncGenerator<GeminiStreamEvent>;
  keyEnvSet: boolean;
}> {
  const all = [
    { label: 'openai', fn: streamOpenAIAnswer, keyEnvSet: !!process.env.OPENAI_API_KEY },
    { label: 'gemini', fn: streamGeminiAnswer as any, keyEnvSet:
        !!(process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY_FREE || process.env.GOOGLE_API_KEY) },
    { label: 'grok', fn: streamGrokAnswer, keyEnvSet: !!(process.env.XAI_API_KEY || process.env.X_API_KEY) },
    { label: 'claude', fn: streamClaudeAnswer, keyEnvSet: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) },
    { label: 'deepseek', fn: streamDeepSeekAnswer, keyEnvSet: !!process.env.DEEPSEEK_API_KEY },
    { label: 'kimi', fn: streamKimiAnswer, keyEnvSet: !!(process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY) },
    { label: 'perplexity', fn: streamPerplexityAnswer, keyEnvSet: !!(process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY) },
  ];
  return all.filter((p) => p.label !== failedLabel && p.keyEnvSet);
}

/**
 * Streams the selected model's answer LIVE. Fallback only fires when the
 * primary actually fails (rate-limit, network, auth, timeout) — picking
 * GPT-5 doesn't silently route through Gemini, picking Claude doesn't
 * silently route through OpenAI, etc.
 *
 * Once any token has been yielded from the primary, we DON'T restart on
 * another provider — that would produce a Frankenstein answer. We just
 * end cleanly. Failover-before-first-token tries each remaining provider
 * with native streaming until one starts producing output.
 */
export async function* streamAIAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean = false,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string,
  userContext?: UserLocalContext,
  searchType?: ExaSearchType,
  attachments?: FileAttachment[],
  priorSummary?: string | null
): AsyncGenerator<GeminiStreamEvent> {
  // Smart Auto Mode also runs for the streaming path so picking "Auto"
  // in the UI never silently routes through Gemini for queries another
  // model would answer better. Same classifier as the non-streaming path.
  let routedModel: LLMModel = model;
  if (model === 'auto') {
    const hasAttachment =
      Boolean(imageDataUrl) || ((attachments?.length ?? 0) > 0);
    routedModel = pickModelForAutoMode(query, hasAttachment, searchType);
    if (routedModel !== model) {
      console.log(`🤖 Auto Mode (stream) → ${routedModel} (query: "${query.slice(0, 60)}…")`);
    }
  }

  const args = [
    query, mode, routedModel, isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary,
  ] as const;

  const primary = pickStreamerForModel(routedModel);
  console.log(`📡 Streaming via PRIMARY=${primary.label} for model=${routedModel}`);

  let yieldedToken = false;
  let yieldedSources = false;
  let firstError: unknown = null;

  let streamedText = ''; // remember what reached the user so we can rescue it
  try {
    for await (const ev of primary.fn(...(args as any))) {
      if (ev.type === 'sources') yieldedSources = true;
      if (ev.type === 'token') {
        yieldedToken = true;
        streamedText += ev.text;
      }
      yield ev;
    }
    // Stream completed successfully. Check if the FULL response is just a
    // refusal ("I'm sorry, but I can't provide…"). If so, THROW so the
    // catch-block rescue path runs and we ship a real answer as cleanText.
    // The frontend already swaps the displayed text to cleanText whenever
    // it's >50 chars longer than what streamed, so the user sees the real
    // answer replace the apology.
    if (yieldedToken && isModelRefusal(streamedText.trim())) {
      console.warn(`⚠️ ${primary.label} streamed a refusal — issuing rescue from another provider`);
      throw new Error(`${primary.label} refused: ${streamedText.slice(0, 80)}`);
    }
    return; // primary streamed successfully
  } catch (err) {
    firstError = err;
    console.warn(`⚠️ ${primary.label} streaming failed:`, err instanceof Error ? err.message : err);
    if (yieldedToken) {
      // We already streamed part of the primary's answer. Restarting via
      // another streaming provider would produce a Frankenstein reply (the
      // user would see two intros concatenated). Instead, silently complete
      // the answer with a non-streaming fallback and ship the *complete*
      // text as `cleanText` on the done event. The frontend already swaps
      // its displayed text to `cleanText` whenever cleanText is materially
      // longer than what streamed in (see ChatWorkspace.tsx onDone), so the
      // user sees the FULL answer, not the truncated partial.
      try {
        const recoveryChain: LLMModel[] = [];
        if (process.env.OPENAI_API_KEY) recoveryChain.push('gpt-4o-mini');
        if (process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY) recoveryChain.push('gemini-lite');
        if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) recoveryChain.push('claude-4.5-haiku');
        for (const fm of recoveryChain) {
          if (providerOf(fm) === primary.label) continue; // don't ask the broken provider
          try {
            const recovery = await generateAIAnswer(
              query, mode, fm, isPremium, conversationHistory, chatMode,
              friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
              imageDataUrl, userContext, searchType, attachments, priorSummary,
            );
            const fullText = recovery.chunks.map((c) => c.text).join('\n\n').trim();
            // Only worth swapping if the recovered answer is meaningfully
            // longer than the partial — otherwise we'd visibly truncate the
            // user's already-displayed text for no benefit.
            if (fullText && fullText.length > streamedText.length + 50) {
              const sq = Array.isArray(recovery.suggestedQuestions) && recovery.suggestedQuestions.length >= 3
                ? recovery.suggestedQuestions
                : buildSuggestedQuestions(query, chatMode);
              if (!yieldedSources && recovery.sources?.length) {
                yield { type: 'sources', sources: recovery.sources };
              }
              yield { type: 'done', cleanText: fullText, suggestedQuestions: sq };
              console.log(`✅ Mid-stream rescue via ${fm} — replaced ${streamedText.length}ch partial with ${fullText.length}ch complete answer`);
              return;
            }
          } catch (e) {
            console.warn(`Mid-stream rescue ${fm} failed:`, e instanceof Error ? e.message : e);
          }
        }
      } catch (e) {
        console.warn('Mid-stream rescue path threw:', e instanceof Error ? e.message : e);
      }
      // Recovery failed too — keep what's on screen and close gracefully.
      yield { type: 'done', cleanText: '', suggestedQuestions: buildSuggestedQuestions(query, chatMode) };
      return;
    }
  }

  // Primary failed before any tokens — try native streaming on other providers.
  for (const next of buildStreamFallbackChain(primary.label)) {
    try {
      console.log(`🔁 Native-streaming fallback: ${primary.label} → ${next.label}`);
      let tokenSeenHere = false;
      for await (const ev of next.fn(...(args as any))) {
        if (ev.type === 'sources') yieldedSources = true;
        if (ev.type === 'token') {
          yieldedToken = true;
          tokenSeenHere = true;
        }
        yield ev;
      }
      if (tokenSeenHere) return;
    } catch (e) {
      console.warn(`Fallback ${next.label} also failed:`, e instanceof Error ? e.message : e);
    }
  }

  // All streaming providers exhausted — last-resort non-streaming replay so
  // the user still gets *something*. This is the old fake-streaming path,
  // kept ONLY for total-meltdown scenarios.
  const lastResortModels: LLMModel[] = [];
  if (process.env.OPENAI_API_KEY) lastResortModels.push('gpt-4o-mini');
  if (process.env.GEMINI_API_KEY_FREE || process.env.GOOGLE_API_KEY) lastResortModels.push('gemini-lite');
  for (const fm of lastResortModels) {
    try {
      const result = await generateAIAnswer(
        query, mode, fm, isPremium, conversationHistory, chatMode,
        friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
        imageDataUrl, userContext, searchType, attachments, priorSummary,
      );
      if (!yieldedSources) {
        yield { type: 'sources', sources: result.sources };
        yieldedSources = true;
      }
      const text = result.chunks.map((c) => c.text).join('\n\n').trim();
      if (!text) continue;
      for (let i = 0; i < text.length; i += 18) {
        yield { type: 'token', text: text.slice(i, i + 18) };
      }
      const sq = Array.isArray(result.suggestedQuestions) && result.suggestedQuestions.length >= 3
        ? result.suggestedQuestions : buildSuggestedQuestions(query, chatMode);
      yield { type: 'done', cleanText: text, suggestedQuestions: sq };
      console.log(`✅ Last-resort non-streaming via ${fm}`);
      return;
    } catch (e) {
      console.warn(`Last-resort ${fm} failed:`, e instanceof Error ? e.message : e);
    }
  }

  // Genuine total failure — close cleanly so client doesn't hang.
  if (!yieldedSources) yield { type: 'sources', sources: [] };
  yield { type: 'done', cleanText: '', suggestedQuestions: buildSuggestedQuestions(query, chatMode) };
  if (firstError) console.error('All streaming providers exhausted; primary error:', firstError);
}

// Anthropic Claude Provider (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
export async function generateClaudeAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string,
  userContext?: UserLocalContext,
  isPremium: boolean = false,
  searchType?: ExaSearchType,
  attachments?: FileAttachment[],
  priorSummary?: string | null
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query, chatMode)) {
    const syntraiqInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'syntraiq-1', 
        title: 'About SyntraIQ', 
        url: 'https://syntraiq.com', 
        domain: 'syntraiq.com',
        year: 2025,
        snippet: 'SyntraIQ is an advanced AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(syntraiqInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const apiKey = getApiKey('claude');
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY_MISSING: Please set CLAUDE_API_KEY in .env');
  }
  const client = new Anthropic({ apiKey });

  // Check if query requires current information and perform provider-native web search
  let searchContext = '';
  let webSearchResults: SearchResult[] = [];
  const continuationFollowUp = isContinuationFollowUpQuery(query);
  const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
  const continuationMode = continuationFollowUp || contextLinkedFollowUp;
  const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
  const shouldWebSearch = shouldPerformWebSearch(
    query,
    mode,
    chatMode,
    conversationHistory,
    searchType,
    normalizeAttachments(imageDataUrl, attachments).length > 0
  );
  if (shouldWebSearch) {
    console.log('🌐 Query requires current info - performing web search for Claude...');
    webSearchResults = await performWebSearch(
      searchQuery,
      mode,
      chatMode,
      isPremium,
      searchType,
      continuationMode,
      'claude'
    );
    searchContext = formatSearchResultsForContext(webSearchResults);
    console.log(`✅ Claude path: ${webSearchResults.length} search results`);
  }

  // Get system prompt based on chat mode, friend description, and space context
  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(chatMode, friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription, userContext, useTableFormat, isPremium, searchType === 'deep', priorSummary);
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory, chatMode, friendName);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  const detailedContinuationInstruction = buildDetailedContinuationInstruction(query, chatMode, conversationHistory);
  if (detailedContinuationInstruction) sys += detailedContinuationInstruction;
  
  // Append web search context if available
  if (searchContext) {
    sys += searchContext;
    console.log('📝 Added web search context to system prompt');
  }

  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;
  
  // Build messages array with conversation history
  const messages: any[] = [];
  
  // Add conversation history (last 10 messages)
  const recentHistory = conversationHistory;
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }
  
  // Add current query - format varies by chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally
    prompt = query;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, '', isPremium);
  }
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  prompt = appendChatLanguageReminder(prompt, query, chatMode, friendName, friendDescription);
  const claudeUserContent = buildClaudeUserContent(
    prompt,
    resolvedAttachments
  );
  messages.push({ role: 'user', content: claudeUserContent });

  const claudeModel = resolveClaudeModel(model);

  const tokenLimit = getEffectiveTokenLimit(mode, isContinuationFollowUpQuery(query) && conversationHistory.length > 0, isPremium, searchType === 'deep', chatMode);

  let response: any;
  try {
    response = await withTimeout(
      client.messages.create({
        model: claudeModel,
        max_tokens: tokenLimit,
        system: sys,
        messages: messages,
        temperature: 0.3
      }),
      30_000
    );
  } catch (error: any) {
    if (claudeModel !== 'claude-sonnet-4-6' && (error?.status === 404 || error?.message?.includes('not_found'))) {
      console.warn(`${claudeModel} not available, falling back to claude-sonnet-4-6`);
      response = await withTimeout(
        client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: tokenLimit,
          system: sys,
          messages: messages,
          temperature: 0.3
        }),
        30_000
      );
    } else {
      throw error;
    }
  }

  let content = response?.content?.[0]?.type === 'text' 
    ? response.content[0].text 
    : '';
  
  // Check if response was truncated
  const stopReason = response?.stop_reason;
  if (stopReason === 'max_tokens') {
    console.warn('Claude response was truncated due to token limit. Consider increasing max_tokens.');
    // Continue with partial response but log warning
  }
  
  // Check if content is empty or invalid
  if (!content || content.trim().length === 0) {
    console.error('Claude API returned empty response:', {
      model: claudeModel,
      hasContent: !!response?.content,
      contentLength: response?.content?.length || 0,
      stopReason: stopReason
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }
  if (chatMode === 'ai_psychologist') {
    content = appendPsychologyMusicRelief(content, query);
  }
  
  const sources = chatMode === 'ai_psychologist' ? [] : toSources(webSearchResults);

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources, query, mode),
    query,
    mode,
    timestamp: Date.now(),
    suggestedQuestions: buildSuggestedQuestions(query, chatMode)
  };
}

// xAI Grok Provider (Grok 4)
export async function generateGrokAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string,
  userContext?: UserLocalContext,
  isPremium: boolean = false,
  searchType?: ExaSearchType,
  attachments?: FileAttachment[],
  priorSummary?: string | null
): Promise<AnswerResult> {
  // Check if this is a self-referential query about the AI
  if (isSelfReferentialQuery(query, chatMode)) {
    const perleInfo = getSyntraIQInfoResponse();
    const sources: Source[] = [
      { 
        id: 'perle-1', 
        title: 'About SyntraIQ', 
        url: 'https://perle.ai', 
        domain: 'perle.ai',
        year: 2025,
        snippet: 'SyntraIQ is an AI-powered answer engine founded in 2025, designed to provide accurate, well-cited information.'
      }
    ];
    
    return {
      sources,
      chunks: chunkTextToAnswer(perleInfo, sources),
      query,
      mode,
      timestamp: Date.now()
    };
  }

  const apiKey = getApiKey('grok');
  if (!apiKey) {
    throw new Error('XAI_API_KEY_MISSING');
  }

  // xAI uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.x.ai/v1'
  });

  // Check if query requires current information and perform provider-native web search
  let searchContext = '';
  let webSearchResults: Awaited<ReturnType<typeof searchWithGrokWebTool>> = [];
  const continuationFollowUp = isContinuationFollowUpQuery(query);
  const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
  const continuationMode = continuationFollowUp || contextLinkedFollowUp;
  const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
  const shouldWebSearch = shouldPerformWebSearch(
    query,
    mode,
    chatMode,
    conversationHistory,
    searchType,
    normalizeAttachments(imageDataUrl, attachments).length > 0
  );
  if (shouldWebSearch) {
    console.log('🌐 Query requires current info - performing Grok web search...');
    webSearchResults = await performWebSearch(
      searchQuery,
      mode,
      chatMode,
      isPremium,
      searchType,
      continuationMode,
      'grok',
      { grokKey: apiKey }
    );
    searchContext = formatSearchResultsForContext(webSearchResults);
    console.log(`✅ Grok path: ${webSearchResults.length} search results`);
  }
  
  // Get system prompt based on chat mode, friend description, and space context
  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(chatMode, friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription, userContext, useTableFormat, isPremium, searchType === 'deep', priorSummary);
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory, chatMode, friendName);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  
  // Append web search context
  if (searchContext) {
    sys += searchContext;
    console.log('📝 Added web search context to system prompt');
  }

  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;
  
  // Build messages array with conversation history
  const messages: any[] = [
    { role: 'system', content: sys }
  ];
  
  // Add conversation history (last 10 messages)
  const recentHistory = conversationHistory;
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }
  
  // Add current query - format varies by chat mode
  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    // For friend/psychologist mode, just send the message naturally
    prompt = query;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, '', isPremium);
  }
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  prompt = appendChatLanguageReminder(prompt, query, chatMode, friendName, friendDescription);
  const grokUserContent = buildGrokUserContent(
    prompt,
    resolvedAttachments
  );
  messages.push({ role: 'user', content: grokUserContent });

  const grokModel = resolveGrokModel(model);
  const isReasoningModel = model === 'grok-3-mini';

  const tokenLimit = getEffectiveTokenLimit(mode, isContinuationFollowUpQuery(query) && conversationHistory.length > 0, isPremium, searchType === 'deep', chatMode);
  
  let response;
  try {
    response = await withTimeout(
      client.chat.completions.create({
        model: grokModel,
        messages: messages,
        temperature: isReasoningModel ? undefined : 0.4,
        max_tokens: tokenLimit,
        ...(isReasoningModel ? {} : { top_p: 0.9 })
      }),
      25_000 // 25s timeout
    );
  } catch (error: any) {
    // If the model is not available, fall back to grok-3
    if (grokModel !== 'grok-4.3' && (error?.status === 404 || error?.message?.includes('not found') || error?.message?.includes('not support'))) {
      console.warn(`${grokModel} not available, falling back to grok-4.3`);
      response = await withTimeout(
        client.chat.completions.create({
          model: 'grok-4.3',
          messages: messages,
          temperature: 0.4,
          max_tokens: tokenLimit,
          top_p: 0.9
        }),
        25_000
      );
    } else {
      throw error;
    }
  }

  const choice = response.choices?.[0];
  let content = choice?.message?.content?.trim();
  const finishReason = choice?.finish_reason;
  
  // Check if response was truncated
  if (finishReason === 'length') {
    console.warn('Grok response was truncated due to token limit. Consider increasing max_tokens.');
    // Continue with partial response but log warning
  }
  
  // Check if content is empty or invalid
  if (!content || content.length === 0) {
    console.error('Grok API returned empty response:', {
      model: grokModel,
      hasChoices: !!response.choices,
      choicesLength: response.choices?.length || 0,
      finishReason: finishReason
    });
    throw new Error('AI model returned an empty response. Please try again.');
  }
  if (chatMode === 'ai_psychologist') {
    content = appendPsychologyMusicRelief(content, query);
  }
  
  // Extract sources from provider-native web search results
  const sources = chatMode === 'ai_psychologist' ? [] : toSources(webSearchResults);
  if (sources.length > 0) {
    console.log(`✅ Found ${sources.length} sources from web search for Grok`);
  }

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources, query, mode),
    query,
    mode,
    timestamp: Date.now(),
    suggestedQuestions: buildSuggestedQuestions(query, chatMode)
  };
}

// ── OpenAI-compatible providers (DeepSeek, Kimi/Moonshot, Perplexity Sonar) ──
//
// All three speak the OpenAI chat-completions schema with only the baseURL and
// auth changing, so the heavy lifting (prompt assembly, history, attachments,
// web search context) is identical to the Grok path. We share that work via
// generateOpenAICompatibleAnswer and keep each provider entry point tiny.
//
// Perplexity's Sonar family is the exception: it does its OWN web grounding and
// returns citations as a top-level `citations` array, so we skip our Exa
// roundtrip for those models and pull sources back out of Sonar's response.

interface OpenAICompatibleConfig {
  providerKey: KeyProvider;
  baseURL: string;
  apiModel: string;
  /** "deepseek" | "kimi" | "perplexity" — used in logs + native-search gating. */
  label: string;
  /** Perplexity returns sources natively; skip our own web search step. */
  hasNativeWebSearch: boolean;
  temperature?: number;
  topP?: number;
}

async function generateOpenAICompatibleAnswer(
  cfg: OpenAICompatibleConfig,
  query: string,
  mode: Mode,
  model: LLMModel,
  conversationHistory: ConversationMessage[],
  chatMode: ChatMode,
  friendDescription: string | null | undefined,
  friendName: string | null | undefined,
  friendMemoryContext: string | null | undefined,
  spaceTitle: string | null | undefined,
  spaceDescription: string | null | undefined,
  imageDataUrl: string | undefined,
  userContext: UserLocalContext | undefined,
  isPremium: boolean,
  searchType: ExaSearchType | undefined,
  attachments: FileAttachment[] | undefined,
  priorSummary: string | null | undefined,
): Promise<AnswerResult> {
  if (isSelfReferentialQuery(query)) {
    const info = getSyntraIQInfoResponse();
    const selfSources: Source[] = [{
      id: 'syntraiq-1', title: 'About SyntraIQ', url: 'https://syntraiq.com',
      domain: 'syntraiq.com', year: 2025,
      snippet: 'SyntraIQ is an AI-powered answer engine founded in 2025.'
    }];
    return { sources: selfSources, chunks: chunkTextToAnswer(info, selfSources), query, mode, timestamp: Date.now() };
  }

  const apiKey = getApiKey(cfg.providerKey);
  if (!apiKey) throw new Error(`${cfg.providerKey.toUpperCase()}_API_KEY_MISSING`);

  const client = new OpenAI({ apiKey, baseURL: cfg.baseURL });

  // Web search: skip when the provider grounds natively (Perplexity Sonar).
  let searchContext = '';
  let webSearchResults: SearchResult[] = [];
  if (!cfg.hasNativeWebSearch) {
    const continuationFollowUp = isContinuationFollowUpQuery(query);
    const contextLinkedFollowUp = isContextLinkedFollowUpQuery(query, conversationHistory);
    const continuationMode = continuationFollowUp || contextLinkedFollowUp;
    const searchQuery = buildFollowUpSearchQuery(query, conversationHistory);
    const shouldWebSearch = shouldPerformWebSearch(
      query, mode, chatMode, conversationHistory, searchType,
      normalizeAttachments(imageDataUrl, attachments).length > 0,
    );
    if (shouldWebSearch) {
      // These providers have no native search tool, so we go straight to the
      // shared performWebSearch helper (OpenAI/Gemini/Grok native search first,
      // Exa as final fallback) — same flow as Claude.
      webSearchResults = await performWebSearch(
        searchQuery, mode, chatMode, isPremium, searchType, continuationMode, 'claude',
      );
      searchContext = formatSearchResultsForContext(webSearchResults);
    }
  }

  const useTableFormat = chatMode === 'normal' && wantsTableFormat(query, mode);
  let sys = getSystemPrompt(
    chatMode, friendDescription, friendName, friendMemoryContext,
    spaceTitle, spaceDescription, userContext, useTableFormat,
    isPremium, searchType === 'deep', priorSummary,
  );
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  if (chatMode === 'ai_psychologist') {
    const psychCont = buildPsychologyContinuationGuidance(query, conversationHistory);
    if (psychCont) sys += psychCont;
  }
  const detailedContinuationInstruction = buildDetailedContinuationInstruction(query, chatMode, conversationHistory);
  if (detailedContinuationInstruction) sys += detailedContinuationInstruction;
  if (searchContext) sys += searchContext;

  const resolvedAttachments = normalizeAttachments(imageDataUrl, attachments);
  const attachmentSystemAddon = buildAttachmentSystemAddon(resolvedAttachments, query);
  if (attachmentSystemAddon) sys += attachmentSystemAddon;

  // Deep-research length guardrail — keep streaming + non-streaming paths
  // identical so the same model produces consistently-sized reports
  // regardless of whether /api/stream or /api/search is hit.
  if (cfg.label === 'perplexity' && cfg.apiModel === 'sonar-deep-research') {
    sys += `\n\n📐 DEEP RESEARCH LENGTH GUARDRAIL:
- Aim for a focused report that's about 90% the length you would normally produce — concise enough to read end-to-end, dense enough to remain substantive.
- Prefer 5-7 sections over 8-10. Within each, 4-6 bullets over 8-12.
- Trim filler sentences, redundant restatements, and overly verbose transitions.
- KEEP the depth of unique facts, named entities, numbers, and citations — only cut padding.`;
  }

  const messages: any[] = [{ role: 'system', content: sys }];
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
  }

  let prompt: string;
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    prompt = query;
  } else {
    prompt = buildNormalModeUserPrompt(query, mode, conversationHistory, '', isPremium);
  }
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  // These providers accept OpenAI-style multimodal content; reuse the OpenAI builder.
  const userContent = buildOpenAIUserContent(prompt, resolvedAttachments);
  messages.push({ role: 'user', content: userContent });

  let tokenLimit = getEffectiveTokenLimit(
    mode,
    isContinuationFollowUpQuery(query) && conversationHistory.length > 0,
    isPremium, searchType === 'deep', chatMode,
  );
  // Perplexity reasoning + deep-research models spend almost all of
  // max_tokens on internal reasoning/citation tokens before emitting a
  // single visible content token. Verified live: sonar-reasoning-pro with
  // max_tokens=80 returned an empty message ("length" finish); deep-research
  // burned 12,895 reasoning tokens for zero output. We bump the ceiling
  // generously for those models so a normal answer makes it back. Plain
  // `sonar` and `sonar-pro` are unaffected — they were already returning
  // content under the default budget.
  if (cfg.label === 'perplexity') {
    const m = cfg.apiModel;
    // Trimmed from 24000 → 21500 on user feedback that deep-research
    // reports were too long. ~10% shorter while still giving the model
    // enough room for reasoning + 5-9 sections + citations.
    if (m === 'sonar-deep-research') tokenLimit = Math.max(tokenLimit, 21500);
    else if (m === 'sonar-reasoning-pro' || m === 'sonar-reasoning') tokenLimit = Math.max(tokenLimit, 8000);
  }

  const response: any = await withTimeout(
    client.chat.completions.create({
      model: cfg.apiModel,
      messages,
      temperature: cfg.temperature ?? 0.3,
      max_tokens: tokenLimit,
      top_p: cfg.topP ?? 0.9,
    }),
    // Deep-research takes minutes; reasoning takes ~30-60s; plain sonar is fast.
    cfg.apiModel === 'sonar-deep-research' ? 180_000 :
    (cfg.apiModel === 'sonar-reasoning-pro' || cfg.apiModel === 'sonar-reasoning') ? 90_000 :
    30_000,
  );

  const choice = response.choices?.[0];
  let content: string = choice?.message?.content?.trim() ?? '';
  // Perplexity reasoning models wrap their visible answer in <think>…</think>
  // followed by the actual answer. If the model only emitted a think block
  // (truncated mid-reasoning), there's no visible content — strip the tag
  // and check whether anything's left.
  if (content.includes('<think>')) {
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  if (!content) {
    throw new Error('AI model returned an empty response. Please try again.');
  }
  if (chatMode === 'ai_psychologist') content = appendPsychologyMusicRelief(content, query);

  // Perplexity Sonar surfaces grounded citations as a top-level `citations`
  // array of URLs. Convert each to a Source so the UI shows them like any
  // other web result. (Falls back to webSearchResults for non-Sonar paths.)
  let sources: Source[] = chatMode === 'ai_psychologist' ? [] : toSources(webSearchResults);
  if (cfg.hasNativeWebSearch && Array.isArray(response.citations) && chatMode !== 'ai_psychologist') {
    sources = response.citations
      .filter((u: any) => typeof u === 'string')
      .slice(0, 12)
      .map((url: string, i: number) => {
        let domain = '';
        try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* ignore */ }
        return {
          id: `pplx-${i + 1}`,
          title: domain || url,
          url,
          domain,
          year: new Date().getFullYear(),
          snippet: '',
        } as Source;
      });
  }

  return {
    sources,
    chunks: chunkTextToAnswer(content, sources, query, mode),
    query,
    mode,
    timestamp: Date.now(),
    suggestedQuestions: buildSuggestedQuestions(query, chatMode),
  };
}

export async function generateDeepSeekAnswer(
  query: string, mode: Mode, model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null, friendName?: string | null, friendMemoryContext?: string | null,
  spaceTitle?: string | null, spaceDescription?: string | null,
  imageDataUrl?: string, userContext?: UserLocalContext,
  isPremium: boolean = false, searchType?: ExaSearchType,
  attachments?: FileAttachment[], priorSummary?: string | null,
): Promise<AnswerResult> {
  return generateOpenAICompatibleAnswer(
    {
      providerKey: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiModel: resolveDeepSeekModel(model),
      label: 'deepseek',
      hasNativeWebSearch: false,
      temperature: 0.3,
    },
    query, mode, model, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext,
    spaceTitle, spaceDescription, imageDataUrl, userContext,
    isPremium, searchType, attachments, priorSummary,
  );
}

export async function generateKimiAnswer(
  query: string, mode: Mode, model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null, friendName?: string | null, friendMemoryContext?: string | null,
  spaceTitle?: string | null, spaceDescription?: string | null,
  imageDataUrl?: string, userContext?: UserLocalContext,
  isPremium: boolean = false, searchType?: ExaSearchType,
  attachments?: FileAttachment[], priorSummary?: string | null,
): Promise<AnswerResult> {
  return generateOpenAICompatibleAnswer(
    {
      providerKey: 'kimi',
      // Moonshot serves keys from two regions: api.moonshot.cn (China-only,
      // separate billing) and api.moonshot.ai (international). They are NOT
      // interchangeable — a .ai key fails 401 on the .cn endpoint and vice
      // versa. We default to .ai since that's what the global signup issues.
      baseURL: 'https://api.moonshot.ai/v1',
      apiModel: resolveKimiModel(model),
      label: 'kimi',
      hasNativeWebSearch: false,
      temperature: 0.3,
    },
    query, mode, model, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext,
    spaceTitle, spaceDescription, imageDataUrl, userContext,
    isPremium, searchType, attachments, priorSummary,
  );
}

export async function generatePerplexityAnswer(
  query: string, mode: Mode, model: LLMModel,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null, friendName?: string | null, friendMemoryContext?: string | null,
  spaceTitle?: string | null, spaceDescription?: string | null,
  imageDataUrl?: string, userContext?: UserLocalContext,
  isPremium: boolean = false, searchType?: ExaSearchType,
  attachments?: FileAttachment[], priorSummary?: string | null,
): Promise<AnswerResult> {
  return generateOpenAICompatibleAnswer(
    {
      providerKey: 'perplexity',
      baseURL: 'https://api.perplexity.ai',
      apiModel: resolvePerplexityModel(model),
      label: 'perplexity',
      hasNativeWebSearch: true,
      temperature: 0.2,
    },
    query, mode, model, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext,
    spaceTitle, spaceDescription, imageDataUrl, userContext,
    isPremium, searchType, attachments, priorSummary,
  );
}

/**
 * Smart Auto-Mode router — pick the best model for THIS query.
 *
 * Mirrors how Perplexity, Poe, and Gemini route queries inside their
 * "Auto" picker: a fast rule-based classifier reads the query's shape
 * (intent + topic + freshness) and routes to the model most likely to
 * answer it well, instead of always defaulting to a cheap general-purpose
 * model. Failover chain still kicks in if the picked model fails.
 *
 * Routing rules (in priority order — first match wins):
 *   1.  Has attachment / image     → Gemini (best vision in the chain)
 *   2.  Wants live news / current  → Perplexity Sonar (native web grounding)
 *   2b. Medical / health / drug    → Perplexity Sonar (no GPT-4o refusals)
 *   3.  Multi-step reasoning/math  → DeepSeek R1 (reasoning specialist)
 *   4.  Code / programming         → DeepSeek V3.2 (strong on code)
 *   5.  Creative / long-form       → Claude 4.6 Sonnet (best prose)
 *   6.  Comparison / list          → Claude 4.6 Sonnet (no GPT-4o refusals)
 *   7.  Everything else            → Gemini Lite (fast/cheap default)
 *
 * GPT-4o is INTENTIONALLY ABSENT from Auto Mode. Its policy refusals on
 * benign queries ("best medicines for X", "what are the latest mobile
 * processors") made it unreliable as an auto-pick. Users who want GPT-4o
 * can still select it explicitly from the model picker, and the global
 * refusal-failover catches any "I'm sorry, I can't" answer and swaps in
 * a real answer from another provider before the user sees it.
 *
 * Each rung is gated on its provider key being configured. If a key isn't
 * present, that rung is skipped and we fall through to the next.
 */
function pickModelForAutoMode(
  query: string,
  hasAttachment: boolean,
  searchType?: ExaSearchType,
): LLMModel {
  const q = (query || '').toLowerCase();

  // 1) Anything with an attached image → Gemini (best vision support that
  // doesn't burn premium tokens; Claude/GPT vision also work, but Gemini
  // is the fast/cheap path for "describe this image" type prompts).
  if (hasAttachment) return 'gemini-lite';

  // 2) Live / news / current-events queries → Perplexity Sonar Pro. It
  // does its own real-time web grounding with citations, which beats any
  // of our other models at "what happened today in X". Search type
  // 'deep' uses Perplexity Sonar Deep Research instead.
  const newsishKeywords =
    /\b(latest|current|today|tonight|tomorrow|this week|this month|right now|breaking|happening|news|stock price|score|weather|2025|2026|just announced|recently|update on|status of)\b/;
  if (
    newsishKeywords.test(q)
    && (process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY)
  ) {
    if (searchType === 'deep') return 'perplexity-deep-research';
    return 'perplexity-sonar-pro';
  }

  // 2b) Medical / health queries → Perplexity Sonar. GPT-4o (the natural
  // pick for "best medicines for X" comparison/list queries) has a heavy
  // refusal hand on medical content — it routinely replies "I'm sorry,
  // but I can't provide a response that long" instead of answering. We
  // verified this in production logs against "best medicines for treeman
  // syndrome". Perplexity Sonar handles medical info cleanly with cited
  // sources. Falls through to Claude when Perplexity isn't configured.
  const medicalKeywords =
    /\b(medicine|medication|medicines|medications|drug|drugs|treatment|treatments|therapy|therapies|symptom|symptoms|diagnose|diagnosis|disease|diseases|syndrome|disorder|condition|cure|cures|prescription|prescribed|dose|dosage|side effect|side-effect|side effects|antibiotic|antibiotics|antiviral|vaccine|vaccines|vaccination|vaccinated|infection|infections|infected|cancer|tumor|tumour|diabetes|hypertension|asthma|depression|anxiety|adhd|autism|sclerosis|alzheimer|parkinson|hiv|aids|covid|surgery|hospital|clinical trial|pharmaceutical|pharmacy|pharmacist|doctor|nurse|patient|patients|chronic|acute|fda|who|nih|cdc)\b/;
  if (medicalKeywords.test(q)) {
    if (process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY) {
      return 'perplexity-sonar-pro';
    }
    if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) {
      return 'claude-4.6-sonnet';
    }
    // No Perplexity / Claude available — fall through to the default below.
  }

  // 3) Heavy reasoning — math, multi-step problems, proofs, "explain step
  // by step", "solve". DeepSeek R1 is the reasoning specialist and is
  // dramatically better than chat models at this class of query.
  const reasoningKeywords =
    /\b(solve|prove|calculate|compute|step by step|step-by-step|derive|simplify|integrate|differentiate|optimi[sz]e|reason through|work through|show your work|explain why|how would you prove)\b/;
  const hasMathExpression = /[+\-*/=^]\s*\d|\d\s*[+\-*/=^]|\b(equation|formula|theorem|integral|derivative|matrix|probability)\b/i.test(q);
  if ((reasoningKeywords.test(q) || hasMathExpression) && process.env.DEEPSEEK_API_KEY) {
    return 'deepseek-r1';
  }

  // 4) Code/programming queries → DeepSeek V3.2 (strong on code reasoning,
  // cheap). Detected by typical programming vocabulary or fenced code in
  // the prompt.
  const codeKeywords =
    /\b(function|class|method|variable|bug|error|stack trace|exception|api|endpoint|database|query|sql|json|regex|typescript|javascript|python|golang|rust|java\b|c\+\+|html|css|react|node|kubernetes|docker)\b/;
  const hasCodeBlock = /```|^\s*(def |class |function |const |let |var |import |from )/m.test(q);
  if ((codeKeywords.test(q) || hasCodeBlock) && process.env.DEEPSEEK_API_KEY) {
    return 'deepseek-v3.2';
  }

  // 5) Creative / long-form writing → Claude. Claude is the established
  // best prose model among the chain.
  const creativeKeywords =
    /\b(write a|draft a|compose|essay|story|poem|narrative|script|dialogue|monologue|outline|blog post|article about|tagline|slogan|tweet|caption)\b/;
  if (creativeKeywords.test(q) && (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)) {
    return 'claude-4.6-sonnet';
  }

  // 6) Comparison / list queries → Claude 4.6 Sonnet. We used to route
  // these to GPT-4o (great at structured tables), but GPT-4o has a
  // hair-trigger policy refusal habit — it would reply "I'm sorry, but
  // I can't provide a response that long" on benign medical, dosage,
  // health, and even normal product-comparison queries. Claude handles
  // the same kinds of comparisons / lists without refusals AND produces
  // clean markdown tables. Falls through to DeepSeek when Claude isn't
  // configured (DeepSeek V3.2 is also a strong list/comparison writer).
  if (isComparisonQuery(query) || isListQuery(query)) {
    if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) {
      return 'claude-4.6-sonnet';
    }
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek-v3.2';
  }

  // 7) Default: Gemini Lite — fastest, cheapest, fine for the long tail
  // of small-talk and general questions. GPT-4o is intentionally NOT in
  // the Auto routing at all anymore; users who want it can still pick it
  // explicitly from the model picker. The refusal-failover safety net
  // still kicks in if a GPT-4o explicit pick refuses, so users always
  // get an answer.
  return 'gemini-lite';
}

// Route a single model attempt (no cross-provider failover)
async function routeAIAnswerForModel(
  model: LLMModel,
  query: string,
  mode: Mode,
  isPremium: boolean,
  conversationHistory: ConversationMessage[],
  chatMode: ChatMode,
  friendDescription: string | null | undefined,
  friendName: string | null | undefined,
  friendMemoryContext: string | null | undefined,
  spaceTitle: string | null | undefined,
  spaceDescription: string | null | undefined,
  imageDataUrl: string | undefined,
  userContext: UserLocalContext | undefined,
  searchType: ExaSearchType | undefined,
  attachments: FileAttachment[] | undefined,
  priorSummary?: string | null
): Promise<AnswerResult> {
  if (isOpenAIModel(model)) {
    return generateOpenAIAnswer(
      query, mode, model, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, isPremium, searchType, attachments, priorSummary
    );
  }
  if (isGeminiModel(model)) {
    const geminiUiModel = model === 'auto' ? 'gemini-lite' : model;
    return generateGeminiAnswer(
      query, mode, geminiUiModel, isPremium, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, searchType, attachments, priorSummary
    );
  }
  if (isClaudeModel(model)) {
    return generateClaudeAnswer(
      query, mode, model, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, isPremium, searchType, attachments, priorSummary
    );
  }
  if (isGrokModel(model)) {
    return generateGrokAnswer(
      query, mode, model, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, isPremium, searchType, attachments, priorSummary
    );
  }
  if (isDeepSeekModel(model)) {
    return generateDeepSeekAnswer(
      query, mode, model, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, isPremium, searchType, attachments, priorSummary,
    );
  }
  if (isKimiModel(model)) {
    return generateKimiAnswer(
      query, mode, model, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, isPremium, searchType, attachments, priorSummary,
    );
  }
  if (isPerplexityModel(model)) {
    return generatePerplexityAnswer(
      query, mode, model, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, isPremium, searchType, attachments, priorSummary,
    );
  }
  return generateGeminiAnswer(
    query, mode, 'gemini-lite', isPremium, conversationHistory, chatMode,
    friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
    imageDataUrl, userContext, searchType, attachments, priorSummary
  );
}

// Main function — silent cross-model failover so users always get an answer
export async function generateAIAnswer(
  query: string,
  mode: Mode,
  model: LLMModel,
  isPremium: boolean = false,
  conversationHistory: ConversationMessage[] = [],
  chatMode: ChatMode = 'normal',
  friendDescription?: string | null,
  friendName?: string | null,
  friendMemoryContext?: string | null,
  spaceTitle?: string | null,
  spaceDescription?: string | null,
  imageDataUrl?: string,
  userContext?: UserLocalContext,
  searchType?: ExaSearchType,
  attachments?: FileAttachment[],
  priorSummary?: string | null
): Promise<AnswerResult> {
  const isCompanion =
    chatMode === 'ai_friend' || chatMode === 'ai_psychologist';

  // Companion chats: fast path with cross-provider backup on 503/overload/errors.
  if (isCompanion) {
    const COMPANION_TIMEOUT_MS = 12_000;
    const companionChain = getCompanionFallbackChain();
    let lastError: Error | undefined;

    for (let i = 0; i < companionChain.length; i++) {
      const tryModel = companionChain[i];
      try {
        const result = await withTimeout(
          routeAIAnswerForModel(
            tryModel, query, mode, isPremium, conversationHistory, chatMode,
            friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
            imageDataUrl, userContext, searchType, attachments, priorSummary
          ),
          COMPANION_TIMEOUT_MS
        );
        if (tryModel !== model) {
          console.log(`✅ Companion failover: ${model} → ${tryModel}`);
        }
        return result;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error?.message || error));
        console.warn(`⚠️ Companion model ${tryModel} failed: ${lastError.message}`);
        if (isRateLimitError(error)) {
          const failed = providerOf(tryModel);
          if (failed !== 'other') reportRateLimitForProvider(failed as KeyProvider);
          while (i + 1 < companionChain.length && providerOf(companionChain[i + 1]) === failed) {
            console.warn(`⏭️ Skipping ${companionChain[i + 1]} (${failed} overloaded)`);
            i++;
          }
        }
      }
    }

    throw lastError ?? new Error('All companion AI providers failed. Please try again.');
  }

  // ── Answer-level cache check (Normal + Web only, never Deep) ───────────
  // Stateless lookups (no convo history, no attachments) on Normal/Web
  // search are extremely repetitive across users — "what is X", "latest
  // news on Y", "compare A vs B". Serving the same model+mode+scope
  // answer from cache means 2-3 second response instead of 20-40 seconds,
  // and skips an LLM call we'd pay for. Cache write happens after the
  // first generation succeeds below.
  const answerScope: AnswerCacheScope = {
    isPremium,
    mode,
    chatMode,
    searchType,
    model: String(model),
  };
  const hasAttachments = (attachments?.length ?? 0) > 0 || Boolean(imageDataUrl);
  const cachedAnswer = await getCachedAnswer(
    query, answerScope, conversationHistory, hasAttachments,
  );
  if (cachedAnswer) {
    return {
      sources: cachedAnswer.sources,
      chunks: chunkTextToAnswer(cachedAnswer.cleanText, cachedAnswer.sources, query, mode),
      query,
      mode,
      timestamp: Date.now(),
      suggestedQuestions: cachedAnswer.followups,
    } as AnswerResult;
  }

  // Smart Auto Mode — when the user picked "auto", classify the query
  // and route to the model most likely to answer it well, instead of
  // always defaulting to Gemini Lite. The original requested model still
  // appears at the head of the fallback chain below (so failover semantics
  // are unchanged); we just substitute a better-suited model when the
  // user explicitly opted into automatic selection.
  let routedModel: LLMModel = model;
  if (model === 'auto') {
    const hasAttachment =
      Boolean(imageDataUrl) || ((attachments?.length ?? 0) > 0);
    routedModel = pickModelForAutoMode(query, hasAttachment, searchType);
    if (routedModel !== model) {
      console.log(`🤖 Auto Mode → ${routedModel} (query: "${query.slice(0, 60)}…")`);
    }
  }

  const fallbackChain = getSilentFallbackChain(routedModel, isPremium);
  let lastError: Error | undefined;

  // Cap each attempt so a rate-limited/overloaded provider can't hang the request
  // on SDK retry backoff. On a rate limit we skip the rest of that provider's
  // models and jump straight to a different provider's backup.
  const PER_MODEL_TIMEOUT_MS = 22000;

  for (let i = 0; i < fallbackChain.length; i++) {
    const tryModel = fallbackChain[i];
    try {
      const result = await withTimeout(
        routeAIAnswerForModel(
          tryModel, query, mode, isPremium, conversationHistory, chatMode,
          friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
          imageDataUrl, userContext, searchType, attachments, priorSummary
        ),
        PER_MODEL_TIMEOUT_MS
      );

      // Refusal detector — when a model returns a short "I can't fulfill
      // that" type reply on a normal query, treat it like a generation
      // failure so the fallback chain advances to the next model. GPT-4o
      // is the main offender today; this lets the silent failover
      // recover users who'd otherwise see a useless apology.
      const combinedText = result.chunks.map((c) => c.text).join('\n\n').trim();
      if (isModelRefusal(combinedText)) {
        console.warn(`⚠️ Model ${tryModel} refused (length ${combinedText.length}) — advancing fallback chain`);
        lastError = new Error(`${tryModel} refused the request`);
        continue;
      }

      if (tryModel !== routedModel) {
        console.log(`✅ Silent failover: ${routedModel} → ${tryModel}`);
      }

      // Add image generation for normal mode if query requires it.
      //
      // CRITICAL GUARD: when the user UPLOADED an image (attachments present)
      // they're almost always asking ABOUT that image, not requesting a new
      // one. The keyword heuristic in `shouldGenerateImage` matches the word
      // "image" in "describe this image", which used to bloat the response
      // with a ~1.4MB base64 PNG the user never asked for — that bloat is
      // what caused the white screen + apparent slowness on Auto Mode with
      // image uploads. Skip the auto-image-gen step whenever an attachment
      // is in play. Also skip on pronoun references to an existing image
      // ("describe this", "what is in the picture") which are clearly
      // questions about prior context, not new-image requests.
      const hasAttachment = (attachments?.length ?? 0) > 0;
      const referencesExistingImage =
        /\b(this|that|the|uploaded|attached|above)\s+(image|picture|photo|pic|graphic|screenshot)\b/i
          .test(query) ||
        /\bin\s+(this|the|that)\s+(image|picture|photo)\b/i.test(query) ||
        /\bdescribe\b/i.test(query);
      if (
        chatMode === 'normal'
        && !hasAttachment
        && !referencesExistingImage
        && shouldGenerateImage(query)
      ) {
        const answerText = result.chunks.map(c => c.text).join('\n\n');
        const imagePrompt = extractImagePrompt(query, answerText);

        if (imagePrompt) {
          console.log('🎨 Generating image for query:', imagePrompt);
          try {
            const generatedImage = await generateImage(imagePrompt);
            if (generatedImage) {
              result.images = [generatedImage];
              console.log('✅ Image added to result');
            }
          } catch (error) {
            console.error('Failed to generate image:', error);
          }
        }
      }

      // ── Write to answer cache (Normal + Web only) ──────────────────
      // Fire and forget — caching is best effort. If Redis is down or
      // tier budget is full, this is a no-op. The cache writer's own
      // guards skip Deep Research / companion modes / context-dependent
      // queries, so we never cache anything personalised.
      try {
        const cleanText = result.chunks.map((c) => c.text).join('\n\n').trim();
        setCachedAnswer(
          query,
          answerScope,
          {
            sources: result.sources,
            cleanText,
            followups: result.suggestedQuestions,
          },
          conversationHistory,
          hasAttachments,
        );
      } catch (e) {
        // Cache write must never break the user request.
        console.warn('Answer cache write failed:', e instanceof Error ? e.message : e);
      }

      return result;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error?.message || error));
      console.warn(`⚠️ Model ${tryModel} failed: ${lastError.message}`);

      // Rate-limited/overloaded → don't waste time on other models from the SAME
      // provider; skip ahead to the next different-provider backup immediately.
      if (isRateLimitError(error)) {
        const failed = providerOf(tryModel);
        if (failed !== 'other') reportRateLimitForProvider(failed as KeyProvider); // park that key
        while (i + 1 < fallbackChain.length && providerOf(fallbackChain[i + 1]) === failed) {
          console.warn(`⏭️ Skipping ${fallbackChain[i + 1]} (${failed} is rate-limited)`);
          i++;
        }
      }
    }
  }

  throw lastError ?? new Error('All AI providers failed. Please try again.');
}