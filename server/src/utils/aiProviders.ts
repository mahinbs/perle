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
  resolveOpenAIModel,
  resolveGeminiModel,
  resolveClaudeModel,
  resolveGrokModel,
  getSilentFallbackChain,
} from './modelRegistry.js';
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
function providerOf(m: LLMModel): string {
  if (isGeminiModel(m)) return 'gemini';
  if (isOpenAIModel(m)) return 'openai';
  if (isClaudeModel(m)) return 'claude';
  if (isGrokModel(m)) return 'grok';
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
  const k = searchCacheKey(q, scope);
  if (SEARCH_L1.size > 200) SEARCH_L1.clear(); // crude bound
  SEARCH_L1.set(k, { results, ts: Date.now() });
  // Fire-and-forget Redis write with tier budget enforcement (80/20 premium/free).
  const tier = scope.isPremium ? 'premium' : 'free';
  const maxKeysForTier = scope.isPremium ? SEARCH_L2_PREMIUM_KEY_BUDGET : SEARCH_L2_FREE_KEY_BUDGET;
  void redisSetJSONWithTierBudget(`search:${k}`, results, SEARCH_L2_TTL_SEC, tier, maxKeysForTier);
}

const MARKDOWN_TABLE_REGEX =
  /(?:^|\n)((?:\|[^\n]+\|\n)(?:\|[-:\s|]+\|\n)(?:\|[^\n]+\|\n?)+)/gm;

