import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { DiscoverItem } from '../types.js';
import { getLiveNews } from '../utils/discoverNews.js';
import { resolveRequestCountry } from '../utils/requestLocalContext.js';
import { redisGetJSON, redisSetJSON } from '../lib/redis.js';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { getApiKey } from '../utils/apiKeys.js';
import { searchWithExa } from '../utils/providerWebSearch.js';
const require = createRequire(import.meta.url);
const data = require('../data/discover.json');

const router = Router();
const allItems: DiscoverItem[] = data as DiscoverItem[];

type DiscoverArticlePayload = {
  overview: string;
  keyFacts: string[];
  sections: Array<{ title: string; content: string }>;
  relatedTopics: string[];
  readTime: string;
};

type DiscoverArticleCacheEntry = {
  article: DiscoverArticlePayload;
  ts: number;
};

const DISCOVER_ARTICLE_CACHE_VERSION = 'v2';
const DISCOVER_ARTICLE_L1_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DISCOVER_ARTICLE_L2_TTL_SEC = 24 * 60 * 60; // 24 hours
const DISCOVER_ARTICLE_L1 = new Map<string, DiscoverArticleCacheEntry>();

const GEMINI_ARTICLE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
] as const;

function normalizeForCache(value?: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function discoverArticleCacheKey(title?: string, description?: string, category?: string): string {
  const raw = JSON.stringify({
    t: normalizeForCache(title),
    d: normalizeForCache(description),
    c: normalizeForCache(category),
  });
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 32);
  return `discover:article:${DISCOVER_ARTICLE_CACHE_VERSION}:${hash}`;
}

function isValidDiscoverArticle(article: unknown): article is DiscoverArticlePayload {
  const a = article as DiscoverArticlePayload;
  return Boolean(
    a &&
    typeof a.overview === 'string' &&
    a.overview.trim().length > 0 &&
    Array.isArray(a.keyFacts) &&
    a.keyFacts.length > 0 &&
    Array.isArray(a.sections) &&
    a.sections.length > 0 &&
    Array.isArray(a.relatedTopics) &&
    typeof a.readTime === 'string'
  );
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  const mulberry32 = (s: number) => () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); return (t ^ t >>> 14) >>> 0; };
  const rng = mulberry32(h >>> 0);
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng() % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildArticlePrompt(
  title: string,
  description: string,
  category: string,
  extraContext = ''
): string {
  return `You are a knowledgeable expert writer for a Perplexity-style discovery app.
Generate a rich, detailed, well-structured article about the topic: "${title}"
Category: ${category || 'General'}
Brief context: ${description || ''}
${extraContext ? `\nAdditional web context:\n${extraContext}\n` : ''}

Include 1-2 relevant emojis at the start of each section title (e.g. 💉💊 for health, 🏏🎾 for sports, 📊 for finance, 🔬 for science). Put emojis in the title strings.

Respond ONLY with valid JSON in exactly this format (no markdown, no code blocks):
{
  "overview": "2-3 sentence engaging introduction to the topic",
  "keyFacts": ["fact 1", "fact 2", "fact 3", "fact 4", "fact 5"],
  "sections": [
    { "title": "🔬 Section heading", "content": "2-3 sentences of detailed content" },
    { "title": "Section heading", "content": "2-3 sentences of detailed content" },
    { "title": "Section heading", "content": "2-3 sentences of detailed content" },
    { "title": "Section heading", "content": "2-3 sentences of detailed content" }
  ],
  "relatedTopics": ["related topic 1", "related topic 2", "related topic 3", "related topic 4", "related topic 5"],
  "readTime": "X min read"
}

Make the content genuinely educational, interesting, and accurate. Use current knowledge.`;
}

function parseArticleJson(text: string): DiscoverArticlePayload {
  const clean = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(clean) as DiscoverArticlePayload;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    ),
  ]);
}

async function generateWithGemini(
  apiKey: string,
  model: string,
  prompt: string
): Promise<DiscoverArticlePayload> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model });
  const result = await withTimeout(m.generateContent(prompt), 22_000, `Gemini ${model}`);
  const text = result.response.text().trim();
  const article = parseArticleJson(text);
  if (!isValidDiscoverArticle(article)) throw new Error('Invalid Gemini article JSON');
  return article;
}

