import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DiscoverItem } from '../types.js';
import { getApiKey } from './apiKeys.js';
import { redisGetJSON, redisSetJSON } from '../lib/redis.js';

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
  { keys: /\b(space|nasa|isro|spacex|rocket|satellite|astronaut|mars|moon|science|scientist|scientific|research|researchers|study|studies|discovery|biology|chemistry|physics|genome|dna|telescope)\b/i, tag: 'Science' },
  // Environment
  { keys: /\b(climate|climate change|warming|emissions|renewable|solar power|wind power|environment|environmental|carbon|sustainability|sustainable|pollution|wildlife|biodiversity|forest|reforestation|cyclone|flood|earthquake|wildfire|heatwave)\b/i, tag: 'Environment' },
  // Tech (strict word boundaries; explicitly NOT "ai" because of "Mumbai" etc.)
  { keys: /\b(artificial intelligence|machine learning|deep learning|generative ai|llm|gpt|chatgpt|openai|anthropic|nvidia|gpu|tech|technology|startup|startups|software|hardware|chip|chipset|semiconductor|gadget|smartphone|iphone|android|laptop|app launch|app update|cloud|saas|crypto|blockchain|metaverse|robot|robotics|drone|cybersecurity|hack|hacker|hacked|data breach)\b/i, tag: 'Tech' },
  // Finance (only specific finance terms, not bare "bank")
  { keys: /\b(stock market|sensex|nifty|dow|nasdaq|s&p|economy|economic|inflation|interest rate|interest rates|rupee|dollar|gdp|federal reserve|rbi|sec|ipo|earnings|revenue|profit|market cap|finance|financial|investor|investors|investing|investment|trading|trader|bond|treasury|recession|bull market|bear market|commodity|cryptocurrency|bitcoin|fund|funds|merger|acquisition|tariff|tariffs)\b/i, tag: 'Finance' },
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

// ── News cache (L1 in-memory + L2 Redis) ────────────────────────────────────
// L1 60s burst absorber; L2 Redis 30 min (shared across instances). Same
// pattern as SEARCH_CACHE in aiProviders.ts.
interface CacheEntry { items: DiscoverItem[]; ts: number; }
const NEWS_L1 = new Map<string, CacheEntry>();
const NEWS_L1_TTL_MS = 60 * 1000;
// 6 hours — Discover articles get rotated 4× per day (effectively at 06:00,
// 12:00, 18:00, 00:00 local). Previously 30 min, which was overkill for
// news that doesn't shift that fast and let the manual refresh button (now
// removed) hammer Exa/Gemini. The 6h cadence is the typical refresh window
// users expect from a news feed; combined with the daily cycle-key roll
// (06:00 local) the full SET of stories still turns over every morning.
const NEWS_L2_TTL_SEC = 6 * 60 * 60;
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
const NEWS_CACHE_VERSION = 'v11';

// Refresh-cycle timezone per country. Cycle changes daily at 06:00 local time.
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
  const localHour = localHourInTz(now, timeZone);
  // Before 06:00 local time, keep using previous day's cycle.
  const basis = localHour >= 6 ? now : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return formatYmdInTz(basis, timeZone);
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

