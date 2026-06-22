import { supabase } from '../lib/supabase.js';

// Free-tier lifetime limits (server-authoritative for logged-in users).
export const FREE_SEARCH_LIMIT = 4;
export const FREE_DEEP_LIMIT = 1;

type UsageField = 'free_search_used' | 'free_deep_used';

const DEEP_MSG = 'Free plan includes 1 deep research. Upgrade to IQ Pro or IQ Max for unlimited deep research.';
const SEARCH_MSG = 'You have reached your free search limit. Upgrade to IQ Pro or IQ Max for unlimited queries.';

/**
 * Read a free user's lifetime usage. Returns zeros (i.e. "allow") if the
 * counter columns don't exist yet — so the app keeps working before the
 * add_usage_counters.sql migration is run, and enforces once it is.
 */
export async function getFreeUsage(userId: string): Promise<{ search: number; deep: number }> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('free_search_used, free_deep_used')
      .eq('user_id', userId)
      .single();
    if (error || !data) return { search: 0, deep: 0 };
    return {
      search: (data as any).free_search_used ?? 0,
      deep: (data as any).free_deep_used ?? 0,
    };
  } catch {
    return { search: 0, deep: 0 };
  }
}

/** Atomically bump a usage counter (RPC), with a read-then-write fallback. */
export async function incrementFreeUsage(userId: string, field: UsageField): Promise<void> {
  try {
    const rpc = field === 'free_deep_used' ? 'increment_free_deep_used' : 'increment_free_search_used';
    const { error } = await supabase.rpc(rpc, { p_user_id: userId });
    if (!error) return;
    // Fallback if the RPC isn't defined: read then write.
    const { data } = await supabase.from('user_profiles').select(field).eq('user_id', userId).single();
    const cur = (data as any)?.[field] ?? 0;
    await supabase.from('user_profiles').update({ [field]: cur + 1 } as any).eq('user_id', userId);
  } catch {
    // best-effort; never block the request because counting failed
  }
}

/**
 * Returns a block descriptor if a FREE user has hit their limit, else null.
 * Deep searches also consume the regular search budget (matches the client).
 */
export async function checkFreeSearchAllowed(
  userId: string,
  isDeep: boolean
): Promise<{ kind: 'deep' | 'search'; message: string } | null> {
  const usage = await getFreeUsage(userId);
  if (isDeep && usage.deep >= FREE_DEEP_LIMIT) {
    return { kind: 'deep', message: DEEP_MSG };
  }
  if (usage.search >= FREE_SEARCH_LIMIT) {
    return { kind: 'search', message: SEARCH_MSG };
  }
  return null;
}

/** Record a free user's search usage (call after a successful answer). */
export async function recordFreeSearchUsage(userId: string, isDeep: boolean): Promise<void> {
  await incrementFreeUsage(userId, 'free_search_used');
  if (isDeep) await incrementFreeUsage(userId, 'free_deep_used');
}
