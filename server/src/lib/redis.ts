import Redis from 'ioredis';

/**
 * Thin Redis wrapper used for shared caches (search results, news, etc.).
 *
 * - Activates ONLY when `REDIS_URL` is set. Without it, every helper no-ops or
 *   reads as a miss — so local dev and current deployments keep working with
 *   zero config change. Add Redis when you're ready (e.g. multi-instance).
 * - Single shared connection per process; ioredis handles reconnect.
 * - All errors are swallowed; cache is best-effort and must never break a request.
 */

let client: Redis | null = null;
let enabled = false;

const url = process.env.REDIS_URL?.trim();
if (url) {
  try {
    client = new Redis(url, {
      // Don't block startup on Redis being available.
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      // Reasonable connect timeout so a bad URL doesn't stall requests.
      connectTimeout: 2000,
      enableOfflineQueue: false,
    });
    // ioredis emits 'error' for every reconnect attempt — spammy in dev when
    // Redis isn't running. Only log the first error per minute.
    let lastErrLog = 0;
    client.on('error', (err) => {
      const now = Date.now();
      if (now - lastErrLog > 60_000) {
        lastErrLog = now;
        console.warn('Redis unavailable (cache will run in-memory):', err?.message || err);
      }
    });
    client.on('connect', () => {
      enabled = true;
      console.log('✅ Redis connected:', url.replace(/:[^:@/]*@/, ':***@'));
    });
    client.on('end', () => {
      enabled = false;
    });
  } catch (e) {
    console.warn('Redis init failed; cache will run in-memory only:', e);
    client = null;
  }
}

export function isRedisEnabled(): boolean {
  return enabled && client !== null;
}

export async function redisGetJSON<T>(key: string): Promise<T | null> {
  if (!isRedisEnabled() || !client) return null;
  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJSON(key: string, value: unknown, ttlSec: number): Promise<void> {
  if (!isRedisEnabled() || !client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch {
    // best-effort
  }
}

/**
 * Set JSON with a per-tier key budget.
 * This enforces approximate cache space allocation by key count (not bytes),
 * useful for policies like 80% premium / 20% free.
 */
export async function redisSetJSONWithTierBudget(
  key: string,
  value: unknown,
  ttlSec: number,
  tier: 'free' | 'premium',
  maxKeysForTier: number
): Promise<void> {
  if (!isRedisEnabled() || !client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSec);

    const idxKey = `cache:index:${tier}`;
    const now = Date.now();
    await client.zadd(idxKey, now, key);
    // Keep the index itself around; refreshed on each write.
    await client.expire(idxKey, Math.max(ttlSec * 3, 3600));

    const count = await client.zcard(idxKey);
    const over = count - maxKeysForTier;
    if (over > 0) {
      const victims = await client.zrange(idxKey, 0, over - 1);
      if (victims.length > 0) {
        await client.del(...victims);
      }
      await client.zremrangebyrank(idxKey, 0, over - 1);
    }
  } catch {
    // best-effort
  }
}

export async function redisDel(key: string): Promise<void> {
  if (!isRedisEnabled() || !client) return;
  try {
    await client.del(key);
  } catch {
    // best-effort
  }
}