// ── Country-specific news domain allowlists ────────────────────────────────
// Exa's news ranking is heavily biased toward Western publishers (BBC, Guardian,
// Reuters, etc.) — even when you ask for "technology news from India today",
// you get UK-published coverage of Indian topics. To force genuinely local news
// we pass `includeDomains` containing publishers from the user's country only.
// Falling back to no domain restriction if the country isn't in this list
// (so smaller countries still get results).
const COUNTRY_NEWS_DOMAINS: Record<string, string[]> = {
  IN: [
    'timesofindia.indiatimes.com', 'ndtv.com', 'indianexpress.com', 'thehindu.com',
    'hindustantimes.com', 'indiatoday.in', 'news18.com', 'thequint.com', 'theprint.in',
    'business-standard.com', 'livemint.com', 'economictimes.indiatimes.com',
    'moneycontrol.com', 'firstpost.com', 'scroll.in', 'thewire.in', 'mathrubhumi.com',
    'tribuneindia.com', 'deccanherald.com', 'newindianexpress.com', 'rediff.com',
    'zeebiz.com', 'cnbctv18.com', 'wionews.com', 'theweek.in', 'outlookindia.com',
    'dnaindia.com', 'oneindia.com', 'mid-day.com', 'asianetnews.com',
    'financialexpress.com', 'gadgets360.com', 'pib.gov.in', 'sportstar.thehindu.com',
    'espncricinfo.com', 'cricbuzz.com',
  ],
  US: [
    'nytimes.com', 'washingtonpost.com', 'cnn.com', 'foxnews.com', 'nbcnews.com',
    'cbsnews.com', 'abcnews.go.com', 'usatoday.com', 'wsj.com', 'bloomberg.com',
    'reuters.com', 'apnews.com', 'politico.com', 'theatlantic.com', 'newyorker.com',
    'forbes.com', 'businessinsider.com', 'axios.com', 'thehill.com', 'npr.org',
    'pbs.org', 'time.com', 'newsweek.com', 'vox.com', 'slate.com',
    'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
    'espn.com', 'cbssports.com',
  ],
  GB: [
    'bbc.co.uk', 'bbc.com', 'theguardian.com', 'telegraph.co.uk', 'thetimes.co.uk',
    'standard.co.uk', 'independent.co.uk', 'mirror.co.uk', 'dailymail.co.uk',
    'metro.co.uk', 'sky.com', 'ft.com', 'economist.com', 'spectator.co.uk',
    'newstatesman.com', 'thesun.co.uk', 'express.co.uk',
  ],
  CA: ['cbc.ca', 'theglobeandmail.com', 'nationalpost.com', 'thestar.com', 'ctvnews.ca', 'globalnews.ca', 'macleans.ca'],
  AU: ['abc.net.au', 'smh.com.au', 'theage.com.au', 'theaustralian.com.au', 'news.com.au', '9news.com.au', 'theguardian.com/au'],
  PK: ['dawn.com', 'thenews.com.pk', 'tribune.com.pk', 'geo.tv', 'arynews.tv', 'samaa.tv'],
  BD: ['thedailystar.net', 'prothomalo.com', 'bdnews24.com', 'dhakatribune.com'],
  AE: ['gulfnews.com', 'thenationalnews.com', 'khaleejtimes.com'],
  SG: ['straitstimes.com', 'channelnewsasia.com', 'todayonline.com'],
  JP: ['japantimes.co.jp', 'nhk.or.jp', 'asahi.com', 'mainichi.jp'],
  DE: ['spiegel.de', 'zeit.de', 'faz.net', 'sueddeutsche.de', 'welt.de', 'dw.com'],
  FR: ['lemonde.fr', 'lefigaro.fr', 'liberation.fr', 'francetvinfo.fr'],
};

