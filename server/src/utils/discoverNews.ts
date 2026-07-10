import type { DiscoverItem } from '../types.js';
import { getApiKey } from './apiKeys.js';
import { redisGetJSON, redisSetJSON } from '../lib/redis.js';

// ── World News API — Reporter plan ($39/mo) ─────────────────────────────────
// Limits we must respect:
//   • 500 points/day (then $0.003/point overage) → soft budget 480
//   • 2 requests/second
//   • 5 concurrent requests → we cap at 4
// Search News cost ≈ 1 + 0.01 × results returned.
const WN_DAILY_POINT_BUDGET = 480;
const WN_MAX_RPS = 2;
const WN_MAX_CONCURRENT = 3; // stay under Reporter's 5 concurrent
const WN_MIN_INTERVAL_MS = 650; // safer than 500ms — avoids 429 bursts
/** Results per search — max allowed by World News API for fuller section tabs. */
const WN_RESULTS_PER_REQUEST = 100;

let wnInFlight = 0;
let wnLastStartedAt = 0;
let wnChain: Promise<void> = Promise.resolve();
let wnPointsMemDay = '';
let wnPointsMemUsed = 0;

function wnUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function estimateSearchPoints(resultCount: number): number {
  return 1 + 0.01 * Math.max(0, resultCount);
}

async function getWorldNewsPointsUsed(): Promise<number> {
  const day = wnUtcDayKey();
  if (wnPointsMemDay === day) return wnPointsMemUsed;
  const fromRedis = await redisGetJSON<number>(`worldnews:points:${day}`);
  wnPointsMemDay = day;
  wnPointsMemUsed = typeof fromRedis === 'number' && Number.isFinite(fromRedis) ? fromRedis : 0;
  return wnPointsMemUsed;
}

async function addWorldNewsPoints(points: number): Promise<void> {
  if (!(points > 0)) return;
  const day = wnUtcDayKey();
  const used = (await getWorldNewsPointsUsed()) + points;
  wnPointsMemDay = day;
  wnPointsMemUsed = used;
  void redisSetJSON(`worldnews:points:${day}`, used, 48 * 60 * 60);
}

async function canSpendWorldNewsPoints(estimate: number): Promise<boolean> {
  const used = await getWorldNewsPointsUsed();
  return used + estimate <= WN_DAILY_POINT_BUDGET;
}

/** Serialize + rate-limit World News calls for the Reporter plan. */
async function worldNewsFetch(
  url: string,
  apiKey: string,
  estimatedPoints: number
): Promise<{ ok: boolean; status: number; data: any | null; skipped?: string }> {
  if (!(await canSpendWorldNewsPoints(estimatedPoints))) {
    console.warn(
      `⚠️ World News daily point budget reached (~${WN_DAILY_POINT_BUDGET}). Serving cache/last-good.`
    );
    return { ok: false, status: 402, data: null, skipped: 'budget' };
  }

  // Chain ensures ≤ WN_MAX_RPS and ≤ WN_MAX_CONCURRENT.
  const run = wnChain.then(async () => {
    while (wnInFlight >= WN_MAX_CONCURRENT) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const wait = WN_MIN_INTERVAL_MS - (Date.now() - wnLastStartedAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    wnLastStartedAt = Date.now();
    wnInFlight++;
  });
  wnChain = run.catch(() => undefined);
  await run;

  try {
    const doFetch = async () =>
      fetch(url, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(20_000),
      });

    let response = await doFetch();
    let status = response.status;

    // Reporter plan: one retry after backoff on 429
    if (status === 429) {
      console.warn('⚠️ World News rate limit (429) — backing off 3s and retrying once');
      await new Promise((r) => setTimeout(r, 3000));
      wnLastStartedAt = Date.now();
      response = await doFetch();
      status = response.status;
      if (status === 429) {
        console.warn('⚠️ World News still rate-limited after retry');
        return { ok: false, status, data: null };
      }
    }
    if (status === 402) {
      console.warn('⚠️ World News quota exhausted (402)');
      // Mark budget as full so we stop hammering today.
      await addWorldNewsPoints(WN_DAILY_POINT_BUDGET);
      return { ok: false, status, data: null };
    }
    if (!response.ok) {
      return { ok: false, status, data: null };
    }
    const data = await response.json();

    // Prefer live quota headers when present; else estimate from payload size.
    const headerCost = Number(
      response.headers.get('x-api-quota-request') ||
        response.headers.get('X-API-Quota-Request') ||
        ''
    );
    const returned =
      (Array.isArray(data?.news) ? data.news.length : 0) ||
      (Array.isArray(data?.top_news)
        ? data.top_news.reduce(
            (n: number, c: any) => n + (Array.isArray(c?.news) ? c.news.length : 0),
            0
          )
        : 0);
    const spent = Number.isFinite(headerCost) && headerCost > 0
      ? headerCost
      : estimateSearchPoints(returned || WN_RESULTS_PER_REQUEST);
    await addWorldNewsPoints(spent);

    const left = response.headers.get('x-api-quota-left') || response.headers.get('X-API-Quota-Left');
    if (left) console.log(`📊 World News quota left (header): ${left}; spent≈${spent.toFixed(2)}`);

    return { ok: true, status, data };
  } catch (err) {
    console.warn('World News fetch error:', err instanceof Error ? err.message : err);
    return { ok: false, status: 0, data: null };
  } finally {
    wnInFlight = Math.max(0, wnInFlight - 1);
  }
}

// ── Country config ────────────────────────────────────────────────────────────
// Resolve any ISO 3166-1 alpha-2 code → display name (no hard country limit).
let REGION_NAMES: { of: (code: string) => string | undefined } | null = null;
try {
  REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  REGION_NAMES = null;
}

function countryLabel(code: string): string {
  const c = code.toUpperCase();
  if (c === 'WW') return 'World';
  try {
    const name = REGION_NAMES?.of(c);
    if (name && name !== c) return name;
  } catch { /* ignore */ }
  return c;
}

// Topical classification — word-boundary regex so "Mumbai" doesn't match "ai"
// and "Bengal" doesn't match "gal". Order matters: Politics/Crime are checked
// BEFORE Tech/Finance so a political story isn't mis-tagged as Finance just
// because it mentions "bank accounts".
//
// Category fallback image strategy:
//
// Real article images come from (1) Exa's `item.image` field or (2) the
// og:image scrape in `enrichDiscoverImages` below. Together those cover
// roughly 80-90% of news articles. For the remaining 10-20% with no
// publisher-supplied image, we render a clean, category-coloured gradient
// card with the topic label.
//
// We used to maintain a pool of curated Unsplash photos per category, but
// (a) it was content-curation work nobody could keep up with — when the
//     same physical photo got re-categorised on Unsplash's side, it would
//     suddenly appear with the wrong topic (we saw "vegetables" tagged
//     against PM warship stories, "couple holding hands" tagged against
//     police arrest stories), and
// (b) the fallback should LOOK like a fallback, not an unrelated stock
//     photo. A coloured gradient with a category label signals "this is
//     a topic placeholder" instead of pretending to be a real article shot.
//
// SVG data URLs render instantly, never 404, never get mis-tagged.

