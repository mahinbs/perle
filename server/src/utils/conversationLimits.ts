import { supabase } from '../lib/supabase.js';

/**
 * Max number of saved conversations kept per user, by plan tier.
 * When a user exceeds their limit, the OLDEST conversations (by last activity)
 * are auto-deleted along with their history. Premium tiers keep far more.
 */
export const CONVERSATION_LIMITS: Record<string, number> = {
  free: 20,
  pro: 500,
  max: 5000,
};

export function conversationLimitFor(premiumTier: string | undefined | null): number {
  const tier = (premiumTier || 'free').toLowerCase();
  return CONVERSATION_LIMITS[tier] ?? CONVERSATION_LIMITS.free;
}

/**
 * Enforce the per-tier conversation cap for a user: keep the most-recent N
 * conversations, delete the rest (and their history). Safe/best-effort — never
 * throws into the request path.
 */
export async function enforceConversationLimit(
  userId: string,
  premiumTier: string | undefined | null
): Promise<void> {
  const limit = conversationLimitFor(premiumTier);
  try {
    const { data: convs, error } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error || !convs || convs.length <= limit) return;

    const idsToDelete = convs.slice(limit).map((c: any) => c.id);
    if (idsToDelete.length === 0) return;

    // Delete history first (in case the FK isn't ON DELETE CASCADE), then the
    // conversations themselves.
    await supabase.from('conversation_history').delete().in('conversation_id', idsToDelete);
    await supabase.from('conversations').delete().in('id', idsToDelete);
    console.log(`🧹 Auto-deleted ${idsToDelete.length} oldest conversation(s) for user (tier=${premiumTier || 'free'}, limit=${limit})`);
  } catch (e) {
    console.warn('enforceConversationLimit failed:', e);
  }
}
