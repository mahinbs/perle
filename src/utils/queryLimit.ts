import { getLocalItem, setLocalItem } from "./storage";
import { getUserData, isAuthenticated, hasPaidPremiumPlan } from "./auth";

const LEGACY_DAILY_QUERY_KEY = "syntraiq-daily-query-count";
const LIFETIME_QUERY_KEY = "syntraiq-lifetime-query-count";
const LIFETIME_ANALYZE_KEY = "syntraiq-lifetime-analyze-count";
const LIFETIME_MEDIA_KEY = "syntraiq-lifetime-media-count";

export const FREE_LIFETIME_QUERY_LIMIT = 4;
export const FREE_LIFETIME_ANALYZE_LIMIT = 2;
export const FREE_LIFETIME_MEDIA_LIMIT = 2;

// Deep research is heavy/slow → free users get ONE lifetime use (like other limits).
export const FREE_LIFETIME_DEEP_LIMIT = 1;
const LIFETIME_DEEP_KEY = "syntraiq-lifetime-deep-count";

export function getLifetimeDeepCount(): number {
  return readCount(LIFETIME_DEEP_KEY);
}

export function hasReachedLifetimeDeepLimit(): boolean {
  if (isPremiumUser()) return false;
  return getLifetimeDeepCount() >= FREE_LIFETIME_DEEP_LIMIT;
}

export function incrementLifetimeDeepCount(): number {
  if (isPremiumUser()) return 0;
  const next = getLifetimeDeepCount() + 1;
  writeCount(LIFETIME_DEEP_KEY, next);
  return next;
}

export function getDeepLimitMessage(): string {
  return `Free plan includes ${FREE_LIFETIME_DEEP_LIMIT} deep research. Upgrade to IQ Pro or IQ Max for unlimited deep research.`;
}

/** @deprecated use FREE_LIFETIME_QUERY_LIMIT */
export const FREE_DAILY_QUERY_LIMIT = FREE_LIFETIME_QUERY_LIMIT;

export type UsageLimitKind = "search" | "analyze" | "media";

function readCount(key: string, legacyKey?: string): number {
  try {
    const raw = getLocalItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "number") return parsed;
      if (typeof parsed?.count === "number") return parsed.count;
    }

    if (legacyKey) {
      const legacyRaw = getLocalItem(legacyKey);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as { count?: number };
        if (typeof legacy.count === "number") {
          writeCount(key, legacy.count);
          return legacy.count;
        }
      }
    }
  } catch {
    // ignore
  }
  return 0;
}

function writeCount(key: string, count: number): void {
  setLocalItem(key, JSON.stringify(count));
}

export function clearFreeUsageCounters(): void {
  writeCount(LIFETIME_QUERY_KEY, 0);
  writeCount(LIFETIME_ANALYZE_KEY, 0);
  writeCount(LIFETIME_MEDIA_KEY, 0);
  writeCount(LIFETIME_DEEP_KEY, 0);
}

export function isPremiumUser(): boolean {
  return hasPaidPremiumPlan(getUserData());
}

export function shouldEnforceUsageLimits(): boolean {
  return !isPremiumUser();
}

/** @deprecated use shouldEnforceUsageLimits */
export function shouldEnforceQueryLimit(): boolean {
  return shouldEnforceUsageLimits();
}

export function getLifetimeQueryCount(): number {
  return readCount(LIFETIME_QUERY_KEY, LEGACY_DAILY_QUERY_KEY);
}

export function getLifetimeAnalyzeCount(): number {
  return readCount(LIFETIME_ANALYZE_KEY);
}

export function getLifetimeMediaCount(): number {
  return readCount(LIFETIME_MEDIA_KEY);
}

/** @deprecated use getLifetimeQueryCount */
export function getDailyQueryCount(): number {
  return getLifetimeQueryCount();
}

export function getRemainingFreeQueries(): number {
  return Math.max(0, FREE_LIFETIME_QUERY_LIMIT - getLifetimeQueryCount());
}

export function hasReachedLifetimeQueryLimit(): boolean {
  if (isPremiumUser()) return false;
  return getLifetimeQueryCount() >= FREE_LIFETIME_QUERY_LIMIT;
}

/** @deprecated use hasReachedLifetimeQueryLimit */
export function hasReachedDailyQueryLimit(): boolean {
  return hasReachedLifetimeQueryLimit();
}

export function hasReachedLifetimeAnalyzeLimit(): boolean {
  if (isPremiumUser()) return false;
  return getLifetimeAnalyzeCount() >= FREE_LIFETIME_ANALYZE_LIMIT;
}

export function hasReachedLifetimeMediaLimit(): boolean {
  if (isPremiumUser()) return false;
  return getLifetimeMediaCount() >= FREE_LIFETIME_MEDIA_LIMIT;
}

export function incrementLifetimeQueryCount(): number {
  if (isPremiumUser()) return 0;
  const next = getLifetimeQueryCount() + 1;
  writeCount(LIFETIME_QUERY_KEY, next);
  return next;
}

/** @deprecated use incrementLifetimeQueryCount */
export function incrementDailyQueryCount(): number {
  return incrementLifetimeQueryCount();
}

export function incrementLifetimeAnalyzeCount(): number {
  if (isPremiumUser()) return 0;
  const next = getLifetimeAnalyzeCount() + 1;
  writeCount(LIFETIME_ANALYZE_KEY, next);
  return next;
}

export function incrementLifetimeMediaCount(): number {
  if (isPremiumUser()) return 0;
  const next = getLifetimeMediaCount() + 1;
  writeCount(LIFETIME_MEDIA_KEY, next);
  return next;
}

export function getUsageLimitMessage(kind: UsageLimitKind): string {
  switch (kind) {
    case "analyze":
      return "You have reached your free document analysis limit. Upgrade to IQ Pro or IQ Max to analyze unlimited documents.";
    case "media":
      return "You have reached your free image and video generation limit. Upgrade to IQ Pro or IQ Max for unlimited creation.";
    case "search":
    default:
      if (!isAuthenticated()) {
        return "You have reached your free search limit. Sign in or upgrade to IQ Pro or IQ Max to continue.";
      }
      return "You have reached your free search limit. Upgrade to IQ Pro or IQ Max for unlimited queries.";
  }
}

/** @deprecated use getUsageLimitMessage('search') */
export function getQueryLimitMessage(): string {
  return getUsageLimitMessage("search");
}
