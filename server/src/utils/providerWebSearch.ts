import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SearchResult } from './webSearch.js';
export type ExaSearchType = 'auto' | 'instant' | 'deep';

interface JsonSource {
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
}

function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeResults(results: SearchResult[], maxResults: number): SearchResult[] {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];
  for (const r of results) {
    const normalized = normalizeUrl(r.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ ...r, url: normalized });
    if (unique.length >= maxResults) break;
  }
  return unique;
}

function extractJsonArray(text: string): JsonSource[] {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const first = trimmed.indexOf('[');
    const last = trimmed.lastIndexOf(']');
    if (first >= 0 && last > first) {
      try {
        const parsed = JSON.parse(trimmed.slice(first, last + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function toSearchResults(items: JsonSource[], maxResults: number): SearchResult[] {
  const mapped = items
    .map((item, idx) => {
      const url = typeof item.url === 'string' ? item.url : '';
      const title = typeof item.title === 'string' ? item.title : `Source ${idx + 1}`;
      const content =
        typeof item.snippet === 'string'
          ? item.snippet
          : typeof item.content === 'string'
            ? item.content
            : '';

      return {
        title,
        url,
        content,
        score: Math.max(0.1, 1 - idx * 0.05),
      } as SearchResult;
    })
    .filter((r) => r.url && r.content);

  return dedupeResults(mapped, maxResults);
}

function parseUrlResultsFromText(text: string, maxResults: number): SearchResult[] {
  if (!text) return [];
  const urlMatches = text.match(/https?:\/\/[^\s)\]}>"']+/g) || [];
  const raw = urlMatches.map((url, idx) => {
    let title = `Source ${idx + 1}`;
    try {
      title = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // ignore parse errors; title fallback
    }
    return {
      title,
      url,
      content: 'Web source from provider-native search',
      score: Math.max(0.1, 1 - idx * 0.05),
    } as SearchResult;
  });
  return dedupeResults(raw, maxResults);
}

function getResponseOutputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text;
  }

  const message = Array.isArray(data?.output)
    ? data.output.find((item: any) => item?.type === 'message')
    : null;
  const content = Array.isArray(message?.content) ? message.content : [];
  const textPart = content.find((part: any) => part?.type === 'output_text' && typeof part?.text === 'string');
  return typeof textPart?.text === 'string' ? textPart.text : '';
}

export async function searchWithGeminiGrounding(
  query: string,
  apiKey: string,
  maxResults: number = 10,
  modelName: string = 'gemini-2.5-flash-lite'
): Promise<SearchResult[]> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Find current, reliable web sources for: ${query}` }] }],
      // Grounding with Google Search
      tools: [{ googleSearch: {} } as any],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    } as any);

    const candidate = (response as any)?.response?.candidates?.[0];
    const grounding = candidate?.groundingMetadata;
    const chunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];

    const results: SearchResult[] = chunks
      .map((chunk: any, idx: number) => {
        const web = chunk?.web || {};
        const url = typeof web.uri === 'string' ? web.uri : '';
        const title = typeof web.title === 'string' ? web.title : `Source ${idx + 1}`;
        const support = Array.isArray(grounding?.groundingSupports)
          ? grounding.groundingSupports.find((s: any) => Array.isArray(s?.groundingChunkIndices) && s.groundingChunkIndices.includes(idx))
          : null;
        const snippet = typeof support?.segment?.text === 'string' ? support.segment.text : '';
        return { title, url, content: snippet || title, score: Math.max(0.1, 1 - idx * 0.05) } as SearchResult;
      })
      .filter((r: SearchResult) => r.url);

    return dedupeResults(results, maxResults);
  } catch (error) {
    console.warn('Gemini grounding search failed:', error);
    return [];
  }
}

export async function searchWithOpenAIWebTool(
  query: string,
  apiKey: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  if (!apiKey) return [];
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: `Search the web for latest information on: "${query}".
Return ONLY JSON array with max ${maxResults} items, each item as:
{"title":"...","url":"...","snippet":"..."}
No markdown, no additional text.`,
        tools: [{ type: 'web_search' }],
        max_output_tokens: 700,
      }),
    });

    if (!response.ok) return [];
    const data: any = await response.json();
    const text = getResponseOutputText(data);
    const parsed = extractJsonArray(text);
    const jsonResults = toSearchResults(parsed, maxResults);
    return jsonResults.length > 0 ? jsonResults : parseUrlResultsFromText(text, maxResults);
  } catch (error) {
    console.warn('OpenAI web search failed:', error);
    return [];
  }
}

export async function searchWithGrokWebTool(
  query: string,
  apiKey: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  if (!apiKey) return [];
  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3',
        input: `Search web and current trends for: "${query}".
Return ONLY JSON array with max ${maxResults} items, each item:
{"title":"...","url":"...","snippet":"..."}
No markdown, no extra text.`,
        tools: [{ type: 'web_search' }],
        max_output_tokens: 700,
      }),
    });

    if (!response.ok) return [];
    const data: any = await response.json();
    const text = getResponseOutputText(data);
    const parsed = extractJsonArray(text);
    const jsonResults = toSearchResults(parsed, maxResults);
    return jsonResults.length > 0 ? jsonResults : parseUrlResultsFromText(text, maxResults);
  } catch (error) {
    console.warn('Grok web search failed:', error);
    return [];
  }
}

export async function searchWithExa(
  query: string,
  apiKey: string,
  type: ExaSearchType = 'auto',
  maxResults: number = 10
): Promise<SearchResult[]> {
  if (!apiKey) return [];

  try {
    const payload: any = {
      query,
      type,
      numResults: Math.max(1, Math.min(maxResults, 25)),
      useAutoprompt: true,
    };

    if (type === 'instant') {
      payload.livecrawl = 'always';
    }

    if (type === 'auto' || type === 'instant') {
      payload.contents = {
        highlights: true,
        text: { maxCharacters: 1000 },
      };
    }

    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return [];
    const data: any = await response.json();

    const results = Array.isArray(data?.results) ? data.results : [];
    const mapped: SearchResult[] = results
      .map((item: any, idx: number) => {
        const url = typeof item?.url === 'string' ? item.url : '';
        const title = typeof item?.title === 'string' ? item.title : `Source ${idx + 1}`;
        const highlights = Array.isArray(item?.highlights)
          ? item.highlights.join(' ')
          : '';
        const text = typeof item?.text === 'string' ? item.text : '';
        const summary = typeof item?.summary === 'string' ? item.summary : '';
        const content = (highlights || text || summary || '').trim();
        return {
          title,
          url,
          content: content || title,
          score: typeof item?.score === 'number' ? item.score : Math.max(0.1, 1 - idx * 0.05),
        } as SearchResult;
      })
      .filter((r: SearchResult) => r.url);

    return dedupeResults(mapped, maxResults);
  } catch (error) {
    console.warn('Exa search failed:', error);
    return [];
  }
}
