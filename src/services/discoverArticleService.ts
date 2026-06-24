export interface DiscoverArticle {
  overview: string;
  keyFacts: string[];
  sections: { title: string; content: string }[];
  relatedTopics: string[];
  readTime: string;
}

const ARTICLE_CACHE_PREFIX = 'syntraiq-article-v1-';
const ARTICLE_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function buildClientFallbackArticle(
  title: string,
  description: string,
  category: string
): DiscoverArticle {
  const overview =
    description?.trim() ||
    `${title} is a ${category || 'General'} story worth understanding in more depth.`;
  const facts = [
    `Headline: ${title}`,
    `Category: ${category || 'General'}`,
    description?.trim() || 'Tap Deep dive with AI below for a full research brief.',
  ];
  while (facts.length < 5) {
    facts.push(`Related coverage may expand on: ${title}`);
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
          'Follow trusted sources for updates. Use Deep dive with AI on this page for a tailored brief.',
      },
    ],
    relatedTopics: [category || 'News', title].filter(Boolean),
    readTime: '2 min read',
  };
}

function isValidArticleShape(article: unknown): article is DiscoverArticle {
  const a = article as DiscoverArticle;
  return Boolean(
    a &&
    typeof a.overview === 'string' &&
    a.overview.trim().length > 0 &&
    Array.isArray(a.keyFacts) &&
    a.keyFacts.length > 0 &&
    Array.isArray(a.sections) &&
    a.sections.length > 0
  );
}

function getArticleCache(id: string): DiscoverArticle | null {
  try {
    const raw = localStorage.getItem(ARTICLE_CACHE_PREFIX + id);
    if (!raw) return null;
    const { article, ts } = JSON.parse(raw);
    if (Date.now() - ts > ARTICLE_CACHE_EXPIRY_MS) return null;
    return article;
  } catch { return null; }
}

function setArticleCache(id: string, article: DiscoverArticle) {
  try {
    localStorage.setItem(ARTICLE_CACHE_PREFIX + id, JSON.stringify({ article, ts: Date.now() }));
  } catch { /* ignore */ }
}

/**
 * Fetch AI-generated article from backend API.
 * Never throws — always returns a readable article (API fallback or local shell).
 */
export async function generateDiscoverArticle(
  id: string,
  title: string,
  description: string,
  category: string
): Promise<DiscoverArticle> {
  const cached = getArticleCache(id);
  if (cached) return cached;

  const fallback = () => buildClientFallbackArticle(title, description, category);
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!baseUrl) return fallback();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/discover/article`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, category }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('Discover article API non-OK:', res.status);
      return fallback();
    }

    const article = (await res.json()) as DiscoverArticle;
    if (!isValidArticleShape(article)) return fallback();

    setArticleCache(id, article);
    return article;
  } catch (e) {
    console.warn('Discover article fetch failed:', e);
    return fallback();
  } finally {
    clearTimeout(timeout);
  }
}