const CATEGORY_KEYWORDS: Array<{ keys: RegExp; tag: string }> = [
  // Sports first — very specific words, never ambiguous.
  { keys: /\b(cricket|football|soccer|tennis|olympic|olympics|nba|fifa|ipl|t20|odi|test match|sport|sports|athlete|tournament|championship|league|match\b)/i, tag: 'Sports' },
  // Politics/Crime/Govt — checked BEFORE Finance so "bank account probe" stays political.
  { keys: /\b(election|elections|parliament|congress|bjp|tmc|aap|government|govt|minister|ministry|cabinet|politics|political|policy|president|prime minister|pm|mp|mla|cm|chief minister|opposition|vote|voted|voting|protest|protests|rally|bill passed|legislation|court|supreme court|high court|judge|judgment|arrest|arrested|probe|investigation|fir|cbi|ed|raid|crime|murder|attack|attacked|strike enters|police|protest)/i, tag: 'Politics' },
  // Health
  { keys: /\b(health|healthcare|medical|hospital|vaccine|vaccination|disease|covid|virus|doctor|doctors|nurse|patient|patients|medicine|pharma|pharmaceutical|drug|fda|who|treatment|clinical|surgery|outbreak|epidemic|pandemic|mental health)\b/i, tag: 'Health' },
  // Science (incl. space)
  { keys: /\b(space|nasa|isro|spacex|rocket|satellite|astronaut|mars|moon|science|scientist|scientific|research|researchers|study|studies|discovery|biology|chemistry|physics|genome|dna|telescope|quantum|lab|laboratory|experiment|astronomy|particle|fossil|archaeolog)\b/i, tag: 'Science' },
  // Environment
  { keys: /\b(climate|climate change|warming|emissions|renewable|solar|wind power|environment|environmental|carbon|sustainability|sustainable|pollution|wildlife|biodiversity|forest|reforestation|cyclone|flood|earthquake|wildfire|heatwave|drought|weather|monsoon|green energy|deforestation|ocean|glacier)\b/i, tag: 'Environment' },
  // Tech (strict word boundaries; explicitly NOT "ai" because of "Mumbai" etc.)
  { keys: /\b(artificial intelligence|machine learning|deep learning|generative ai|llm|gpt|chatgpt|openai|anthropic|nvidia|gpu|tech|technology|startup|startups|software|hardware|chip|chipset|semiconductor|gadget|smartphone|iphone|android|laptop|app launch|app update|cloud|saas|crypto|blockchain|metaverse|robot|robotics|drone|cybersecurity|hack|hacker|hacked|data breach)\b/i, tag: 'Tech' },
  // Finance (only specific finance terms, not bare "bank")
  { keys: /\b(stock market|stocks?|shares?|sensex|nifty|dow|nasdaq|s&p|economy|economic|inflation|interest rate|interest rates|rupee|dollar|gdp|federal reserve|rbi|sec|ipo|earnings|revenue|profit|market cap|finance|financial|investor|investors|investing|investment|trading|trader|bond|treasury|recession|bull market|bear market|commodity|cryptocurrency|bitcoin|fund|funds|merger|acquisition|tariff|tariffs|business|markets?|wall street|sensex|nifty)\b/i, tag: 'Finance' },
];

interface CategoryStyle {
  emoji: string;
  label: string;
  from: string; // gradient start colour
  to: string;   // gradient end colour
}

const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  Sports:      { emoji: '🏆', label: 'SPORTS',      from: '#F97316', to: '#DC2626' },
  Politics:    { emoji: '🏛️', label: 'POLITICS',    from: '#1E3A8A', to: '#0F172A' },
  Health:      { emoji: '🏥', label: 'HEALTH',      from: '#DC2626', to: '#F97316' },
  Science:     { emoji: '🔬', label: 'SCIENCE',     from: '#0EA5E9', to: '#1E3A8A' },
  Environment: { emoji: '🌿', label: 'ENVIRONMENT', from: '#10B981', to: '#065F46' },
  Tech:        { emoji: '💻', label: 'TECH',        from: '#6366F1', to: '#3730A3' },
  Finance:     { emoji: '💰', label: 'FINANCE',     from: '#F59E0B', to: '#047857' },
  News:        { emoji: '📰', label: 'NEWS',        from: '#475569', to: '#1E293B' },
};

/**
 * Build a 600×300 SVG card with a category-coloured gradient + emoji + label,
 * encoded as a data URL. Cheap (a few hundred bytes), never 404s, never
 * shows the wrong topic. The first 8 characters of the seeded title hash
 * are used to slightly rotate the gradient angle so adjacent cards in the
 * same category look like variations of each other instead of identical
 * tiles.
 */