async function generateWithOpenAI(apiKey: string, prompt: string): Promise<DiscoverArticlePayload> {
  const client = new OpenAI({ apiKey });
  const response = await withTimeout(
    client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    }),
    22_000,
    'OpenAI'
  );
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI empty response');
  const article = parseArticleJson(text);
  if (!isValidDiscoverArticle(article)) throw new Error('Invalid OpenAI article JSON');
  return article;
}

async function generateWithGrok(apiKey: string, prompt: string): Promise<DiscoverArticlePayload> {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  });
  const response = await withTimeout(
    client.chat.completions.create({
      model: 'grok-2-1212',
      messages: [
        {
          role: 'system',
          content: 'You output only valid JSON matching the requested schema. No markdown fences.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2500,
    }),
    22_000,
    'Grok'
  );
  const text = response.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Grok empty response');
  const article = parseArticleJson(text);
  if (!isValidDiscoverArticle(article)) throw new Error('Invalid Grok article JSON');
  return article;
}

function buildFallbackArticle(
  title: string,
  description: string,
  category: string
): DiscoverArticlePayload {
  const overview =
    description?.trim() ||
    `${title} is a ${category || 'General'} story worth understanding in more depth.`;
  const facts = [
    `Headline: ${title}`,
    `Category: ${category || 'General'}`,
    description?.trim() || 'Full AI summary is being prepared — tap Deep dive with AI for more.',
  ].filter(Boolean);

  while (facts.length < 5) {
    facts.push(`Related coverage may expand on aspects of: ${title}`);
  }

  return {
    overview,
    keyFacts: facts.slice(0, 5),
    sections: [
      {
        title: '📰 What happened',
        content: description?.trim() || `This article covers ${title}.`,
      },
      {
        title: '🔍 Why it matters',
        content:
          'Stories like this often affect policy, markets, or communities depending on the domain. Use Deep dive with AI below for a tailored research brief.',
      },
      {
        title: '💡 What to watch next',
        content:
          'Follow official updates and trusted news sources for the latest developments on this topic.',
      },
    ],
    relatedTopics: [
      category || 'News',
      title.split(/\s+/).slice(0, 3).join(' '),
      'Latest updates',
      'Background context',
      'Expert analysis',
    ].filter((t) => t.length > 1),
    readTime: '2 min read',
  };
}

/** When LLMs fail but Exa returned snippets, weave them into a readable article. */
function buildExaEnrichedFallbackArticle(
  title: string,
  description: string,
  category: string,
  exaContext: string
): DiscoverArticlePayload {
  const snippets = exaContext
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);

  const keyFacts = snippets.slice(0, 5).map((s) => {
    const colon = s.indexOf(':');
    return colon > 0 ? s.slice(colon + 1).trim() || s : s;
  });
  while (keyFacts.length < 5) {
    keyFacts.push(description?.trim() || `Coverage related to ${title}`);
  }

  return {
    overview:
      description?.trim() ||
      `Here is what trusted sources are reporting about ${title}.`,
    keyFacts: keyFacts.slice(0, 5),
    sections: [
      {
        title: '📰 Latest reporting',
        content: snippets[0]?.replace(/^[^:]+:\s*/, '') || description || title,
      },
      {
        title: '🔍 Additional context',
        content:
          snippets.slice(1, 3).join(' ') ||
          'See related topics below or use Deep dive with AI for a full brief.',
      },
      {
        title: '💡 What to watch',
        content: `Stay tuned for updates on ${title} in ${category || 'the news'}.`,
      },
    ],
    relatedTopics: [
      category || 'News',
      title.split(/\s+/).slice(0, 3).join(' '),
      'Latest updates',
      'Background',
      'Analysis',
    ].filter((t) => t.length > 1),
    readTime: '3 min read',
  };
}