// Strip markdown formatting from text (optionally preserve markdown tables for comparisons)
function stripMarkdown(text: string, options?: { preserveTables?: boolean }): string {
  const tablePlaceholders: string[] = [];
  let working = text;

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

function buildNormalModeUserPrompt(
  query: string,
  mode: Mode,
  conversationHistory: ConversationMessage[],
  contextPrefix = '',
  isPremium = false
): string {
  const trimmed = query.trim();

  // ── Conversational / small-talk queries (greetings, how are you, etc.) ───────
  // These must NEVER be treated as research topics.  Return a short, natural-
  // reply prompt so the model answers the way a person would — not as a
  // linguistic essay with bullet points and sections.
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
    return `${contextPrefix}Mode: Research\nQuery: ${query}\nThis is a continuation follow-up. Expand the previous answer in substantial depth with clear sections, practical detail, and thorough explanation while maintaining the same topic and citations.\n\n[LANGUAGE RULE] Reply in the same language and script as the query above.`;
  }

  if (wantsTableFormat(query, mode)) {
    if (isListQuery(query)) {
      console.log('📋 List question detected — requesting markdown table format');
      if (isPremium) {
        return `${contextPrefix}Mode: ${mode}\nQuery: ${query}\nPREMIUM IN-DEPTH LIST QUESTION. You MUST produce a long, multi-section, expert-level analysis (minimum 1200 words; target 1500–2500 words). Required structure in this exact order:\n\n1) A 2–3 sentence engaging introduction setting context, naming the major players and explaining why this list matters right now.\n\n2) An emoji heading (matching the topic, e.g. "📱 Latest Mobile Processors (June 2026)") followed by a markdown TABLE with 10–12 rows covering EVERY major player + their notable variants. Columns MUST include: Name, Manufacturer, Process Node, Key Performance Specs, Standout Feature. STRICT SCOPE: only items that exactly match the asked category. FILL EVERY CELL with a real specific fact — never "-", "N/A", blank, or a placeholder. Table cells must NEVER contain citation numbers like [1], [2] — clean descriptive text only.\n\n3) After the table, add these REQUIRED emoji-headed sections (each with a DIFFERENT emoji, 4–6 bullets per section, with nested "  - " sub-bullets for extra specifics + numbers + benchmarks):\n   • "🔬 Deep Dive: Top Performers" — pick the 3–4 most important items and explain in depth: architecture, real-world performance, what makes them notable. 1 paragraph per item OR 4–6 detailed bullets per item.\n   • "📈 Key Industry Trends" — 4–5 bullets on the broader direction (process node race, AI/NPU shift, GPU evolution, efficiency, etc.) with concrete numbers/percentages.\n   • "🎯 Which One Should You Pick?" — 4–5 use-case-driven bullets (gamers, photography, AI/ML users, battery-life seekers, budget) each recommending a specific item with a 1-line reason.\n   • "🔮 What's Coming Next" — 3–4 bullets on upcoming releases, roadmaps, expected launches over the next 6–12 months.\n   • "💡 Key Takeaways" — 4–5 cited bullets [1], [2] with the most important facts a buyer/reader must remember. Citations live ONLY in this final section and in the Deep Dive section — NEVER in the table.\n\nWrite in clear expert tone — specific numbers (GHz, TOPS, TDPs, percentages), real product names, real benchmark scores. Do NOT hedge with vague phrases.\n\n[LANGUAGE RULE] Reply in the same language and script as the query above.`;
      }
      return `${contextPrefix}Mode: ${mode}\nQuery: ${query}\nThis is a list question. Write 1 sentence overview, then an emoji heading (matching the topic), then a markdown TABLE (6-8 rows of the most relevant items). STRICT SCOPE: only include items that exactly match the asked category — no loosely related items. COMPLETENESS: include EVERY major/obvious player in the category from your own knowledge, not just what search returned (e.g. "latest mobile processors" MUST include Apple, Qualcomm, MediaTek, Samsung, Google). FILL EVERY CELL with a real specific fact — NEVER leave a cell as "-", "N/A", blank, or any placeholder; use your own knowledge when search is missing a detail. CRITICAL: table cells must NEVER contain [1], [2], or any citation numbers — clean descriptive text only; citations go ONLY in the 2-3 bullet takeaways AFTER the table.\n\n[LANGUAGE RULE] Reply in the same language and script as the query above.`;
    }
    console.log('📊 Comparison question detected — requesting markdown table format');
    const compareDepth = isPremium
      ? `\nAFTER the table, ALSO add these REQUIRED emoji-headed sections (each with a DIFFERENT emoji, 4–6 bullets per section with nested "  - " sub-bullets, target 1200–2000 words total):\n• "🔬 Performance Deep Dive:" — 4–6 bullets benchmarking real-world differences (numbers, percentages, latency, throughput).\n• "✅ Strengths of <Option A>:" — 4–5 bullets of clear advantages.\n• "✅ Strengths of <Option B>:" — 4–5 bullets of clear advantages.\n• "⚠️ Trade-offs & Limitations:" — 4–5 bullets on the downsides of each.\n• "🎯 When to choose <Option A>:" — 4–5 bullets of specific user profiles/use-cases.\n• "🎯 When to choose <Option B>:" — 4–5 bullets of specific user profiles/use-cases.\n• "🏆 Verdict:" — 2–3 sentence final recommendation naming a winner (or "tie") + the single biggest reason.\n• "💡 Key Takeaways:" — 4–5 cited bullets [1], [2] with the most important facts.`
      : `\nAFTER the table, add 2–3 short bullet takeaways with citations [1], [2].`;
    return `${contextPrefix}Mode: Compare\nQuery: ${query}\nThis is a comparison question. Write ${isPremium ? '2–3 sentence' : '1 sentence'} overview, then an emoji heading (e.g. "📊 Comparison:"), then a markdown comparison table. Columns = items compared; rows = key criteria (${isPremium ? '10–12' : '5–8'} rows). CRITICAL: table cells must NEVER contain [1], [2], or any citation numbers — clean text only in cells.${compareDepth}\n\n[LANGUAGE RULE] Reply in the same language and script as the query above.`;
  }

  if (isPremium) {
    return `${contextPrefix}Mode: ${mode}\nQuery: ${query}\nPREMIUM IN-DEPTH REQUEST. Produce a long, expert-level multi-section answer (minimum 900 words; target 1500–2500 words when topic complexity justifies it). You MUST use ALL of these:\n• Start with a 2–3 sentence engaging introduction.\n• Then 6–8 emoji-headed sections, each with a DIFFERENT emoji that matches the section's topic.\n• Each section: 1 short intro line + 4–6 bullets + nested sub-bullets ("  - ") for extra specifics.\n• Pack every section with specific numbers, percentages, dates, named examples, and real-world context.\n• Include sections like: background/context, how it works (mechanism), key components/players, real-world examples, comparisons, trade-offs, current trends, future outlook, practical takeaways/recommendations.\n• End with a "💡 Key Takeaways" section of 4–5 cited bullets [1], [2].\n• NEVER hedge with vague phrases — be specific, technical, and expert.\n• If the query is trivially simple arithmetic/fact (e.g., \"2+2\"), answer directly and concisely instead of forcing long form.\n\n[LANGUAGE RULE] Reply in the same language and script as the query above.`;
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

// Check if query is asking about the AI itself
function isSelfReferentialQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  const selfRefPatterns = [
    /who\s+(are|were|is|was)\s+you/,
    /what\s+(are|were|is|was)\s+you/,
    /when\s+(did|do|were|are)\s+you\s+(start|begin|created|founded)/,
    /where\s+(are|were|did|do)\s+you\s+(come|from|start)/,
    /how\s+(old|long)\s+(are|were|is|was)\s+you/,
    /tell\s+me\s+(about|who)\s+you/,
    /what\s+(is|are)\s+your\s+(name|purpose|goal|mission)/,
    /who\s+(created|made|built|founded)\s+you/,
    /what\s+(model|ai|system)\s+(are|do)\s+you/,
    /are\s+you\s+(chatgpt|gpt|claude|gemini|grok|openai|anthropic|google)/,
    /you\s+(are|were)\s+(chatgpt|gpt|claude|gemini|grok|openai|anthropic|google)/
  ];
  
  return selfRefPatterns.some(pattern => pattern.test(lowerQuery));
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
  // Chat modes (AI Friend, AI Psychologist). The cap is a ceiling, not a
  // target — the model self-regulates length from the system prompt and the
  // query, so a one-line greeting still gets a one-line reply. 4000 tokens
  // (~3000 words) leaves comfortable headroom for the occasional long
  // emotional response or a group chat where several friends reply in turn.
  if (chatMode === 'ai_friend' || chatMode === 'ai_psychologist') {
    return 4000;
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

  return `\n\n📍 USER LOCAL CONTEXT:\n${lines.join('\n')}\n\nLOCALIZATION RULES:
- For price questions, present prices in the user's preferred currency when available.
- For date/time questions, use the user's local timezone and local date/time context.
- If exact local pricing is unavailable, show best-known global price and an approximate local conversion.
- Mention uncertainty briefly when local data cannot be verified.`;
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

function buildSmallTalkContextGuidance(
  query: string,
  conversationHistory: ConversationMessage[] = []
): string {
  if (!isSmallTalkQuery(query)) return '';

  const lastTopic = getLastMeaningfulUserTopic(conversationHistory);
  const topicLine = lastTopic
    ? `\n- Previous meaningful topic from this chat: "${lastTopic}"`
    : '\n- No earlier meaningful topic detected in this chat.';

  return `\n\n💬 SMALL-TALK MODE (AUTO):
- The user is making a conversational/small-talk message.
- Reply naturally, warmly, and with personality (2-5 concise lines).
- Be context-aware: use prior conversation tone and continuity.${topicLine}
- If a prior topic exists, add a short optional bridge like "Want to continue that?".
- Do NOT force web/factual citations for pure small-talk unless user asks factual/current info.`;
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
      const host = url.hostname.replace(/^www\./, '');
      const isGroundingRedirect = host.includes('vertexaisearch.cloud.google.com');
      let domain = isGroundingRedirect ? '' : host;

      if (!domain) {
        const domainInTitle = result.title.match(
          /\b([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+\.[a-z]{2,})\b/i
        );
        if (domainInTitle) {
          domain = domainInTitle[1].toLowerCase();
        } else if (/wikipedia/i.test(result.title)) {
          domain = 'wikipedia.org';
        } else if (/youtube/i.test(result.title)) {
          domain = 'youtube.com';
        } else {
          domain = host;
        }
      }

      sources.push({
        id: `web-${sources.length + 1}`,
        title: result.title,
        url: result.url,
        domain,
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
    return [
      'When do these feelings become strongest during your day?',
      'What thoughts usually show up right before you feel this way?',
      'What has helped you feel even 10% better in the past?',
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

  return [
    `Do you want a concise summary of "${shortTopic}" first?`,
    `Should I explain "${shortTopic}" in deeper detail with examples?`,
    `Want a practical checklist or next steps for "${shortTopic}"?`,
  ];
}

function isPsychologyMusicReliefQuery(query: string): boolean {
  const lower = query.toLowerCase();
  const musicIntent = /(music|song|songs|playlist|spotify|youtube)/.test(lower);
  const reliefIntent = /(anxious|anxiety|depressed|depression|stress|stressed|panic|overwhelm|calm|relax|sleep|sad)/.test(lower);
  return musicIntent && reliefIntent;
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

STRUCTURE (required):
• Start with a 2–4 sentence executive overview (plain text, no heading).
• Then 5–9 clearly labeled sections, each covering a distinct facet (background, how it works, key components, comparisons, data/numbers, pros & cons, challenges, real-world applications, recent developments, outlook).
• EVERY section heading: "🔬 Heading text:" — ONE relevant emoji first, then the heading, then a colon. Use a DIFFERENT emoji per section.
• Use sub-sections where helpful and indented sub-bullets ("  - ") for finer detail under a point.
• 4–8 bullets per section; include specific numbers, dates, percentages, named examples.
• Use a markdown TABLE wherever a comparison or structured list helps (specs, options, timelines) — fill every cell with real data, no empty/placeholder cells, no citations inside cells.
• End with a short "📌 Key Takeaways:" section (3–5 bullets).

RULES:
• Be genuinely comprehensive — cover angles a quick answer would skip.
• Keep emoji + plain-text headings (NO **bold** / ## markdown for headings).
• Accuracy first: use your own knowledge to fill gaps the web results miss; never leave anything vague or blank.`;

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
        return `You are ${friendName}, a friend having a casual conversation. ${friendDescription}

Be empathetic, understanding, and conversational. Use natural language like you're texting a close friend. Share relatable thoughts, ask follow-up questions, and show genuine interest in what they're saying. Be encouraging and positive. Keep responses conversational and friendly - not formal or robotic. You can use casual language, emojis occasionally, and show personality. Remember previous parts of the conversation to maintain context. NEVER use bullet points or formal structure - just talk naturally like a real human friend would.

🌐 LANGUAGE MIRRORING — ABSOLUTE RULE, OVERRIDES EVERYTHING ELSE:
- Look at the USER'S MOST RECENT MESSAGE. Reply in EXACTLY that language and script. Ignore what language earlier turns were in — if the user switches, you switch too, with zero acknowledgement.
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
      }
      return `You are a warm, supportive friend having a casual conversation. Be empathetic, understanding, and conversational. Use natural language like you're texting a close friend. Share relatable thoughts, ask follow-up questions, and show genuine interest in what they're saying. Be encouraging and positive. Keep responses conversational and friendly - not formal or robotic. You can use casual language, emojis occasionally, and show personality. Remember previous parts of the conversation to maintain context. NEVER use bullet points or formal structure - just talk naturally like a real human friend would.

🌐 LANGUAGE MIRRORING — ABSOLUTE RULE, OVERRIDES EVERYTHING ELSE:
- Look at the USER'S MOST RECENT MESSAGE. Reply in EXACTLY that language and script. Ignore what language earlier turns were in — if the user switches, you switch too, with zero acknowledgement.
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
      return `You are a professional, empathetic psychologist providing supportive guidance. Use active listening techniques, validate feelings, and ask thoughtful questions to help users explore their thoughts and emotions. Provide evidence-based insights when appropriate, but always be non-judgmental and supportive. Help users develop coping strategies and self-awareness. Maintain professional boundaries while being warm and understanding. Speak in a natural, conversational therapeutic tone - NOT in bullet points unless specifically giving actionable steps. Remember to consider the full context of the conversation in your responses.

CRITICAL AI PSYCHOLOGY RULES:
- Never show a "Sources" section in this mode.
- If the user asks for music for anxiety/depression/stress relief, provide YouTube and Spotify links automatically plus 3 suitable song suggestions.
- At the end of every response, include at least 3 related follow-up questions that help understand user pain/persona better.
- Always ask at least one gentle clarifying question to continue therapy-style support.

🌐 LANGUAGE MIRRORING — ABSOLUTE RULE, OVERRIDES EVERYTHING ELSE:
- Look at the USER'S MOST RECENT MESSAGE. Reply in EXACTLY that language and script. Ignore what language earlier turns were in — if the user switches, you switch too, with zero acknowledgement.
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
• Just provide the answer to the user's question${forTableFormat ? TABLE_FORMAT_SYSTEM_ADDON : ''}${forPremium ? PREMIUM_DEPTH_SYSTEM_ADDON : ''}${forDeepResearch ? DEEP_RESEARCH_SYSTEM_ADDON : ''}${spaceContext}${dateContext}${userLocalContext}${summaryContext}`
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
  if (isSelfReferentialQuery(query)) {
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
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
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
  const userContent = buildOpenAIUserContent(prompt, resolvedAttachments);
  if (resolvedAttachments.length > 0) {
    console.log(`📎 OpenAI: ${resolvedAttachments.length} attachment(s)`);
  }
  messages.push({ role: 'user', content: userContent });

  const openaiModel = resolveOpenAIModel(model);

  const tokenLimit = getEffectiveTokenLimit(mode, isContinuationFollowUpQuery(query) && conversationHistory.length > 0, isPremium, searchType === 'deep', chatMode);

  const response = await withTimeout(
    client.chat.completions.create({
      model: openaiModel,
      messages: messages,
      temperature: 0.2, // Lower temp = more consistent length/structure across retries
      max_tokens: tokenLimit,
      // SPEED OPTIMIZATIONS:
      top_p: 0.9, // Slightly restrict token selection for faster generation
      frequency_penalty: 0.5, // Reduce repetition = faster
      presence_penalty: 0.3 // Encourage conciseness = faster
    }),
    30_000 // 30s timeout - reduced for faster failure detection
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
  if (isSelfReferentialQuery(query)) {
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
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
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
  // Gemini 2.5+ supports up to 65536 output tokens. Premium gets the full budget;
  // free stays at 8192 to preserve cost/latency.
  const maxOutputTokens = isPremium ? Math.min(tokenLimit, 32768) : Math.min(tokenLimit, 8192);
  
  // Build parts array (text + optional attachments)
  const parts: any[] = [];
  prompt = augmentPromptForAttachments(prompt, resolvedAttachments, query);
  parts.push({ text: `${sys}\n\n${prompt}` });
  appendGeminiAttachmentParts(parts, resolvedAttachments);
  
  const generationRequest = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      maxOutputTokens: maxOutputTokens,
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
    }
  };

  let result: any;
  try {
    result = await withTimeout(
      modelInstance.generateContent(generationRequest),
      25_000
    );
  } catch (error: any) {
    const fallbackModel = 'gemini-2.5-flash-lite';
    const shouldFallback =
      geminiModel !== fallbackModel &&
      (error?.status === 404 ||
        error?.message?.includes('not found') ||
        error?.message?.includes('503') ||
        error?.message?.includes('high demand'));
    if (!shouldFallback) throw error;

    console.warn(`${geminiModel} unavailable, falling back to ${fallbackModel}`);
    const fallbackInstance = genAI.getGenerativeModel({ model: fallbackModel });
    result = await withTimeout(
      fallbackInstance.generateContent(generationRequest),
      25_000
    );
  }

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
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
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

// ── Cross-provider streaming wrapper ─────────────────────────────────────────
// Streams from Gemini (fast path). If Gemini fails BEFORE any token is emitted
// (e.g. 503 "high demand"), silently falls back to another provider via
// generateAIAnswer (OpenAI → Grok → Claude, each with its own internal failover)
// and replays the answer as simulated tokens so the user still gets a response.
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
  let yieldedToken = false;
  let yieldedSources = false;

  try {
    for await (const ev of streamGeminiAnswer(
      query, mode, model, isPremium, conversationHistory, chatMode,
      friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
      imageDataUrl, userContext, searchType, attachments, priorSummary
    )) {
      if (ev.type === 'sources') yieldedSources = true;
      if (ev.type === 'token') yieldedToken = true;
      yield ev;
    }
    return; // streamed successfully
  } catch (err) {
    console.warn('⚠️ Gemini streaming failed — cross-provider fallback:', err instanceof Error ? err.message : err);
    if (yieldedToken) {
      // Partial answer already streamed; close gracefully rather than restart.
      yield { type: 'done', cleanText: '', suggestedQuestions: buildSuggestedQuestions(query, chatMode) };
      return;
    }
  }

  // Non-streaming fallback across providers, replayed as tokens.
  const fallbackModels: LLMModel[] = [];
  if (process.env.OPENAI_API_KEY) fallbackModels.push('gpt-4o-mini');
  if (process.env.XAI_API_KEY || process.env.X_API_KEY) fallbackModels.push('grok-4.3');
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) fallbackModels.push('claude-4.6-sonnet');

  for (const fm of fallbackModels) {
    try {
      const result = await generateAIAnswer(
        query, mode, fm, isPremium, conversationHistory, chatMode,
        friendDescription, friendName, friendMemoryContext, spaceTitle, spaceDescription,
        imageDataUrl, userContext, searchType, attachments, priorSummary
      );
      if (!yieldedSources) {
        yield { type: 'sources', sources: result.sources };
        yieldedSources = true;
      }
      const text = result.chunks.map((c) => c.text).join('\n\n').trim();
      if (!text) continue;
      // Replay as small chunks so the frontend drip reveals smoothly.
      for (let i = 0; i < text.length; i += 18) {
        yield { type: 'token', text: text.slice(i, i + 18) };
      }
      const sq = Array.isArray(result.suggestedQuestions) && result.suggestedQuestions.length >= 3
        ? result.suggestedQuestions
        : buildSuggestedQuestions(query, chatMode);
      yield { type: 'done', cleanText: text, suggestedQuestions: sq };
      console.log(`✅ Cross-provider streaming fallback succeeded via ${fm}`);
      return;
    } catch (e) {
      console.warn(`Fallback model ${fm} failed:`, e instanceof Error ? e.message : e);
    }
  }

  // Total failure — close the stream cleanly so the client doesn't hang.
  if (!yieldedSources) yield { type: 'sources', sources: [] };
  yield { type: 'done', cleanText: '', suggestedQuestions: buildSuggestedQuestions(query, chatMode) };
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
  if (isSelfReferentialQuery(query)) {
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
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
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
  if (isSelfReferentialQuery(query)) {
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
  const smallTalkGuidance = buildSmallTalkContextGuidance(query, conversationHistory);
  if (smallTalkGuidance) sys += smallTalkGuidance;
  
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
  const fallbackChain = getSilentFallbackChain(model, isPremium);
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

      if (tryModel !== model) {
        console.log(`✅ Silent failover: ${model} → ${tryModel}`);
      }

      // Add image generation for normal mode if query requires it
      if (chatMode === 'normal' && shouldGenerateImage(query)) {
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