function buildCategoryFallbackImage(tag: string, seed: string): string {
  const style = CATEGORY_STYLE[tag] ?? CATEGORY_STYLE.News;
  // Deterministic 0-359° hue offset derived from seed so cards differ.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const angle = Math.abs(h) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300' preserveAspectRatio='xMidYMid slice'>` +
    `<defs><linearGradient id='g' gradientTransform='rotate(${angle})'>` +
    `<stop offset='0%' stop-color='${style.from}'/>` +
    `<stop offset='100%' stop-color='${style.to}'/>` +
    `</linearGradient></defs>` +
    `<rect width='600' height='300' fill='url(#g)'/>` +
    // Subtle dot pattern for visual texture (single repeating circle).
    `<g fill='rgba(255,255,255,0.06)'>` +
    `<circle cx='80' cy='60'  r='4'/><circle cx='180' cy='110' r='3'/>` +
    `<circle cx='320' cy='40' r='5'/><circle cx='440' cy='130' r='3'/>` +
    `<circle cx='520' cy='70' r='4'/><circle cx='90'  cy='220' r='3'/>` +
    `<circle cx='240' cy='200' r='4'/><circle cx='400' cy='240' r='5'/>` +
    `<circle cx='540' cy='210' r='3'/></g>` +
    `<text x='50%' y='52%' text-anchor='middle' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='52' fill='white'>${style.emoji}</text>` +
    `<text x='50%' y='80%' text-anchor='middle' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='22' font-weight='700' letter-spacing='6' fill='rgba(255,255,255,0.92)'>${style.label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function pickImageAndTag(text: string, seed: string = ''): { image: string; tag: string } {
  for (const c of CATEGORY_KEYWORDS) {
    if (c.keys.test(text)) {
      return { image: buildCategoryFallbackImage(c.tag, seed || text), tag: c.tag };
    }
  }
  return { image: buildCategoryFallbackImage('News', seed || text), tag: 'News' };
}

// Map the topical tag to the frontend's DISCOVER_CATEGORIES so each story lands
// on BOTH the "For You" tab AND the category-specific tab. Stories without a
// clean category match still appear on "For You".
function categoryFromTag(tag: string): string {
  switch (tag) {
    case 'Tech':        return 'Technology';
    case 'Finance':     return 'Finance';
    case 'Health':      return 'Health';
    case 'Science':     return 'Science';
    case 'Environment': return 'Environment';
    case 'Sports':      return 'Sports';
    case 'Politics':    return 'Politics';
    default:            return 'For You';
  }
}

/**
 * Optional light relevance helper (used only when we have no World News
 * category filter). Prefer trusting the API bucket over keyword auto-tag.
 */
function matchesDiscoverCategory(title: string, description: string, category: string): boolean {
  if (!category || category === 'For You') return true;
  const text = `${title} ${description || ''}`;
  if (category === 'Psychology') {
    return /\b(psycholog|mental health|wellbeing|well-being|therapy|therapist|counseling|counsellor|mindfulness|depression|anxiety|ptsd|trauma|cognitive|behaviour|behavior|emotion|stress|burnout|self[- ]esteem|psychiatr|counsel|wellness|mood|suicide|grief)\b/i.test(text);
  }
  const { tag } = pickImageAndTag(text, title);
  if (categoryFromTag(tag) === category) return true;
  const extra: Record<string, RegExp> = {
    Politics: /\b(election|parliament|congress|minister|government|govt|president|prime minister|senate|cabinet|legislation|ballot|campaign|politic|bjp|tmc|aap|mla|\bmp\b|\bcm\b|supreme court|high court|opposition|vote|protest|diplomat|embassy|sanctions?|coalition|ruling party|lawmaker)\b/i,
    Technology: /\b(tech|technology|software|startup|ai\b|artificial intelligence|chip|semiconductor|app\b|gadget|cyber|robot|smartphone|iphone|android|openai|nvidia|google|microsoft|apple|meta|amazon|saas|cloud computing)\b/i,
    Science: /\b(science|scientist|research|discovery|space|nasa|isro|physics|biology|chemistry|genome|telescope|mars|moon|quantum|laboratory|experiment|astronomy|study finds|peer[- ]reviewed)\b/i,
    Health: /\b(health|hospital|vaccine|medical|doctor|disease|patient|pharma|treatment|clinic|covid|virus|medicine|who\b|fda|outbreak|surgery)\b/i,
    Environment: /\b(climate|environment|pollution|carbon|wildlife|flood|earthquake|renewable|emissions|biodiversity|wildfire|heatwave|drought|green energy|weather|monsoon|deforestation|sustainab)\b/i,
    Finance: /\b(stock|stocks|shares|market|economy|economic|inflation|gdp|finance|financial|investor|ipo|earnings|rupee|dollar|sensex|nifty|bank|tariff|revenue|trading|federal reserve|rbi|business|profit|markets)\b/i,
    Sports: /\b(sport|cricket|football|soccer|tennis|olympic|nba|fifa|ipl|match|tournament|championship|athlete|premier league|world cup|goal|wicket)\b/i,
  };
  return Boolean(extra[category]?.test(text));
}

/** Rolling retention: keep ≤7 days; on refresh drop the oldest ~2.5 days. */
const NEWS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NEWS_DROP_OLDEST_ON_REFRESH_MS = Math.round(2.5 * 24 * 60 * 60 * 1000);
const NEWS_KEEP_ON_REFRESH_MS = NEWS_MAX_AGE_MS - NEWS_DROP_OLDEST_ON_REFRESH_MS;

function itemAgeMs(it: DiscoverItem): number | null {
  if (it.publishedAt) {
    const t = Date.parse(it.publishedAt);
    if (Number.isFinite(t)) return Date.now() - t;
  }
  if (typeof it.fetchedAt === 'number' && Number.isFinite(it.fetchedAt)) {
    return Date.now() - it.fetchedAt;
  }
  return null;
}

function pruneStaleNews(items: DiscoverItem[], keepWindowMs = NEWS_MAX_AGE_MS): DiscoverItem[] {
  const now = Date.now();
  return items
    .filter((it) => {
      const age = itemAgeMs(it);
      if (age === null) return true;
      return age <= keepWindowMs;
    })
    .map((it) => ({
      ...it,
      fetchedAt: it.fetchedAt || now,
    }));
}

function stampFetchedAt(items: DiscoverItem[]): DiscoverItem[] {
  const now = Date.now();
  return items.map((it) => ({ ...it, fetchedAt: it.fetchedAt || now }));
}

function categoryFromWorldNewsCategory(
  apiCategory: string | undefined,
  forceCategory?: string,
  fallbackTag?: string
): string {
  // Don't blindly trust forceCategory — only apply when the story actually matches.
  if (forceCategory && forceCategory !== 'For You') {
    // Caller still sets forceCategory for bucket labeling; relevance is filtered later.
  }
  if (forceCategory) return forceCategory;
  const c = (apiCategory || '').toLowerCase();
  const map: Record<string, string> = {
    politics: 'Politics',
    technology: 'Technology',
    science: 'Science',
    health: 'Health',
    environment: 'Environment',
    business: 'Finance',
    sports: 'Sports',
    entertainment: 'For You',
    lifestyle: 'For You',
    travel: 'For You',
    culture: 'For You',
    education: 'Science',
    other: 'For You',
  };
  if (map[c]) return map[c];
  return fallbackTag ? categoryFromTag(fallbackTag) : 'For You';
}

/** True for real http(s) publisher images — rejects SVG/data/Unsplash placeholders. */
function isRealArticleImage(image: string | null | undefined): boolean {
  if (!image || typeof image !== 'string') return false;
  const trimmed = image.trim();
  if (!trimmed) return false;
  // Category gradient SVGs and any other data-URI placeholders
  if (/^data:/i.test(trimmed)) return false;
  if (/image\/svg/i.test(trimmed)) return false;
  // Legacy Unsplash topical stock photos (not article photos)
  if (/images\.unsplash\.com/i.test(trimmed)) return false;
  if (/via\.placeholder\.com|placehold\.co|placeholder\.com|picsum\.photos/i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // Tiny / default logo-style paths that aren't article photos
    if (/\/favicon|\/logo[-_.]|\/default[-_.]?(image|thumb|news)?\./i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function mapWorldNewsArticle(
  article: {
    id?: number;
    title?: string;
    text?: string;
    summary?: string;
    url?: string;
    image?: string | null;
    category?: string;
    publish_date?: string;
  },
  country: string,
  idx: number,
  opts?: { forceCategory?: string; forceTag?: string }
): DiscoverItem | null {
  const title = typeof article?.title === 'string' ? article.title.trim() : '';
  const url = typeof article?.url === 'string' ? article.url.trim() : '';
  if (!title || !url) return null;

  // Drop stories without a real publisher image (no SVG category placeholders).
  const image = typeof article.image === 'string' ? article.image.trim() : '';
  if (!isRealArticleImage(image)) return null;

  const rawDescription =
    (typeof article.summary === 'string' && article.summary.trim()) ||
    (typeof article.text === 'string' ? article.text.slice(0, 400) : '') ||
    title;
  const description = cleanDescription(rawDescription, title);
  if (isLikelyJunkNewsItem(title, description, url)) return null;

  const label = countryLabel(country);
  const { tag: autoTag } = pickImageAndTag(title, title);
  const tag = opts?.forceTag || autoTag;
  const category = categoryFromWorldNewsCategory(article.category, opts?.forceCategory, tag);
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

  const publishedAt =
    typeof article.publish_date === 'string' && article.publish_date.trim()
      ? article.publish_date.trim()
      : undefined;

  return {
    id: `news-${country.toLowerCase()}-${category}-${slugify(title) || article.id || idx}`,
    title,
    tag,
    image,
    alt: title,
    description,
    category,
    nation: label,
    nationCode: country.toUpperCase(),
    fetchedAt: Date.now(),
    ...(publishedAt ? { publishedAt } : {}),
    ...(url ? { url, sourceDomain: domain } : {}),
  } as DiscoverItem;
}

// ── World News API (Reporter plan — rate-limited + point-budgeted) ──────────
async function fetchWorldNewsSearch(
  country: string,
  apiKey: string,
  limit: number,
  opts: { categories?: string; text?: string; forceCategory?: string; forceTag?: string }
): Promise<DiscoverItem[]> {
  const code = country.toUpperCase();
  const number = Math.min(Math.max(limit, 1), WN_RESULTS_PER_REQUEST);
  const params = new URLSearchParams({
    language: 'en',
    number: String(number),
    sort: 'publish-time',
    'sort-direction': 'DESC',
  });
  // WW = worldwide (omit source-country). Country codes pin local sources.
  if (code !== 'WW') {
    params.set('source-country', code.toLowerCase());
  }
  // Pull up to 7 days; pruneStaleNews drops older items on write.
  const earliest = new Date(Date.now() - NEWS_MAX_AGE_MS);
  params.set('earliest-publish-date', earliest.toISOString().slice(0, 10));
  if (opts.categories) params.set('categories', opts.categories);
  if (opts.text) params.set('text', opts.text);
  if (!opts.categories && !opts.text) params.set('text', 'news');

  const url = `https://api.worldnewsapi.com/search-news?${params}`;
  const { ok, status, data, skipped } = await worldNewsFetch(
    url,
    apiKey,
    estimateSearchPoints(number)
  );
  if (!ok) {
    if (!skipped) {
      console.warn(`World News API search failed for ${country}: HTTP ${status || 'error'}`);
    }
    return [];
  }
  const articles: any[] = Array.isArray(data?.news) ? data.news : [];
  return articles
    .map((item, idx) => mapWorldNewsArticle(item, country, idx, opts))
    .filter((x): x is DiscoverItem => x !== null)
    .slice(0, limit);
}