// ── Exa news search (preferred — gives real URLs, images, publish dates) ────────
async function fetchExaNews(
  country: string,
  apiKey: string,
  limit: number,
  topicQuery?: string,
  forceCategory?: string,
  forceTag?: string,
  opts?: { strict?: boolean }
): Promise<DiscoverItem[]> {
  const label = countryLabel(country);
  const query = topicQuery
    ? `Latest ${topicQuery} news from ${label} today`
    : `Latest top news headlines from ${label} today`;
  const includeDomains = COUNTRY_NEWS_DOMAINS[country.toUpperCase()];
  // `strict: false` lets us widen the search when the strict pass (news-only +
  // domain allowlist) returns 0 results. Useful for sparse topics like Politics
  // where some publishers don't classify items under Exa's "news" category.
  const strict = opts?.strict !== false;
  try {
    const exaPayload: any = {
      query,
      type: 'auto',
      numResults: Math.min(limit, 25),
      useAutoprompt: true,
      startPublishedDate: new Date(Date.now() - (strict ? 3 : 7) * 24 * 60 * 60 * 1000).toISOString(),
      contents: { text: { maxCharacters: 400 }, highlights: true },
    };
    if (strict) {
      exaPayload.category = 'news';
    }
    if (includeDomains && includeDomains.length > 0) {
      exaPayload.includeDomains = includeDomains;
    }
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(exaPayload),
    });
    if (!response.ok) return [];
    const data: any = await response.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];

    return results
      .map((item, idx): DiscoverItem | null => {
        const title: string = typeof item?.title === 'string' ? item.title.trim() : '';
        const url: string = typeof item?.url === 'string' ? item.url : '';
        if (!title || !url) return null;
        const highlights = Array.isArray(item?.highlights) ? item.highlights.join(' ') : '';
        const text = typeof item?.text === 'string' ? item.text : '';
        const rawDescription = (highlights || text || title).trim();
        const description = cleanDescription(rawDescription, title);
        if (isLikelyJunkNewsItem(title, description, url)) return null;
        // Classify from headline only — nav crumbs in scraped text must not mis-tag (e.g. "Cricket" → Sports).
        const { image, tag: autoTag } = pickImageAndTag(title, title);
        // When a topic-specific fetch ("technology news") finds a story, trust the
        // topic over the keyword guess — the search itself already qualified it.
        const tag = forceTag || autoTag;
        let domain = '';
        try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
        return {
          id: `news-${country.toLowerCase()}-${forceCategory || tag}-${slugify(title) || idx}`,
          title,
          tag,
          image: typeof item?.image === 'string' && item.image ? item.image : image,
          alt: title,
          description,
          category: forceCategory || categoryFromTag(tag),
          nation: label,
          nationCode: country,
          // extra fields tolerated by the frontend DiscoverItem (passthrough)
          ...(url ? { url, sourceDomain: domain } : {}),
        } as DiscoverItem;
      })
      .filter((x): x is DiscoverItem => x !== null)
      .slice(0, limit);
  } catch (err) {
    console.warn(`Exa news fetch failed for ${country}:`, err);
    return [];
  }
}

/**
 * Robustly extract a JSON array from an LLM/grounding response that may include
 * markdown fences, prose before/after, or trailing junk. Tries: clean parse →
 * fence-stripped parse → first balanced [...] block → per-object salvage.
 */
function parseNewsJsonArray(text: string): any[] {
  if (!text) return [];
  let s = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  const tryParse = (str: string): any[] | null => {
    try { const v = JSON.parse(str); return Array.isArray(v) ? v : null; } catch { return null; }
  };

  // 1) Whole thing is already an array.
  let arr = tryParse(s);
  if (arr) return arr;

  // 2) First balanced [...] block (ignores brackets inside strings).
  const start = s.indexOf('[');
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === '[') depth++;
      else if (!inStr && ch === ']') {
        depth--;
        if (depth === 0) {
          arr = tryParse(s.slice(start, i + 1));
          if (arr) return arr;
          break;
        }
      }
    }
  }

  // 3) Salvage individual {...} objects.
  const objs: any[] = [];
  for (const m of s.matchAll(/\{[^{}]*\}/g)) {
    try { objs.push(JSON.parse(m[0])); } catch { /* skip */ }
  }
  return objs;
}

// ── Gemini grounding fallback (when no Exa key) ─────────────────────────────────
async function fetchGeminiNews(
  country: string,
  apiKey: string,
  limit: number,
  topicQuery?: string,
  forceCategory?: string,
  forceTag?: string
): Promise<DiscoverItem[]> {
  const label = countryLabel(country);
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      tools: [{ googleSearch: {} } as any],
    });
    const subject = topicQuery ? `${topicQuery} news` : 'top news headlines';
    const prompt = `List the top ${limit} most important real ${subject} from ${label} from the last 2 days.
Each item MUST be a specific news article with its own story — NOT a publisher homepage, section front, "breaking headlines" hub, "latest updates" landing page, live blog index, or category listing.
Reject titles like "India News Today – Breaking Headlines" or "Latest Updates & Top Stories".
Respond ONLY with a JSON array (no markdown, no code fences), each item:
{"title": "headline", "description": "1 sentence summary", "url": "source url", "topic": "Finance|Tech|Health|Science|Environment|Sports|Politics|News"}`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const arr = parseNewsJsonArray(raw);
    if (arr.length === 0) {
      console.warn(`Gemini news for ${country}${topicQuery ? '/' + topicQuery : ''}: no parseable items`);
      return [];
    }

    return arr
      .map((item, idx): DiscoverItem | null => {
        const title: string = typeof item?.title === 'string' ? item.title.trim() : '';
        if (!title) return null;
        const rawDescription: string = typeof item?.description === 'string' ? item.description.trim() : '';
        const description = cleanDescription(rawDescription, title);
        const url: string = typeof item?.url === 'string' ? item.url : '';
        if (!url || isLikelyJunkNewsItem(title, description, url)) return null;
        const { image, tag: autoTag } = pickImageAndTag(
          forceTag ? `${title} ${item?.topic || ''}` : title,
          title
        );
        const itemTopic = typeof item?.topic === 'string' && item.topic ? item.topic : '';
        const tag = forceTag || itemTopic || autoTag;
        return {
          id: `news-${country.toLowerCase()}-${forceCategory || tag}-${slugify(title) || idx}`,
          title,
          tag,
          image,
          alt: title,
          description: description.slice(0, 220),
          category: forceCategory || categoryFromTag(tag),
          nation: label,
          nationCode: country,
          ...(url ? { url } : {}),
        } as DiscoverItem;
      })
      .filter((x): x is DiscoverItem => x !== null)
      .slice(0, limit);
  } catch (err) {
    console.warn(`Gemini news fetch failed for ${country}${topicQuery ? '/' + topicQuery : ''}:`, err);
    return [];
  }
}

