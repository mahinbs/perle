import { Capacitor } from "@capacitor/core";
import type { Source } from "../types";

/** Strip markdown/citation noise and ensure a fetchable https URL. */
export function normalizeSourceUrl(url: string): string {
  let cleaned = (url ?? "").trim();
  if (!cleaned) return cleaned;

  const mdLink = cleaned.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (mdLink) cleaned = mdLink[1];

  cleaned = cleaned.replace(/^[\s>*\-•#[\]()]+/, "").trim();
  if (!cleaned) return cleaned;

  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^\/\//, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(cleaned)) {
      cleaned = `https://${cleaned}`;
    }
  }

  return cleaned;
}

function getApiBaseUrl(): string | undefined {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  return baseUrl?.replace(/\/+$/, "");
}

/** Hostname from the source URL — authoritative for favicon lookup. */
export function getHostnameFromUrl(url: string): string {
  const normalized = normalizeSourceUrl(url);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "");
  } catch {
    const hostPart = normalized.replace(/^www\./i, "").split(/[/?#]/)[0] ?? "";
    return hostPart.replace(/^[^a-z0-9.-]+/i, "");
  }
}

function isGroundingRedirectHost(host: string): boolean {
  return host.includes("vertexaisearch.cloud.google.com");
}

const WELL_KNOWN_TITLE_DOMAINS: ReadonlyArray<[RegExp, string]> = [
  [/wikipedia/i, "wikipedia.org"],
  [/youtube/i, "youtube.com"],
  [/reddit/i, "reddit.com"],
  [/github/i, "github.com"],
  [/stackoverflow/i, "stackoverflow.com"],
  [/medium\.com|medium\b/i, "medium.com"],
  [/bbc\b/i, "bbc.com"],
  [/\bcnn\b/i, "cnn.com"],
  [/nytimes|new york times/i, "nytimes.com"],
  [/techcrunch/i, "techcrunch.com"],
  [/the verge/i, "theverge.com"],
  [/ovhcloud|ovh\b/i, "ovhcloud.com"],
];

/** Infer a real site hostname from a page title when the URL is a redirect stub. */
export function inferDomainFromTitle(title?: string): string {
  if (!title?.trim()) return "";

  const domainLike = title.match(
    /\b([a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)+\.[a-z]{2,})\b/i
  );
  if (domainLike) return domainLike[1].toLowerCase();

  for (const [pattern, host] of WELL_KNOWN_TITLE_DOMAINS) {
    if (pattern.test(title)) return host;
  }

  return "";
}

export function getSourceDomain(
  url: string,
  domain?: string,
  title?: string,
  snippet?: string
): string {
  const hostnameFromUrl = getHostnameFromUrl(url);

  if (hostnameFromUrl && !isGroundingRedirectHost(hostnameFromUrl)) {
    return hostnameFromUrl;
  }

  const trimmedDomain = domain?.trim();
  if (
    trimmedDomain &&
    trimmedDomain !== "uploaded-file" &&
    !isGroundingRedirectHost(trimmedDomain)
  ) {
    return trimmedDomain.replace(/^www\./i, "").split("/")[0] ?? trimmedDomain;
  }

  const fromTitle = inferDomainFromTitle(title) || inferDomainFromTitle(snippet);
  if (fromTitle) return fromTitle;

  if (hostnameFromUrl) {
    return hostnameFromUrl;
  }

  return "";
}

/** Normalize source URLs/domains so favicons resolve (incl. Google grounding redirects). */
export function normalizeSources(sources: Source[] | undefined): Source[] {
  return (sources ?? [])
    .map((source) => {
      const url = normalizeSourceUrl(source.url);
      const title = (source.title ?? "").trim();
      const domain = getSourceDomain(url, source.domain, title, source.snippet);
      return { ...source, url, title, domain };
    })
    .filter((source) => source.url || source.domain);
}

export function getSourcePageUrl(
  url: string,
  domain?: string,
  title?: string,
  snippet?: string
): string {
  const normalized = normalizeSourceUrl(url);
  if (/^https?:\/\//i.test(normalized) && !isGroundingRedirectHost(getHostnameFromUrl(normalized))) {
    return normalized;
  }

  const host = getSourceDomain(url, domain, title, snippet);
  return host ? `https://${host}/` : normalized;
}

/** Host + registrable root domain for subdomain favicon fallbacks. */
export function getFaviconHostVariants(
  url: string,
  domain?: string,
  title?: string,
  snippet?: string
): string[] {
  const host = getSourceDomain(url, domain, title, snippet);
  if (!host) return [];

  const variants = [host];
  const parts = host.split(".");
  if (parts.length > 2) {
    const root = parts.slice(-2).join(".");
    if (root !== host) variants.push(root);
  }
  return variants;
}

/** First alphanumeric character for letter avatars (never punctuation like ">"). */
export function getSourceLetter(host: string): string {
  const match = host.replace(/^www\./i, "").match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : "?";
}

export function getFaviconProxyUrl(
  url: string,
  domain?: string,
  title?: string,
  snippet?: string
): string | null {
  const apiBase = getApiBaseUrl();
  if (!apiBase) return null;
  const pageUrl = getSourcePageUrl(url, domain, title, snippet);
  if (!pageUrl) return null;
  return `${apiBase}/api/favicon?url=${encodeURIComponent(pageUrl)}`;
}

/** Favicon URLs resolved purely from the frontend — no backend required.
 *  Priority: DuckDuckGo (fastest, CORS-friendly) → Google S2 → direct
 *  favicon.ico → gstatic (last, returns 1×1 for unknown domains, detected
 *  by naturalWidth ≤ 2 check in SourceFavicon.tsx).
 */
export function getSourceFaviconCandidates(
  url: string,
  domain?: string,
  title?: string,
  snippet?: string
): string[] {
  const hosts = getFaviconHostVariants(url, domain, title, snippet);
  if (hosts.length === 0) return [];

  const pageUrl = getSourcePageUrl(url, domain, title, snippet);
  const encodedPage = encodeURIComponent(pageUrl);
  const candidates: string[] = [];

  // 1. DuckDuckGo — CORS-friendly, fast, works for OVH and most domains
  candidates.push(
    `https://icons.duckduckgo.com/ip3/${hosts[0]}.ico`,
    `https://external-content.duckduckgo.com/ip3/${hosts[0]}.ico`
  );

  // 2. Google S2 favicon API
  for (const host of hosts) {
    const encodedHost = encodeURIComponent(host);
    candidates.push(
      `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${host}/`)}&sz=64`,
      `https://www.google.com/s2/favicons?domain=${encodedHost}&sz=32`
    );
  }

  // 3. Direct favicon.ico / apple-touch-icon from the domain
  for (const host of hosts) {
    candidates.push(
      `https://${host}/favicon.ico`,
      `https://${host}/apple-touch-icon.png`
    );
  }

  // 4. gstatic faviconV2 — last resort; returns a 1×1 transparent pixel
  //    for unknown domains (not an HTTP error), caught by naturalWidth ≤ 2.
  candidates.push(
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodedPage}&size=32`
  );

  return [...new Set(candidates)];
}


function base64ToObjectUrl(base64: string, mimeType: string): string | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], {
      type: mimeType.split(";")[0] || "image/png",
    });
    if (blob.size < 16) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function contentTypeFromHeaders(
  headers: Record<string, string> | undefined
): string {
  if (!headers) return "image/png";
  const direct = headers["Content-Type"] ?? headers["content-type"];
  return direct?.split(";")[0]?.trim() || "image/png";
}

/** Native HTTP fallback when img tags fail in Capacitor WebView. */
export async function fetchFaviconViaNativeHttp(
  candidateUrl: string
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { CapacitorHttp } = await import("@capacitor/core");
    const response = await CapacitorHttp.get({
      url: candidateUrl,
      responseType: "arraybuffer",
      connectTimeout: 8000,
      readTimeout: 8000,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (response.status < 200 || response.status >= 300 || !response.data) {
      return null;
    }

    if (typeof response.data === "string") {
      return base64ToObjectUrl(
        response.data,
        contentTypeFromHeaders(response.headers as Record<string, string>)
      );
    }

    return null;
  } catch {
    return null;
  }
}

export async function resolveSourceFaviconUrl(
  url: string,
  domain?: string,
  startIndex = 0,
  title?: string,
  snippet?: string
): Promise<string | null> {
  const candidates = getSourceFaviconCandidates(url, domain, title, snippet);
  if (candidates.length === 0) return null;

  for (let i = startIndex; i < candidates.length; i += 1) {
    if (Capacitor.isNativePlatform()) {
      const objectUrl = await fetchFaviconViaNativeHttp(candidates[i]);
      if (objectUrl) return objectUrl;
      continue;
    }
    return candidates[i] ?? null;
  }

  return null;
}