async function fetchWorldNewsTop(
  country: string,
  apiKey: string,
  limit: number
): Promise<DiscoverItem[]> {
  // Top News is useful but costs extra points — only used when budget allows.
  if (!(await canSpendWorldNewsPoints(2))) return [];
  const params = new URLSearchParams({
    'source-country': country.toLowerCase(),
    language: 'en',
  });
  const url = `https://api.worldnewsapi.com/top-news?${params}`;
  const { ok, status, data } = await worldNewsFetch(url, apiKey, 2);
  if (!ok) {
    console.warn(`World News API top-news failed for ${country}: HTTP ${status || 'error'}`);
    return [];
  }
  const clusters: any[] = Array.isArray(data?.top_news) ? data.top_news : [];
  const articles: any[] = [];
  for (const cluster of clusters) {
    if (Array.isArray(cluster?.news)) articles.push(...cluster.news);
  }
  return articles
    .map((item, idx) =>
      mapWorldNewsArticle(item, country, idx, { forceCategory: 'For You', forceTag: 'News' })
    )
    .filter((x): x is DiscoverItem => x !== null)
    .slice(0, limit);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

// ── News cache (L1 in-memory + L2 Redis) ────────────────────────────────────
// L1 60s burst absorber; L2 Redis 30 min (shared across instances). Same
// pattern as SEARCH_CACHE in aiProviders.ts.
interface CacheEntry { items: DiscoverItem[]; ts: number; }
const NEWS_L1 = new Map<string, CacheEntry>();
const NEWS_L1_TTL_MS = 60 * 1000;
// World News API refresh cadence — refetch upstream every 3 hours (within the
// user's 2–3h target). L2 Redis TTL + the 3-hour cycle key below both align
// so stories rotate ~8× per day instead of the old 6h / daily-only model.
export const NEWS_REFRESH_INTERVAL_HOURS = 3;
const NEWS_L2_TTL_SEC = NEWS_REFRESH_INTERVAL_HOURS * 60 * 60;
// Bump this whenever the news pipeline shape changes (new categories, new tag
// → category mapping, new topic list) so stale Redis data from older versions
// is dropped instead of served.
//   v9  = stricter aggregator/section-front filter
//   v10 = og:image enrichment + curated category gradient fallbacks (no more
//         vegetables-for-warships mismatches from the old Unsplash pools).
//   v11 = per-category URL dedup + top-up from related categories so
//         Politics / Psychology aren't starved when For You eats their
//         articles first. Force rotates because the old v10 cache holds
//         3-item Politics tabs we no longer want to serve.
//   v12 = World News API as primary news source (Exa/Gemini remain fallback).
//   v13 = 3-hour World News API refresh cadence (was 6h).
//   v14 = 50 articles/category + drop SVG placeholder images (real images only).
//   v15 = keep previous Exa/Gemini pipeline AND World News; merge both; filter SVG.
//   v16 = stricter real-image filter (no SVG/Unsplash/data URLs) + strip after enrichment.
//   v17 = no blind category top-up; strict keyword relevance per section; For You global dedupe.
//   v18 = worldwide World News (WW) + soft category relevance + 7-day rolling prune.
//   v19 = World News API only (Exa/Gemini discover pipelines removed); max 100/cat.
//   v20 = Reporter plan tuning: 2 rps / ≤4 concurrent / 480 pt daily budget / 50 results.
//   v21 = trust API categories for Science/Env/Finance; global dedupe; fetch order fix.
//   v22 = drop keyword re-filter on API category buckets; categories-only queries (no AND text).
const NEWS_CACHE_VERSION = 'v22';

// Refresh-cycle timezone per country. Cycle rotates every NEWS_REFRESH_INTERVAL_HOURS.
const COUNTRY_TIMEZONES: Record<string, string> = {
  IN: 'Asia/Kolkata',
  US: 'America/New_York',
  GB: 'Europe/London',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  PK: 'Asia/Karachi',
  BD: 'Asia/Dhaka',
  AE: 'Asia/Dubai',
  SG: 'Asia/Singapore',
  JP: 'Asia/Tokyo',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
};

function formatYmdInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function localHourInTz(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  const n = Number.parseInt(hour, 10);
  return Number.isFinite(n) ? n : 0;
}

function newsRefreshCycle(countryCode: string): string {
  const code = countryCode.toUpperCase();
  const timeZone = COUNTRY_TIMEZONES[code] || 'Asia/Kolkata';
  const now = new Date();
  const ymd = formatYmdInTz(now, timeZone);
  const localHour = localHourInTz(now, timeZone);
  const slot = Math.floor(localHour / NEWS_REFRESH_INTERVAL_HOURS);
  return `${ymd}-h${slot}`;
}

const GENERIC_HEADLINE_RE =
  /\b(latest news|breaking news|today'?s latest updates|top headlines|top headlines today|live updates|live news|breaking news update|breaking headlines|news today|india news today|today'?s news|today'?s headlines|morning brief|evening brief|news digest|news roundup|news wrap)\b/i;
const JUNK_TEXT_RE =
  /\b(advertisement|edition world|live tv|podcast|logout|sign in|subscribe|watch live|latest news india|latest cricket news|sports news:|economic times\.com|et\s*now)\b/i;
const LISTING_TITLE_RE =
  /\b(latest india news|breaking news headlines|latest news headlines|market news|stock market news|economy news|share market today|bse\/nse live|stock market live|live updates?|sports news[,:\s]|live cricket score|india news today|news today|breaking headlines|latest updates?\s*&|top stories today)\b/i;
/** Section fronts / hub pages: "India News Today – Breaking Headlines, Latest Updates & …" */
const AGGREGATOR_HUB_TITLE_RE =
  /\b(india news today|news today)\b.*\b(breaking headlines|latest updates?|top (?:headlines|stories)|live updates?)\b/i;
const GENERIC_PHRASE_IN_TITLE =
  /\b(breaking headlines|latest updates?|top headlines|top stories|live updates?|news today|india news today|headlines today)\b/gi;
/** Site nav / section index blobs scraped as descriptions (e.g. Tribune section menus). */
const NAV_SECTION_NAMES_RE =
  /\b(explainers|simply punjab|simply haryana|the great game|upsc|news desk)\b/gi;
const NOISY_DESC_RE =
  /(?:\b(?:news|sports|business|science|city|india|politics|technology|finance|health|environment)\b\s*[›>|/:-]\s*){2,}|\b(news desk|curated by|published at|trending comments|text size|trusted source)\b|^\d+\s*%/i;
const INVESTMENT_BOILERPLATE_RE =
  /\b(midcap|smallcap|largecap|fund\s*direct\s*growth\d*\s*y?|direct\s*growth\d*\s*y?|return\d+|invest\s*now|motilal\s*oswal|benchmarks?|nifty|sensex|bank\s*nifty)\b/i;
const PROMO_NOISE_RE =
  /\b(genz\s*speak\s*up|speak\s*up|read\s*more|watch\s*now|click\s*here|advertorial)\b/i;
const HOMEPAGE_PATHS = new Set([
  '/',
  '/home',
  '/news',
  '/headlines',
  '/latest-news',
  '/india-news',
  '/news/headlines',
  '/news/india',
  '/india',
  '/topic',
  '/topics',
  '/section',
  '/sections',
]);

/** Shallow publisher paths that are section fronts, not articles (no numeric story id). */
const SHALLOW_SECTION_SLUGS = new Set([
  'india', 'world', 'sports', 'politics', 'business', 'markets', 'market',
  'economy', 'tech', 'technology', 'entertainment', 'city', 'cities',
  'national', 'international', 'latest-news', 'headlines', 'news',
  'india-news', 'top-news', 'breaking-news', 'live-updates',
]);

function countGenericPhrasesInTitle(title: string): number {
  const matches = title.match(GENERIC_PHRASE_IN_TITLE);
  return matches ? matches.length : 0;
}

function isShallowNewsSectionUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = (u.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
    if (HOMEPAGE_PATHS.has(path)) return true;

    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return true;

    const hasArticleId = extractArticleId(url) !== null || /\d{6,}/.test(path);
    if (hasArticleId) return false;

    // /news, /news/india, /news/sports — hub pages
    if (segments[0] === 'news' && segments.length <= 2) return true;
    if (segments[0] === 'news' && segments.length === 3 && SHALLOW_SECTION_SLUGS.has(segments[2])) {
      return true;
    }

    const last = segments[segments.length - 1];
    if (segments.length <= 2 && SHALLOW_SECTION_SLUGS.has(last)) return true;

    // Economic Times / similar: no articleshow id and very short path → section front
    const host = u.hostname.replace(/^www\./, '');
    if (
      (host.includes('economictimes') || host.includes('indiatimes.com')) &&
      !path.includes('articleshow') &&
      segments.length <= 3
    ) {
      return true;
    }

    if (
      path.includes('/headlines') ||
      path.endsWith('/latest-news') ||
      path.endsWith('/india-news') ||
      path.includes('/live-news') ||
      path.includes('/live-blog') ||
      path.includes('live-blog')
    ) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

function isAggregatorHubTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (AGGREGATOR_HUB_TITLE_RE.test(t)) return true;
  // Two+ generic nav phrases = site section front, not a story
  if (countGenericPhrasesInTitle(t) >= 2) return true;
  // "Foo – Breaking Headlines, Latest Updates & Top …"
  if (/\s[–—-]\s/.test(t) && countGenericPhrasesInTitle(t) >= 1 && t.length < 140) return true;
  return false;
}

function isNavMenuDescription(description: string): boolean {
  const d = description.trim();
  if (!d) return false;
  const navHits = (d.match(NAV_SECTION_NAMES_RE) || []).length;
  if (navHits >= 2) return true;
  // Short blob listing many sections with no sentence punctuation
  if (navHits >= 1 && d.length < 200 && !/[.!?]/.test(d) && d.split(/\s+/).length >= 6) return true;
  return false;
}

function isLikelyJunkNewsItem(title: string, description: string, url: string): boolean {
  const t = title.trim().toLowerCase();
  const d = description.trim().toLowerCase();

  let path = '';
  try {
    const u = new URL(url);
    path = (u.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    return true;
  }

  const homepageLike = HOMEPAGE_PATHS.has(path);
  const hasArticleId = extractArticleId(url) !== null || /\d{6,}/.test(path);
  const segments = path.split('/').filter(Boolean);
  const sectionLikePath = segments.length <= 3 && !hasArticleId;
  const shallowSectionUrl = isShallowNewsSectionUrl(url);
  const aggregatorHub = isAggregatorHubTitle(title);
  const genericHeadline = GENERIC_HEADLINE_RE.test(t);
  const junkText = JUNK_TEXT_RE.test(`${t} ${d}`);
  const listingTitle = LISTING_TITLE_RE.test(t);
  const listingHeadline = /\b(latest cricket news|sports news[:\s,]|ipl news, football|live cricket score)\b/i.test(t);
  const navMenuDesc = isNavMenuDescription(d);
  const lowSignalUrl =
    path.includes('/headlines') ||
    path.endsWith('/latest-news') ||
    path.endsWith('/india-news') ||
    path.includes('/live-news') ||
    path.includes('/live-blog') ||
    path.includes('live-blog');

  // Strongly reject obvious junk/homepage/aggregator cards (section fronts, ads).
  if (junkText) return true;
  if (aggregatorHub) return true;
  if (listingHeadline) return true;
  if (navMenuDesc) return true;
  if (shallowSectionUrl && (aggregatorHub || genericHeadline || listingTitle || countGenericPhrasesInTitle(t) >= 1)) {
    return true;
  }
  if (shallowSectionUrl && !hasArticleId && d.length < 80) return true;
  if (genericHeadline && !hasArticleId) return true;
  if (genericHeadline && navMenuDesc) return true;
  if (listingTitle && sectionLikePath) return true;
  if (listingTitle && !hasArticleId && d.length < 160) return true;
  if (homepageLike) return true;
  if (genericHeadline && lowSignalUrl) return true;
  if (homepageLike && d.length < 50) return true;

  return false;
}

/**
 * Strip scraped-page junk out of an Exa `text` blob: "Skip to content", repeated
 * site nav, markdown noise, hash markers, copyright lines, URLs, "Subscribe"
 * boilerplate. Keep only the first 1-2 readable sentences.
 */
const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'news', 'live', 'today', 'latest',
  'india', 'indian', 'says', 'after', 'over', 'into', 'about', 'help', 'power', 'series',
]);

function normalizeArticleUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function extractArticleId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const m =
      path.match(/articleshow\/(\d+)/i) ||
      path.match(/\/story\/[^/]+-(\d{6,})/i) ||
      path.match(/-(\d{6,})(?:\.cms|\/|$)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function storyTokens(title: string): Set<string> {
  const normalized = title
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC'']/g, '')
    .replace(/\b(five-for|five for|5-23|5\/23|unbeaten)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized
    .split(' ')
    .filter((w) => (w.length > 2 && !TITLE_STOPWORDS.has(w)) || /^\d+$/.test(w));
  return new Set(tokens);
}

function isSameStory(titleA: string, titleB: string): boolean {
  const a = storyTokens(titleA);
  const b = storyTokens(titleB);
  if (a.size === 0 || b.size === 0) return false;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  if (overlap < 3) return false;
  const minSize = Math.min(a.size, b.size);
  const union = a.size + b.size - overlap;
  const minRatio = overlap / minSize;
  const jaccard = overlap / union;
  return minRatio >= 0.4 || (jaccard >= 0.28 && overlap >= 4);
}

function cleanDescription(raw: string, title: string): string {
  if (!raw) return '';
  let text = raw
    .replace(/skip to (main )?content/gi, '')
    .replace(/skip to navigation/gi, '')
    .replace(/^|\s+#{1,6}\s.*?(?=\.|\n|$)/g, ' ') // markdown headings
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[#*_`~]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')                // URLs
    .replace(/\b(subscribe|sign in|sign up|log in|menu|home\b|search\b)\b[^.]*?\.?/gi, ' ')
    .replace(/\b(follow|share|copy link|read more|continue reading)\b[^.]*?\.?/gi, ' ')
    .replace(/\b(featured funds?|direct[-\s]?growth|motilal oswal|rating|star rating|edition in english)\b[^.]*?\.?/gi, ' ')
    .replace(/^(?:\s*(?:edition in english|news|sports news|cricket news|business news|city news|education today)\s*[-–|/>]\s*)+/gi, '')
    .replace(/\bauthor:\s*[^.\n]+[.\n]?/gi, ' ')
    .replace(/★+/g, ' ')
    .replace(/©\s?\d{4}.*$/gm, ' ')                  // copyright
    .replace(/published:?\s*\d{4}-\d{2}-\d{2}[\sT:0-9+:Z-]*/gi, ' ') // datestamps
    .replace(/source:?\s*[\w.-]+/gi, ' ')
    .replace(/\b(midcap|smallcap|largecap|fund\s*direct\s*growth\d*\s*y?|direct\s*growth\d*\s*y?|return\s*\d+|return\d+|invest\s*now|on camera|society\s*&\s*culture|add\s+theprint\s+as\s+a\s+trusted\s+source|motilal\s*oswal|benchmarks?|nifty|sensex|bank\s*nifty)\b/gi, ' ')
    .replace(/^\s*\d+\s*%\s*/g, ' ')
    .replace(/\b(?:news|sports|business|science|city|india|politics|technology|finance|health|environment)\s*[›>]\s*/gi, ' ')
    .replace(/\b(news|sports|business|science|city|education)\s*(?:>|\||\/|-)\s*(news|sports|business|science|city|education)\b/gi, ' ')
    .replace(/\b(news desk|curated by|published at|trending comments|text size)\b[^.]*\.?/gi, ' ')
    .replace(/\([^)]*(?:\.com|\.in|business\s+standard|times\s+of\s+india|theprint)[^)]*\)/gi, ' ')
    .replace(/[\s ]+/g, ' ')                    // collapse whitespace
    .trim();
  // Remove repeated title from the start of description
  if (title) {
    const t = title.trim();
    if (text.toLowerCase().startsWith(t.toLowerCase())) {
      text = text.slice(t.length).replace(/^[\s\-—–|:.,]+/, '');
    }
  }
  const fragments = text
    .split(/[.!?\n]|\s[|>]\s|\s-\s/g)
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !/^(news|sports|business|science|city|education|com)$/i.test(f))
    .filter((f) => !/\b(midcap|fund\s*direct\s*growth\d*\s*y?|direct\s*growth\d*\s*y?|invest\s*now|trusted\s+source|edition\s+in\s+english|motilal\s*oswal|benchmarks?|nifty|sensex)\b/i.test(f))
    .filter((f) => !NOISY_DESC_RE.test(f))
    .filter((f) => !PROMO_NOISE_RE.test(f));

  const best = fragments.find((f) => {
    const words = f.split(/\s+/).filter((w) => w.length > 1);
    return words.length >= 6;
  }) || fragments[0] || text;

  const out = best
    .replace(/[|•]/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/[\s ]+/g, ' ')
    .trim();

  if (!out || out.length < 24 || NOISY_DESC_RE.test(out) || INVESTMENT_BOILERPLATE_RE.test(out) || PROMO_NOISE_RE.test(out)) return '';
  return out.length > 200 ? out.slice(0, 197) + '…' : out;
}

