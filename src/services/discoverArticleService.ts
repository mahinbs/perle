export interface DiscoverArticle {
  overview: string;
  keyFacts: string[];
  sections: { title: string; content: string }[];
  relatedTopics: string[];
  readTime: string;
}

const ARTICLE_CACHE_PREFIX = 'perle-article-v1-';
const ARTICLE_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

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
 * Fetch AI-generated article from backend API only.
 * API key stays on the backend; frontend never calls Gemini directly.
 */
export async function generateDiscoverArticle(
  id: string,
  title: string,
  description: string,
  category: string
): Promise<DiscoverArticle> {
  const cached = getArticleCache(id);
  if (cached) return cached;

  const baseUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (!baseUrl) throw new Error('API URL not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/discover/article`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, category }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') throw new Error('Article took too long. Please retry.');
    throw e;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }

  const article = (await res.json()) as DiscoverArticle;
  setArticleCache(id, article);
  return article;
}
