import { createClient } from '@supabase/supabase-js';

/**
 * Frontend Supabase client — used for Google OAuth on web and native.
 *
 * The anon key is the PUBLIC key (safe to bundle in frontend code).
 * Generates PKCE-aware OAuth URLs and exchanges the callback code in the
 * same browser / WebView where sign-in started.
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