// In-memory "last-known-good" backup per country (no TTL). Persists across the
// L2 window so even if World News fails for a stretch, we keep serving the last
// real headlines we successfully fetched.
const NEWS_LAST_GOOD = new Map<string, DiscoverItem[]>();
// Per-category last-known-good — key `${country}:${category}` (e.g. "IN:Technology").
// Lets one transient World News miss on a category NOT empty out that tab.
const NEWS_CATEGORY_LAST_GOOD = new Map<string, DiscoverItem[]>();
const LAST_GOOD_REDIS_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/** Fetch live news for one country. Tries: L1 → L2 → fresh fetch → last-known-good.
 *  When `forceRefresh` is true, bypasses BOTH cache layers and re-queries upstream. */
export async function getLiveNewsForCountry(
  country: string,
  limit = 8,
  forceRefresh = false
): Promise<DiscoverItem[]> {
  const code = country.toUpperCase();
  const cycle = newsRefreshCycle(code);
  const l1Key = `${code}:${cycle}`;
  const l2Key = `news:${NEWS_CACHE_VERSION}:${code}:${cycle}`;

  if (!forceRefresh) {
    // L1 (60s)
    const cached = NEWS_L1.get(l1Key);
    if (cached && Date.now() - cached.ts < NEWS_L1_TTL_MS) return cached.items;

    // L2 fresh (Redis, 30 min) — rotated by local 06:00 cycle.
    const l2 = await redisGetJSON<DiscoverItem[]>(l2Key);
    if (l2 && l2.length) {
      NEWS_L1.set(l1Key, { items: l2, ts: Date.now() });
      return l2;
    }
  } else {
    console.log(`🔁 News force-refresh for ${code} — bypassing L1/L2 cache.`);
    NEWS_L1.delete(l1Key);
  }

  // Live fetch — World News API only, tuned for Reporter plan:
  // 500 pts/day, 2 req/s, 5 concurrent. Filters unchanged.
  const isWorldwide = code === 'WW';
  const worldNewsKey = getApiKey('worldnews');
  let items: DiscoverItem[] = [];

  const PER_CAT_TARGET = WN_RESULTS_PER_REQUEST;
  const PER_CAT_CAP = WN_RESULTS_PER_REQUEST;
  const MIN_PER_CAT = 20;
  const topics: Array<{
    q: string;
    cat: string;
    tag: string;
    n: number;
    categories?: string;
    text?: string;
  }> = [
    // Prioritize previously empty sections first so 429/budget cuts don't starve them.
    { q: '', cat: 'For You', tag: 'News', n: PER_CAT_TARGET },
    { q: '', cat: 'Science', tag: 'Science', n: PER_CAT_TARGET, categories: 'science' },
    { q: '', cat: 'Environment', tag: 'Environment', n: PER_CAT_TARGET, categories: 'environment' },
    { q: '', cat: 'Finance', tag: 'Finance', n: PER_CAT_TARGET, categories: 'business' },
    { q: '', cat: 'Politics', tag: 'Politics', n: PER_CAT_TARGET, categories: 'politics' },
    { q: '', cat: 'Technology', tag: 'Tech', n: PER_CAT_TARGET, categories: 'technology' },
    { q: '', cat: 'Health', tag: 'Health', n: PER_CAT_TARGET, categories: 'health' },
    { q: '', cat: 'Psychology', tag: 'Health', n: PER_CAT_TARGET, text: 'psychology mental health wellbeing therapy' },
    { q: '', cat: 'Sports', tag: 'Sports', n: PER_CAT_TARGET, categories: 'sports' },
  ];

  const categoryBuckets: DiscoverItem[][] = [];

  // Sequential per-topic searches; worldNewsFetch enforces 2 rps / concurrency.
  // Skip top-news by default (extra points) — only when budget is healthy.
  if (worldNewsKey) {
    const pointsLeft = WN_DAILY_POINT_BUDGET - (await getWorldNewsPointsUsed());
    console.log(`📰 World News fetch ${code} (Reporter) — ~${pointsLeft.toFixed(0)} pts left today`);

    for (const t of topics) {
      // Stop early if budget is nearly gone — keep last-good for remaining cats.
      if (!(await canSpendWorldNewsPoints(estimateSearchPoints(WN_RESULTS_PER_REQUEST)))) {
        console.warn(`⚠️ Stopping ${code} topic fetch early — daily point budget nearly used`);
        break;
      }

      // Important: when `categories` is set, do NOT also pass `text` — World News
      // ANDs filters, which was starving Science/Environment/Finance down to 0–2 items.
      const searchOpts = {
        categories: t.categories,
        text: t.categories
          ? undefined
          : (t.text || (t.cat === 'For You' ? 'news' : undefined)),
        forceCategory: t.cat,
        forceTag: t.tag,
      };

      let fresh = await fetchWorldNewsSearch(code, worldNewsKey, WN_RESULTS_PER_REQUEST, searchOpts);

      // Optional top-news boost for For You only when we still have >150 pts left.
      if (t.cat === 'For You' && !isWorldwide && pointsLeft > 150) {
        const top = await fetchWorldNewsTop(code, worldNewsKey, WN_RESULTS_PER_REQUEST);
        if (top.length) {
          const seen = new Set(fresh.map((i) => i.url).filter(Boolean));
          for (const item of top) {
            if (item.url && seen.has(item.url)) continue;
            if (item.url) seen.add(item.url);
            fresh.push({ ...item, category: 'For You', tag: item.tag || 'News' });
          }
        }
      }

      // Keep API category results — only drop missing images / junk.
      // No keyword re-filter (that was emptying Science/Env/Finance).
      fresh = stampFetchedAt(
        fresh
          .filter((it) => isRealArticleImage(it.image))
          .filter((it) => !isLikelyJunkNewsItem(it.title, it.description || '', it.url || ''))
          .map((it) => ({ ...it, category: t.cat, tag: t.tag || it.tag }))
          .slice(0, t.n)
      );
      // Psychology has no API category — light keyword keep so the tab stays on-topic.
      if (t.cat === 'Psychology') {
        fresh = fresh.filter((it) =>
          matchesDiscoverCategory(it.title, it.description || '', 'Psychology')
        );
      }
      if (fresh.length > 0) {
        const lgKey = `${code}:${t.cat}`;
        const existing = pruneStaleNews(NEWS_CATEGORY_LAST_GOOD.get(lgKey) || [], NEWS_MAX_AGE_MS);
        const merged = [...existing];
        const seen = new Set(existing.map((i) => i.url).filter(Boolean));
        for (const item of fresh) {
          if (item.url && seen.has(item.url)) continue;
          if (item.url) seen.add(item.url);
          merged.push(item);
        }
        // On refresh: drop oldest ~2–3 days from the rolling week.
        const pruned = pruneStaleNews(merged, NEWS_KEEP_ON_REFRESH_MS).slice(0, PER_CAT_CAP * 2);
        NEWS_CATEGORY_LAST_GOOD.set(lgKey, pruned);
        void redisSetJSON(`news:lastgood-cat:${lgKey}`, pruned, LAST_GOOD_REDIS_TTL_SEC);
        categoryBuckets.push(fresh);
        console.log(`✅ ${code} ${t.cat}: ${fresh.length} items from World News`);
      } else {
        console.warn(`⚠️ ${code} ${t.cat}: 0 items after image/junk filter`);
      }
    }
  } else {
    console.warn(`⚠️ World News API key missing — cannot fetch live news for ${code}`);
  }

  // ── 3) Merge + dedupe + real-image filter + per-category caps ──
  if (categoryBuckets.length > 0) {
    const collected: DiscoverItem[] = [];
    const seenUrlsByCat = new Map<string, Set<string>>();
    const seenNormUrlsByCat = new Map<string, Set<string>>();
    const seenArticleIdsByCat = new Map<string, Set<string>>();
    const seenIds = new Set<string>();
    const seenTitlesByCat = new Map<string, DiscoverItem[]>();
    const perCatCount = new Map<string, number>();
    let dupSuffix = 0;

    for (const bucket of categoryBuckets) {
      for (const it of bucket) {
        if (!isRealArticleImage(it.image)) continue;
        const cat = (it.category || 'For You').toString();
        if ((perCatCount.get(cat) || 0) >= PER_CAT_CAP) continue;
        const urlKey = (it.url || '').trim();
        const normUrl = urlKey ? normalizeArticleUrl(urlKey) : '';
        const articleId = urlKey ? extractArticleId(urlKey) : null;

        const catUrls = seenUrlsByCat.get(cat) || new Set<string>();
        const catNormUrls = seenNormUrlsByCat.get(cat) || new Set<string>();
        const catArticleIds = seenArticleIdsByCat.get(cat) || new Set<string>();
        if (urlKey && catUrls.has(urlKey)) continue;
        if (normUrl && catNormUrls.has(normUrl)) continue;
        if (articleId && catArticleIds.has(articleId)) continue;

        const catTitles = seenTitlesByCat.get(cat) || [];
        if (catTitles.some((prev) => isSameStory(it.title, prev.title))) continue;

        if (seenIds.has(it.id)) {
          it.id = `${it.id}-${++dupSuffix}`;
        }
        if (urlKey) catUrls.add(urlKey);
        if (normUrl) catNormUrls.add(normUrl);
        if (articleId) catArticleIds.add(articleId);
        seenUrlsByCat.set(cat, catUrls);
        seenNormUrlsByCat.set(cat, catNormUrls);
        seenArticleIdsByCat.set(cat, catArticleIds);
        seenIds.add(it.id);
        catTitles.push(it);
        seenTitlesByCat.set(cat, catTitles);
        perCatCount.set(cat, (perCatCount.get(cat) || 0) + 1);
        collected.push(it);
      }
    }

    // Soft top-up from same-category last-good only (never cross-category).
    for (const t of topics) {
      if (t.cat === 'For You') continue;
      const have = perCatCount.get(t.cat) || 0;
      if (have >= MIN_PER_CAT) continue;
      const lgKey = `${code}:${t.cat}`;
      let donors = pruneStaleNews(
        (NEWS_CATEGORY_LAST_GOOD.get(lgKey) || []).filter((it) => isRealArticleImage(it.image)),
        NEWS_MAX_AGE_MS
      );
      if (donors.length === 0) {
        const redisGood = await redisGetJSON<DiscoverItem[]>(`news:lastgood-cat:${lgKey}`);
        donors = pruneStaleNews(
          (redisGood || []).filter((it) => isRealArticleImage(it.image)),
          NEWS_MAX_AGE_MS
        );
      }
      const targetCatUrls = seenUrlsByCat.get(t.cat) || new Set<string>();
      const catTitles = seenTitlesByCat.get(t.cat) || [];
      let added = 0;
      for (const di of donors) {
        if ((perCatCount.get(t.cat) || 0) >= MIN_PER_CAT) break;
        if (di.url && targetCatUrls.has(di.url)) continue;
        if (catTitles.some((prev) => isSameStory(di.title, prev.title))) continue;
        const copy: DiscoverItem = {
          ...di,
          category: t.cat,
          id: `${di.id}-lg-${++dupSuffix}`,
          fetchedAt: di.fetchedAt || Date.now(),
        };
        if (di.url) targetCatUrls.add(di.url);
        seenUrlsByCat.set(t.cat, targetCatUrls);
        catTitles.push(copy);
        seenTitlesByCat.set(t.cat, catTitles);
        collected.push(copy);
        perCatCount.set(t.cat, (perCatCount.get(t.cat) || 0) + 1);
        added++;
      }
      if (added > 0) {
        console.log(`📥 ${code} ${t.cat}: topped up ${added} from same-category last-good`);
      }
    }

    items = pruneStaleNews(
      collected.filter(
        (it) =>
          isRealArticleImage(it.image) &&
          !isLikelyJunkNewsItem(it.title, it.description || '', it.url || '')
      ),
      NEWS_KEEP_ON_REFRESH_MS
    );
  }

  // Never serve placeholder SVG cards / news older than 7 days.
  items = pruneStaleNews(
    items.filter((it) => isRealArticleImage(it.image)),
    NEWS_MAX_AGE_MS
  );

  if (items.length > 0) {
    NEWS_L1.set(l1Key, { items, ts: Date.now() });
    void redisSetJSON(l2Key, items, NEWS_L2_TTL_SEC);
    NEWS_LAST_GOOD.set(code, items);
    void redisSetJSON(`news:lastgood:${NEWS_CACHE_VERSION}:${code}`, items, LAST_GOOD_REDIS_TTL_SEC);
    return items;
  }

  // Live fetch returned 0. Try the "last known good" backup (memory → Redis).
  const memGood = pruneStaleNews(
    (NEWS_LAST_GOOD.get(code) || []).filter((it) => isRealArticleImage(it.image)),
    NEWS_MAX_AGE_MS
  );
  if (memGood.length) {
    console.warn(`⚠️ live news ${code} returned 0 — serving last-known-good (memory).`);
    return memGood;
  }
  const redisGood = await redisGetJSON<DiscoverItem[]>(`news:lastgood:${NEWS_CACHE_VERSION}:${code}`);
  const redisFiltered = pruneStaleNews(
    (redisGood || []).filter((it) => isRealArticleImage(it.image)),
    NEWS_MAX_AGE_MS
  );
  if (redisFiltered.length) {
    console.warn(`⚠️ live news ${code} returned 0 — serving last-known-good (Redis).`);
    NEWS_LAST_GOOD.set(code, redisFiltered);
    return redisFiltered;
  }

  return [];
}

