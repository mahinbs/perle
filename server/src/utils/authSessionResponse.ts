import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import {
  evaluateSubscriptionAccess,
  persistSubscriptionAccessFix,
  persistManualGrantSnapshot,
  type SubscriptionProfile,
} from './subscriptionAccess.js';

export type PremiumState = {
  isPremium: boolean;
  premiumTier: string;
  subscriptionStatus: string;
  subscriptionEndDate: string | null;
};

export async function ensureUserProfile(userId: string) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (profile) return profile;

  const { data: created, error } = await supabase
    .from('user_profiles')
    .insert({
      user_id: userId,
      notifications: true,
      dark_mode: false,
      search_history: true,
      voice_search: true,
      is_premium: false,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Profile creation error:', error);
  }
  return created;
}

export function deriveDisplayName(user: User): string {
  const meta = user.user_metadata || {};
  const fromMeta =
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.given_name === 'string' && meta.given_name.trim());
  if (fromMeta) return fromMeta;
  const emailLocal = user.email?.split('@')[0]?.trim();
  return emailLocal || 'User';
}

export async function resolvePremiumState(
  userId: string,
  profile: Record<string, unknown> | null | undefined
): Promise<PremiumState> {
  const subscriptionProfile = profile as SubscriptionProfile | null | undefined;
  const access = evaluateSubscriptionAccess(subscriptionProfile);
  await persistSubscriptionAccessFix(userId, access, subscriptionProfile);
  await persistManualGrantSnapshot(userId, subscriptionProfile || {}, access);

  const subscriptionEndDate =
    (profile as { subscription_end_date?: string })?.subscription_end_date || null;

  return {
    isPremium: access.isPremium,
    premiumTier: access.premiumTier,
    subscriptionStatus: access.subscriptionStatus,
    subscriptionEndDate,
  };
}

export function formatAuthUser(
  user: User,
  profile: Record<string, unknown> | null | undefined,
  premium: PremiumState
) {
  const name = deriveDisplayName(user);
  return {
    id: user.id,
    name,
    email: user.email || '',
    notifications: (profile as { notifications?: boolean })?.notifications ?? true,
    darkMode: (profile as { dark_mode?: boolean })?.dark_mode ?? false,
    searchHistory: (profile as { search_history?: boolean })?.search_history ?? true,
    voiceSearch: (profile as { voice_search?: boolean })?.voice_search ?? true,
    isPremium: premium.isPremium,
    premiumTier: premium.premiumTier,
    subscription: {
      status: premium.subscriptionStatus,
      tier: premium.premiumTier,
      endDate: premium.subscriptionEndDate,
      autoRenew: (profile as { auto_renew?: boolean })?.auto_renew ?? false,
    },
  };
}

export async function buildAuthResponseFromSession(session: Session) {
  const user = session.user;
  const profile = await ensureUserProfile(user.id);
  const premium = await resolvePremiumState(user.id, profile as Record<string, unknown>);
  return {
    token: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    expiresIn: session.expires_in,
    user: formatAuthUser(user, profile as Record<string, unknown>, premium),
  };
}

export async function buildAuthResponseFromAccessToken(
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
) {
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error(error?.message || 'Invalid OAuth token');
  }

  const profile = await ensureUserProfile(data.user.id);
  const premium = await resolvePremiumState(data.user.id, profile as Record<string, unknown>);

  return {
    token: accessToken,
    refreshToken: refreshToken || '',
    expiresAt: expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    expiresIn: expiresAt
      ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000))
      : 3600,
    user: formatAuthUser(data.user, profile as Record<string, unknown>, premium),
  };
}