// In-memory "last-known-good" backup per country (no TTL). Persists across the
// 30-min L2 window so even if Exa AND Gemini both fail for a stretch, we keep
// serving the last real headlines we successfully fetched.
const NEWS_LAST_GOOD = new Map<string, DiscoverItem[]>();
// Per-category last-known-good — key `${country}:${category}` (e.g. "IN:Technology").
// Lets one transient Exa rate-limit on the "technology" query NOT empty out the
// whole Technology tab: we serve the previous successful response instead.
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

  // Live fetch (Exa first, Gemini fallback). To keep EVERY category tab populated
  // (Technology, Science, Health, Finance, Environment, Sports), we fan out into
  // topic-specific searches in parallel instead of one generic "top headlines"
  // query — that query historically returned mostly politics.
  const exaKey = getApiKey('exa');
  const geminiKey = getApiKey('gemini');
  let items: DiscoverItem[] = [];
  if (exaKey) {
    // Every category gets ≥12 items so no tab ever feels empty. Psychology
    // included via "mental health and psychology" since pure "psychology news"
    // is too sparse.
    // Target 10–15 stories per category. We request 15 from Exa so a couple
    // can be deduped without dropping the visible count below 10.
    const PER_CAT_TARGET = 15;
    const topics: Array<{ q: string; cat: string; tag: string; n: number }> = [
      { q: '',                                                  cat: 'For You',     tag: 'News',        n: PER_CAT_TARGET },
      { q: 'politics government parliament election minister',  cat: 'Politics',    tag: 'Politics',    n: PER_CAT_TARGET },
      { q: 'technology AI startup software',                    cat: 'Technology',  tag: 'Tech',        n: PER_CAT_TARGET },
      { q: 'science research discovery space',                  cat: 'Science',     tag: 'Science',     n: PER_CAT_TARGET },
      { q: 'mental health psychology wellbeing therapy',        cat: 'Psychology',  tag: 'Health',      n: PER_CAT_TARGET },
      { q: 'health medicine hospital vaccine',                  cat: 'Health',      tag: 'Health',      n: PER_CAT_TARGET },
      { q: 'environment climate pollution weather',             cat: 'Environment', tag: 'Environment', n: PER_CAT_TARGET },
      { q: 'business finance stock market economy',             cat: 'Finance',     tag: 'Finance',     n: PER_CAT_TARGET },
      { q: 'sports cricket football',                           cat: 'Sports',      tag: 'Sports',      n: PER_CAT_TARGET },
    ];
    // Per-category resolution order (each topic runs in parallel):
    //   1. Exa (fast, real URLs + images)
    //   2. Gemini grounding fallback (when Exa rate-limits THIS topic)
    //   3. Per-category last-known-good (in-memory)
    //   4. Per-category last-known-good (Redis, 7-day persistence)
    //   5. [] (only if nothing ever worked for this category)
    const settled = await Promise.allSettled(
      topics.map(async (t) => {
        const lgKey = `${code}:${t.cat}`;

        // Step 1: try Exa STRICT — news category + country domain allowlist.
        let fresh = await fetchExaNews(
          code, exaKey, t.n,
          t.q || undefined,
          t.q ? t.cat : undefined,
          t.q ? t.tag : undefined,
        );

        // Step 1b: if strict returned 0, widen — drop `category: 'news'` and
        // expand the time window. Common for Politics where some publishers
        // tag stories as "blog"/"opinion" instead of "news".
        if (fresh.length === 0) {
          fresh = await fetchExaNews(
            code, exaKey, t.n,
            t.q || undefined,
            t.q ? t.cat : undefined,
            t.q ? t.tag : undefined,
            { strict: false }
          );
          if (fresh.length > 0) {
            console.log(`🔓 ${code} ${t.cat}: widened Exa search (no news category) → ${fresh.length} items`);
          }
        }

        // Step 2: Exa still empty → try Gemini for THIS topic.
        if (fresh.length === 0 && geminiKey) {
          fresh = await fetchGeminiNews(code, geminiKey, t.n, t.q || undefined, t.q ? t.cat : undefined, t.q ? t.tag : undefined);
          if (fresh.length > 0) {
            console.log(`✅ ${code} ${t.cat}: Exa empty, Gemini fallback succeeded (${fresh.length} items)`);
          }
        }

        // Success → persist as per-category last-known-good and return.
        if (fresh.length > 0) {
          NEWS_CATEGORY_LAST_GOOD.set(lgKey, fresh);
          void redisSetJSON(`news:lastgood-cat:${lgKey}`, fresh, LAST_GOOD_REDIS_TTL_SEC);
          return fresh;
        }

        // Step 3 + 4: both providers failed → fall back to last good (memory → Redis).
        const memGood = NEWS_CATEGORY_LAST_GOOD.get(lgKey);
        if (memGood && memGood.length) {
          console.warn(`♻️ ${code} ${t.cat}: Exa+Gemini both failed — using last-known-good (memory).`);
          return memGood;
        }
        const redisGood = await redisGetJSON<DiscoverItem[]>(`news:lastgood-cat:${lgKey}`);
        if (redisGood && redisGood.length) {
          console.warn(`♻️ ${code} ${t.cat}: Exa+Gemini both failed — using last-known-good (Redis).`);
          NEWS_CATEGORY_LAST_GOOD.set(lgKey, redisGood);
          return redisGood;
        }
        return [];
      })
    );
    // Cap each category at PER_CAT_CAP (15) so the UI doesn't drown in 25+
    // items per tab. With dedup we still typically end up with 10-15 per tab.
    const PER_CAT_CAP = 15;
    const collected: DiscoverItem[] = [];
    // Per-category dedup sets. URL dedup used to be GLOBAL across categories,
    // which meant "For You" (which runs first and pulls from the generic
    // headlines query) was eating most political/tech/etc. items — Politics
    // tab would then find those URLs already claimed and silently drop them,
    // so users saw 3 items where the topic search had returned 15. Scoping
    // dedup per-category lets the same article appear in BOTH For You AND
    // its topic tab, which is what users expect.
    const seenUrlsByCat = new Map<string, Set<string>>();
    const seenNormUrlsByCat = new Map<string, Set<string>>();
    const seenArticleIdsByCat = new Map<string, Set<string>>();
    const seenIds = new Set<string>(); // React key uniqueness stays global
    const seenTitlesByCat = new Map<string, DiscoverItem[]>();
    const perCatCount = new Map<string, number>();
    let dupSuffix = 0;
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const it of r.value) {
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

        // Same slugified title across two different URLs would collide as a
        // React key — make `id` unique so the rendered list never warns.
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

    // Per-category top-up: if a topic search returned thin results (Exa
    // sometimes only finds 0-3 items for niche queries like Psychology),
    // borrow from a related category so the tab isn't empty. The MIN
    // threshold is intentionally lower than PER_CAT_CAP so we top up only
    // when a category is genuinely starved, not just below the visual ideal.
    const MIN_PER_CAT = 8;
    // Each (target, donor) pair: when `target` is below MIN_PER_CAT, copy
    // up to N items from `donor` whose tag matches that donor, rewriting
    // their `category` field so they show under `target` too.
    const TOP_UP_DONORS: Array<{ target: string; donors: string[] }> = [
      { target: 'Psychology',  donors: ['Health', 'For You'] },
      { target: 'Politics',    donors: ['For You'] },
      { target: 'Technology',  donors: ['For You'] },
      { target: 'Science',     donors: ['For You'] },
      { target: 'Health',      donors: ['For You'] },
      { target: 'Environment', donors: ['For You'] },
      { target: 'Finance',     donors: ['For You'] },
      { target: 'Sports',      donors: ['For You'] },
    ];
    for (const { target, donors } of TOP_UP_DONORS) {
      const have = perCatCount.get(target) || 0;
      if (have >= MIN_PER_CAT) continue;
      for (const donor of donors) {
        const need = MIN_PER_CAT - (perCatCount.get(target) || 0);
        if (need <= 0) break;
        // Pull from the already-collected items: copies of donor items get
        // a fresh category + id (so React keys stay unique). We don't move
        // the donor item — we duplicate it into the target tab. Users see
        // the same story in both For You + Politics, which is correct UX.
        const donorItems = collected.filter((it) => (it.category || 'For You') === donor);
        let added = 0;
        for (const di of donorItems) {
          if (added >= need) break;
          const targetCatUrls = seenUrlsByCat.get(target) || new Set<string>();
          if (di.url && targetCatUrls.has(di.url)) continue;
          const copy: DiscoverItem = {
            ...di,
            category: target,
            id: `${di.id}-${target.toLowerCase().replace(/\s+/g, '-')}-${++dupSuffix}`,
          };
          if (di.url) targetCatUrls.add(di.url);
          seenUrlsByCat.set(target, targetCatUrls);
          collected.push(copy);
          perCatCount.set(target, (perCatCount.get(target) || 0) + 1);
          added++;
        }
        if (added > 0) {
          console.log(`📥 ${code} ${target}: topped up with ${added} items from ${donor} (had ${have}, target ${MIN_PER_CAT})`);
        }
      }
    }

    items = collected.filter(
      (it) => !isLikelyJunkNewsItem(it.title, it.description || '', it.url || '')
    );
  }
  if (items.length === 0 && geminiKey) items = await fetchGeminiNews(code, geminiKey, limit);

  if (items.length > 0) {
    NEWS_L1.set(l1Key, { items, ts: Date.now() });
    void redisSetJSON(l2Key, items, NEWS_L2_TTL_SEC);
    // Persist as "last known good" — survives the 30-min L2 expiry.
    NEWS_LAST_GOOD.set(code, items);
    void redisSetJSON(`news:lastgood:${NEWS_CACHE_VERSION}:${code}`, items, LAST_GOOD_REDIS_TTL_SEC);
    return items;
  }

  // Live fetch returned 0. Try the "last known good" backup (memory → Redis).
  const memGood = NEWS_LAST_GOOD.get(code);
  if (memGood && memGood.length) {
    console.warn(`⚠️ live news ${code} returned 0 — serving last-known-good (memory).`);
    return memGood;
  }
  const redisGood = await redisGetJSON<DiscoverItem[]>(`news:lastgood:${NEWS_CACHE_VERSION}:${code}`);
  if (redisGood && redisGood.length) {
    console.warn(`⚠️ live news ${code} returned 0 — serving last-known-good (Redis).`);
    NEWS_LAST_GOOD.set(code, redisGood);
    return redisGood;
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
    url.startsWith('data:image/') || /images\.unsplash\.com/i.test(url);
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
      if (resolved) it.image = resolved; // mutate in place; same object lives in the parent items[] array
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/** Fetch live news for multiple countries in parallel. */
export async function getLiveNews(countries: string[], perCountry = 8, forceRefresh = false): Promise<DiscoverItem[]> {
  const settled = await Promise.allSettled(
    countries.map((c) => getLiveNewsForCountry(c, perCountry, forceRefresh))
  );
  const out: DiscoverItem[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') out.push(...s.value);
  }
  // Best-effort image enrichment — never blocks the request beyond its own
  // hard timeouts. Items that don't get a real image keep their topical
  // Unsplash fallback so the UI never shows a broken card.
  try {
    await enrichDiscoverImages(out);
  } catch (e) {
    console.warn('Discover image enrichment failed:', e instanceof Error ? e.message : e);
  }
  return out;
}