// ── Article image enrichment ───────────────────────────────────────────────
//
// Goal: every Discover card shows an image RELATED to the article — not a
// random Unsplash photo from the topical pool. Strategy in priority order:
//
//   1. Exa's own `item.image` if it returned one (already in place upstream).
//   2. Scrape the article URL's <meta og:image> / <meta twitter:image>.
//      Cheap (1-2s per article, parallelisable), works for ~80% of news
//      sites that publish OpenGraph metadata. Cached by URL hash.
//   3. Topical Unsplash pool fallback (the existing behaviour). Generic
//      but immediate, so the UI never shows a broken card.
//   4. LLM image generation via the existing imageGeneration chain
//      (Nano Banana / Gemini → gpt-image-1 → Grok Imagine). Slow (15-25s)
//      and costs API credits, so we ONLY do this in a background refresh
//      pass when the user-visible request has already returned with the
//      Unsplash fallback. Generated images are cached for 7 days.
//
// All resolved image URLs are stored in Redis under `discover-img:<urlhash>`
// so subsequent Discover refreshes skip the work for articles we've already
// resolved. Cache TTL: 7 days (news cycles past these articles long before).

const DISCOVER_IMG_TTL_SEC = 7 * 24 * 3600;
const OG_FETCH_TIMEOUT_MS = 3500;

