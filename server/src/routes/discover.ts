import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DiscoverItem } from '../types.js';
import { getLiveNews } from '../utils/discoverNews.js';
import { resolveRequestCountry } from '../utils/requestLocalContext.js';
import { redisGetJSON, redisSetJSON } from '../lib/redis.js';
import { createHash } from 'crypto';
import { createRequire } from 'module';
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

const DISCOVER_ARTICLE_CACHE_VERSION = 'v1';
const DISCOVER_ARTICLE_L1_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DISCOVER_ARTICLE_L2_TTL_SEC = 24 * 60 * 60; // 24 hours
const DISCOVER_ARTICLE_L1 = new Map<string, DiscoverArticleCacheEntry>();

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
    Array.isArray(a.keyFacts) &&
    Array.isArray(a.sections) &&
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

router.get('/discover', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const shuffled = seededShuffle(allItems, today);
  res.json(shuffled);
});

// Live news for the "For You" tab — real, current headlines (Exa → Gemini fallback).
// The CLIENT hint (?country=IN) takes priority because it comes from the user's
// timezone (Asia/Kolkata → IN) which reflects their actual physical location.
// IP/geo headers are only used when no client hint is provided. Without this,
// running the backend on a non-IN host would pollute every tab with foreign news.
router.get('/discover/news', async (req, res) => {
  try {
    // 1) Client hint from frontend (timezone-based — most reliable for true location).
    const hinted = String(req.query.country || '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));

    let finalCountries: string[];
    if (hinted.length > 0) {
      // Client knows where the user is — trust it exclusively. No IP-mixing.
      finalCountries = hinted.slice(0, 2);
    } else {
      // No client hint — fall back to server-side IP/geo or default to IN.
      const ipCountry = resolveRequestCountry(req)?.toUpperCase();
      finalCountries = [ipCountry && /^[A-Z]{2}$/.test(ipCountry) ? ipCountry : 'IN'];
    }

    // Optional ?refresh=1 to bypass server-side cache and re-query upstream.
    const forceRefresh =
      req.query.refresh === '1' ||
      req.query.refresh === 'true' ||
      String(req.headers['cache-control'] || '').toLowerCase().includes('no-cache');

    // 24 per country — gives every category tab (Tech/Finance/Health/etc.)
    // enough variety to feel populated rather than near-empty.
    const items = await getLiveNews(finalCountries, 24, forceRefresh);
    res.json(items);
  } catch (err) {
    console.error('Live news fetch failed:', err);
    res.json([]); // graceful empty — frontend falls back to static pool
  }
});

router.get('/discover/:id', (req, res) => {
  const item = allItems.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Generate a full AI article for a discover topic using Gemini
router.post('/discover/article', async (req, res) => {
  const { title, description, category } = req.body as { title?: string; description?: string; category?: string };
  if (!title) return res.status(400).json({ error: 'title is required' });

  const cacheKey = discoverArticleCacheKey(title, description, category);
  const l1 = DISCOVER_ARTICLE_L1.get(cacheKey);
  if (l1 && Date.now() - l1.ts < DISCOVER_ARTICLE_L1_TTL_MS) {
    return res.json(l1.article);
  }
  const l2 = await redisGetJSON<DiscoverArticlePayload>(cacheKey);
  if (l2 && isValidDiscoverArticle(l2)) {
    DISCOVER_ARTICLE_L1.set(cacheKey, { article: l2, ts: Date.now() });
    return res.json(l2);
  }

  const apiKey = process.env.GOOGLE_API_KEY_FREE;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const prompt = `You are a knowledgeable expert writer for a Perplexity-style discovery app.
Generate a rich, detailed, well-structured article about the topic: "${title}"
Category: ${category || 'General'}
Brief context: ${description || ''}

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

    const timeout = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Gemini timeout')), ms));
    const result = await Promise.race([
      model.generateContent(prompt),
      timeout(20000),
    ]) as Awaited<ReturnType<typeof model.generateContent>>;
    const text = result.response.text().trim();

    // Strip potential markdown fences
    const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const article = JSON.parse(clean);
    if (!isValidDiscoverArticle(article)) throw new Error('Invalid article JSON shape');
    DISCOVER_ARTICLE_L1.set(cacheKey, { article, ts: Date.now() });
    void redisSetJSON(cacheKey, article, DISCOVER_ARTICLE_L2_TTL_SEC);
    res.json(article);
  } catch (err) {
    console.error('Discover article generation failed:', err);
    // Serve stale cache on provider failure, if available.
    const stale = DISCOVER_ARTICLE_L1.get(cacheKey) || {
      article: await redisGetJSON<DiscoverArticlePayload>(cacheKey),
      ts: 0,
    };
    if (stale.article && isValidDiscoverArticle(stale.article)) {
      return res.json(stale.article);
    }
    res.status(500).json({ error: 'Failed to generate article' });
  }
});

export default router;