async function generateDiscoverArticlePayload(
  title: string,
  description: string,
  category: string
): Promise<DiscoverArticlePayload> {
  const geminiKey = getApiKey('gemini');
  const openaiKey = getApiKey('openai');
  const grokKey = getApiKey('grok');
  const exaKey = getApiKey('exa');

  let exaContext = '';
  if (exaKey) {
    try {
      const results = await searchWithExa(`${title} ${description}`.trim(), exaKey, 'instant', 8);
      exaContext = results
        .slice(0, 5)
        .map((r) => `- ${r.title}: ${r.content || ''}`)
        .join('\n');
    } catch (err) {
      console.warn('Discover article Exa context fetch failed:', err);
    }
  }

  const prompt = buildArticlePrompt(title, description, category, exaContext);
  const attempts: Array<{ label: string; run: () => Promise<DiscoverArticlePayload> }> = [];

  if (geminiKey) {
    for (const model of GEMINI_ARTICLE_MODELS) {
      attempts.push({
        label: `gemini:${model}`,
        run: () => generateWithGemini(geminiKey, model, prompt),
      });
    }
  }

  if (openaiKey) {
    attempts.push({
      label: 'openai:gpt-4o-mini',
      run: () => generateWithOpenAI(openaiKey, prompt),
    });
  }

  if (grokKey) {
    attempts.push({
      label: 'grok',
      run: () => generateWithGrok(grokKey, prompt),
    });
  }

  for (const attempt of attempts) {
    try {
      console.log(`📰 Discover article trying ${attempt.label}…`);
      const article = await attempt.run();
      console.log(`✅ Discover article generated via ${attempt.label}`);
      return article;
    } catch (err) {
      console.warn(`Discover article ${attempt.label} failed:`, err);
    }
  }

  if (exaContext) {
    console.warn('📰 All LLMs failed — serving Exa-enriched fallback article');
    return buildExaEnrichedFallbackArticle(title, description, category, exaContext);
  }

  console.warn('📰 All AI providers failed for discover article — serving structured fallback');
  return buildFallbackArticle(title, description, category);
}

router.get('/discover', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const shuffled = seededShuffle(allItems, today);
  res.json(shuffled);
});

router.get('/discover/news', async (req, res) => {
  try {
    const hinted = String(req.query.country || '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));

    let finalCountries: string[];
    if (hinted.length > 0) {
      finalCountries = hinted.slice(0, 2);
    } else {
      const ipCountry = resolveRequestCountry(req)?.toUpperCase();
      finalCountries = [ipCountry && /^[A-Z]{2}$/.test(ipCountry) ? ipCountry : 'IN'];
    }

    const forceRefresh =
      req.query.refresh === '1' ||
      req.query.refresh === 'true' ||
      String(req.headers['cache-control'] || '').toLowerCase().includes('no-cache');

    const items = await getLiveNews(finalCountries, 24, forceRefresh);
    res.json(items);
  } catch (err) {
    console.error('Live news fetch failed:', err);
    res.json([]);
  }
});

router.get('/discover/:id', (req, res) => {
  const item = allItems.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

router.post('/discover/article', async (req, res) => {
  const { title, description, category } = req.body as {
    title?: string;
    description?: string;
    category?: string;
  };
  const safeTitle = String(title || '').trim() || 'Discover topic';
  const safeDescription = String(description || '').trim();
  const safeCategory = String(category || 'General').trim() || 'General';

  const respond = (article: DiscoverArticlePayload) => {
    res.status(200).json(article);
  };

  try {
    const cacheKey = discoverArticleCacheKey(safeTitle, safeDescription, safeCategory);
    const l1 = DISCOVER_ARTICLE_L1.get(cacheKey);
    if (l1 && Date.now() - l1.ts < DISCOVER_ARTICLE_L1_TTL_MS) {
      return respond(l1.article);
    }
    const l2 = await redisGetJSON<DiscoverArticlePayload>(cacheKey);
    if (l2 && isValidDiscoverArticle(l2)) {
      DISCOVER_ARTICLE_L1.set(cacheKey, { article: l2, ts: Date.now() });
      return respond(l2);
    }

    const article = await generateDiscoverArticlePayload(
      safeTitle,
      safeDescription,
      safeCategory
    );
    DISCOVER_ARTICLE_L1.set(cacheKey, { article, ts: Date.now() });
    void redisSetJSON(cacheKey, article, DISCOVER_ARTICLE_L2_TTL_SEC);
    return respond(article);
  } catch (err) {
    console.error('Discover article route error:', err);
    return respond(buildFallbackArticle(safeTitle, safeDescription, safeCategory));
  }
});

export default router;