function discoverImageCacheKey(articleUrl: string): string {
  let h = 0;
  for (let i = 0; i < articleUrl.length; i++) h = (h * 31 + articleUrl.charCodeAt(i)) | 0;
  return `discover-img:${Math.abs(h).toString(36)}`;
}

/** Extract og:image / twitter:image from a page's <head> with a tight timeout. */
async function scrapeOgImage(articleUrl: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), OG_FETCH_TIMEOUT_MS);
    const res = await fetch(articleUrl, {
      method: 'GET',
      // News sites often serve different HTML to bots — pretend to be a
      // browser so we get the canonical OpenGraph block.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SyntraIQ-Discover/1.0)' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    // We only need the <head>. Stream up to ~50KB which always covers it
    // for news sites; abort early to keep memory bounded.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder('utf-8');
    let html = '';
    const CAP = 50_000;
    while (html.length < CAP) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      // Stop early once we've seen </head>.
      if (html.includes('</head>')) break;
    }
    try { reader.cancel(); } catch { /* ignore */ }

    // Prefer og:image, then twitter:image, then a high-quality image_src link.
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
    const raw = ogMatch?.[1];
    if (!raw) return null;
    // Absolute URLs only — relative refs would 404 when loaded by the browser.
    try {
      const u = new URL(raw, articleUrl);
      // Skip obvious tracking-pixel sized placeholders.
      if (/\b1x1\b|spacer\.gif|blank\.png/i.test(u.toString())) return null;
      return u.toString();
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Resolve a real image URL for an article. Reads cache first; on miss, scrapes
 * og:image with a tight timeout. Returns null when scraping yields nothing —
 * caller is expected to fall back to the topical Unsplash pool (which the
 * normalisation pipeline already populates as `item.image`).
 */
async function resolveArticleImage(articleUrl: string): Promise<string | null> {
  if (!articleUrl) return null;
  const key = discoverImageCacheKey(articleUrl);
  const cached = await redisGetJSON<{ image: string | null; resolvedAt: number }>(key);
  if (cached) return cached.image; // could be null too — we cache misses to skip retries

  const scraped = await scrapeOgImage(articleUrl);
  // Cache both hits and misses so we don't re-scrape every refresh.
  void redisSetJSON(key, { image: scraped, resolvedAt: Date.now() }, DISCOVER_IMG_TTL_SEC);
  return scraped;
}

/**
 * Enrich a batch of Discover items with real article images. Each item that
 * looks like it currently uses the topical Unsplash fallback gets a
 * per-article scrape attempt. We do this in parallel with a hard concurrency
 * cap so a slow news site can't stall the whole batch.
 */
async function enrichDiscoverImages(items: DiscoverItem[]): Promise<void> {
  const CONCURRENCY = 6;
  // Treat data:image/svg URLs (our generated category-card fallback) AND
  // any legacy images.unsplash.com URLs still cached on older deployments
  // as "fallback only — try harder to find the real article image".
  // Real article images live on publisher CDNs (cdn.ndtv.com, hindustantimes.com, etc.).
  const isFallbackImage = (url: string) =>
    !isRealArticleImage(url) || url.startsWith('data:image/') || /images\.unsplash\.com/i.test(url);
  const queue: DiscoverItem[] = items.filter(
    (it) => (it as any).url && (!it.image || isFallbackImage(it.image)),
  );

  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const i = cursor++;
      const it = queue[i];
      const articleUrl = (it as any).url as string;
      const resolved = await resolveArticleImage(articleUrl);
      if (resolved && isRealArticleImage(resolved)) {
        it.image = resolved;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/**
 * Global dedupe across nations/categories: same URL or near-identical title
 * only appears once. Prefer local (non-WW) stories over worldwide copies.
 */
function dedupeDiscoverItems(items: DiscoverItem[]): DiscoverItem[] {
  const sorted = [...items].sort((a, b) => {
    const aWw = a.nationCode === 'WW' ? 1 : 0;
    const bWw = b.nationCode === 'WW' ? 1 : 0;
    return aWw - bWw;
  });
  const seenUrls = new Set<string>();
  const seenNormUrls = new Set<string>();
  const seenArticleIds = new Set<string>();
  const seenTitles: string[] = [];
  const out: DiscoverItem[] = [];

  for (const it of sorted) {
    const urlKey = (it.url || '').trim();
    const normUrl = urlKey ? normalizeArticleUrl(urlKey) : '';
    const articleId = urlKey ? extractArticleId(urlKey) : null;
    if (urlKey && seenUrls.has(urlKey)) continue;
    if (normUrl && seenNormUrls.has(normUrl)) continue;
    if (articleId && seenArticleIds.has(articleId)) continue;
    if (seenTitles.some((prev) => isSameStory(it.title, prev))) continue;

    if (urlKey) seenUrls.add(urlKey);
    if (normUrl) seenNormUrls.add(normUrl);
    if (articleId) seenArticleIds.add(articleId);
    seenTitles.push(it.title);
    out.push(it);
  }
  return out;
}

/** Fetch live news for multiple countries. Always includes WW (worldwide).
 *  Countries run sequentially so we stay under Reporter 2 rps / 5 concurrent. */
export async function getLiveNews(countries: string[], perCountry = 8, forceRefresh = false): Promise<DiscoverItem[]> {
  const ordered: string[] = [];
  for (const c of countries) {
    const code = c.toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && !ordered.includes(code)) ordered.push(code);
  }
  if (!ordered.includes('WW')) ordered.push('WW');

  const out: DiscoverItem[] = [];
  for (const c of ordered) {
    try {
      const items = await getLiveNewsForCountry(c, perCountry, forceRefresh);
      out.push(...items);
    } catch (err) {
      console.warn(`getLiveNewsForCountry(${c}) failed:`, err instanceof Error ? err.message : err);
    }
  }
  // Drop placeholders / stale items, then global-dedupe (IN vs WW copies, syndication).
  const withRealImages = dedupeDiscoverItems(
    pruneStaleNews(
      out.filter((it) => isRealArticleImage(it.image)),
      NEWS_MAX_AGE_MS
    )
  );

  // Best-effort image enrichment — runs asynchronously in the background so it
  // never blocks the response. Once finished, L1 and L2 caches are updated
  // with ONLY items that still have real images.
  if (withRealImages.length > 0) {
    enrichDiscoverImages(withRealImages).then(async () => {
      console.log('🖼️ Background image enrichment completed. Writing to Redis...');
      for (const country of ordered) {
        const code = country.toUpperCase();
        const cycle = newsRefreshCycle(code);
        const l1Key = `${code}:${cycle}`;
        const l2Key = `news:${NEWS_CACHE_VERSION}:${code}:${cycle}`;

        const countryItems = pruneStaleNews(
          withRealImages.filter(
            (it) =>
              isRealArticleImage(it.image) &&
              (it.nationCode === code || it.id.startsWith(`news-${code.toLowerCase()}`))
          ),
          NEWS_MAX_AGE_MS
        );
        if (countryItems.length > 0) {
          NEWS_L1.set(l1Key, { items: countryItems, ts: Date.now() });
          await redisSetJSON(l2Key, countryItems, NEWS_L2_TTL_SEC);
          NEWS_LAST_GOOD.set(code, countryItems);
          await redisSetJSON(`news:lastgood:${NEWS_CACHE_VERSION}:${code}`, countryItems, LAST_GOOD_REDIS_TTL_SEC);
        }
      }
    }).catch((e) => {
      console.warn('Background discover image enrichment failed:', e instanceof Error ? e.message : e);
    });
  }
  return withRealImages;
}