import { getLocalItem, setLocalItem } from "./storage";
import { getUserData, isAuthenticated } from "./auth";

const QUERY_LIMIT_KEY = "syntraiq-daily-query-count";
export const FREE_DAILY_QUERY_LIMIT = 4;

type DailyQueryRecord = { date: string; count: number };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readRecord(): DailyQueryRecord {
  try {
    const raw = getLocalItem(QUERY_LIMIT_KEY);
    if (!raw) return { date: todayKey(), count: 0 };
    const parsed = JSON.parse(raw) as DailyQueryRecord;
    if (parsed.date !== todayKey()) return { date: todayKey(), count: 0 };
    return parsed;
  } catch {
    return { date: todayKey(), count: 0 };
  }
}

function writeRecord(record: DailyQueryRecord): void {
  setLocalItem(QUERY_LIMIT_KEY, JSON.stringify(record));
}

export function isPremiumUser(): boolean {
  const user = getUserData();
  return Boolean(user?.isPremium);
}

export function getDailyQueryCount(): number {
  return readRecord().count;
}

export function getRemainingFreeQueries(): number {
  return Math.max(0, FREE_DAILY_QUERY_LIMIT - getDailyQueryCount());
}

export function hasReachedDailyQueryLimit(): boolean {
  if (isPremiumUser()) return false;
  return getDailyQueryCount() >= FREE_DAILY_QUERY_LIMIT;
}

/** Increment cumulative daily query count (not reset per conversation). */
export function incrementDailyQueryCount(): number {
  if (isPremiumUser()) return 0;
  const record = readRecord();
  const next = { date: todayKey(), count: record.count + 1 };
  writeRecord(next);
  return next.count;
}

export function shouldEnforceQueryLimit(): boolean {
  return !isPremiumUser();
}

export function getQueryLimitMessage(): string {
  if (!isAuthenticated()) {
    return "Your daily free limit has been reached. Sign in or upgrade to continue.";
  }
  return "Your daily free limit has been reached. Upgrade to IQ Pro or IQ Max for unlimited queries.";
}
