import { createClient } from '@supabase/supabase-js';

/**
 * Frontend Supabase client — used exclusively for Google OAuth on native platforms.
 *
 * The anon key is the PUBLIC key (safe to bundle in frontend code).
 * It only has the same permissions as an unauthenticated user.
 *
 * We use this client to:
 *   1. Generate the OAuth URL with a proper PKCE code_verifier stored in localStorage
 *   2. Exchange the authorization code for a session after the deep-link callback
 *
 * All other backend communication goes through the existing REST API (api.syntraiq.ai).
 */
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://doudmnpxdymqyxwufqjo.supabase.co';

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdWRtbnB4ZHltcXl4d3VmcWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NTc5ODUsImV4cCI6MjA3ODMzMzk4NX0.IKiQcAy6QeMabfmKur149Daxcw96Fcsehnruqwvyr4c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist the PKCE code_verifier in the app's localStorage so it survives
    // the round-trip through Chrome Custom Tab / ASWebAuthenticationSession.
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false, // we handle the callback URL manually
  },
});
