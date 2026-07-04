import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { OAuthSession } from '../plugins/oauthSession';
import { AppleSignIn } from '../plugins/appleSignIn';
import { supabase } from '../lib/supabaseClient';

// Vite exposes env variables via import.meta.env
const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export const NATIVE_OAUTH_SCHEME = 'syntraiq';
export const NATIVE_OAUTH_REDIRECT = `${NATIVE_OAUTH_SCHEME}://auth/callback`;

// Debug: Log API URL in development (will be removed in production)
if (import.meta.env.DEV) {
  console.log('🔧 API_URL:', API_URL || 'NOT SET - Please add VITE_API_URL to .env file');
}

import {
  getLocalItem,
  getRefreshToken,
  getSessionAuthToken,
  getTokenExpiresAt,
  migrateLegacyStorageKeys,
  removeLocalItem,
  removeRefreshToken,
  removeSessionAuthToken,
  removeTokenExpiresAt,
  setLocalItem,
  setRefreshToken,
  setSessionAuthToken,
  setTokenExpiresAt,
  STORAGE_KEYS,
} from './storage';
import { clearAllHomeChatSessions } from './homeChatSession';

migrateLegacyStorageKeys();

const USER_DATA_KEY = STORAGE_KEYS.userData;

export interface User {
  id: string;
  name: string;
  email: string;
  notifications: boolean;
  darkMode: boolean;
  searchHistory: boolean;
  voiceSearch: boolean;
  isPremium?: boolean;
  premiumTier?: 'free' | 'pro' | 'max';
  subscription?: {
    status: string;
    tier: string;
    endDate: string | null;
    autoRenew: boolean;
  };
  /** Uploaded profile picture URL (from /api/profile). */
  dp?: string | null;
  displayPictureUrl?: string | null;
}

export interface AuthResponse {
  token?: string;
  refreshToken?: string;
  expiresAt?: number;
  expiresIn?: number;
  user?: User;
  requiresVerification?: boolean;
  email?: string;
  message?: string;
  devOTP?: string; // Only in development
}

export function getAuthToken(): string | null {
  return getSessionAuthToken();
}

export function setAuthToken(token: string): void {
  setSessionAuthToken(token);
}

export function setAuthCredentials(token: string, refreshToken?: string, expiresAt?: number): void {
  setAuthToken(token);
  if (refreshToken) {
    setRefreshToken(refreshToken);
  }
  if (expiresAt) {
    setTokenExpiresAt(expiresAt);
  } else {
    // Default: 1 hour from now
    setTokenExpiresAt(Math.floor(Date.now() / 1000) + 3600);
  }
  notifyAuthChange();
}

export function applyTheme(darkMode: boolean): void {
  if (typeof window === 'undefined') return;
  document.documentElement.classList.toggle('dark', darkMode);
  document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
}

/** Apply theme + persist to cached user immediately (no network wait). */
export function persistThemePreference(darkMode: boolean): void {
  applyTheme(darkMode);
  const user = getUserData();
  if (user) {
    setUserData({ ...user, darkMode });
  }
}

export function getStoredDarkModePreference(): boolean {
  const user = getUserData();
  return user?.darkMode === true;
}

export function initializeTheme(): void {
  applyTheme(getStoredDarkModePreference());
}

/**
 * Hard logout — clears every token + user record. Call this only from the
 * intentional "log out" button or when we've already proven the session
 * cannot be recovered (refresh token rejected).
 *
 * Most page-level "if (status === 401) { removeAuthToken() }" handlers
 * were silently kicking users out the moment their access token aged
 * past TTL, even though the refresh token was still good. To stop that,
 * those callers now go through `tryRecoverAuthOrLogout` instead, which
 * attempts a refresh first and only hard-logs-out when refresh fails.
 */
export function removeAuthToken(): void {
  if (typeof window === 'undefined') return;
  removeSessionAuthToken();
  removeRefreshToken();
  removeTokenExpiresAt();
  removeLocalItem(USER_DATA_KEY);
  applyTheme(false);
  notifyAuthChange();
}

/**
 * Soft 401 handler: if a refresh token is present, attempt to refresh the
 * session. Returns true if the session was recovered (caller should retry
 * the request) and false if it's genuinely gone (caller's request stays
 * failed; we've already hard-logged-out so the UI updates).
 *
 * Use this from every page-level 401 handler instead of removeAuthToken().
 */
export async function tryRecoverAuthOrLogout(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  // No refresh token to try — this user is genuinely signed out.
  if (!getRefreshToken()) {
    removeAuthToken();
    return false;
  }
  const refreshed = await refreshAuthSession();
  return refreshed;
}

export function getUserData(): User | null {
  if (typeof window === 'undefined') return null;
  const data = getLocalItem(USER_DATA_KEY);
  return data ? JSON.parse(data) : null;
}

/** User's uploaded profile photo, if they set one in Profile. */
export function getUserProfilePictureUrl(): string | null {
  const user = getUserData();
  if (!user) return null;
  const url = user.dp || user.displayPictureUrl;
  return typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
}

/** First letter of the user's display name (for avatar fallbacks). */
export function getUserNameInitial(name?: string | null): string {
  const trimmed = (name ?? getUserData()?.name ?? 'U').trim();
  if (!trimmed) return 'U';
  return trimmed.charAt(0).toUpperCase();
}

/** Inline SVG avatar with the user's first initial — no external requests. */
export function getUserInitialAvatarDataUrl(name?: string | null, size = 80): string {
  const initial = getUserNameInitial(name);
  const fontSize = Math.round(size * 0.45);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#C7A869"/>` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#111111" ` +
    `font-family="Ubuntu, system-ui, sans-serif" font-weight="700" font-size="${fontSize}">${initial}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function getUserAvatarFallbackUrl(size = 80): string {
  return getUserInitialAvatarDataUrl(getUserData()?.name, size);
}

export function setUserData(user: User): void {
  if (typeof window === 'undefined') return;
  const previous = getUserData();
  if (previous?.id !== user.id) {
    clearAllHomeChatSessions();
  }
  setLocalItem(USER_DATA_KEY, JSON.stringify(user));
  if (user && typeof user.darkMode === 'boolean') {
    applyTheme(user.darkMode);
  }
  notifyAuthChange();
}

export function hasPaidPremiumPlan(
  user?: Pick<User, 'isPremium' | 'premiumTier'> | null,
): boolean {
  if (!user?.isPremium) return false;
  return user.premiumTier === 'pro' || user.premiumTier === 'max';
}

type PostAuthNavState = { returnTo?: string; plan?: string };

export function getPostAuthNavigation(
  user: User | null | undefined,
  navState?: PostAuthNavState,
): { path: string; useAuthRedirect?: boolean } {
  const wouldGoToSubscription =
    (navState?.returnTo?.startsWith('/subscription') ?? false) ||
    Boolean(navState?.plan);

  if (hasPaidPremiumPlan(user) && wouldGoToSubscription) {
    return { path: '/app' };
  }
  if (navState?.returnTo) {
    return { path: navState.returnTo, useAuthRedirect: true };
  }
  if (navState?.plan) {
    return { path: `/subscription?plan=${navState.plan}`, useAuthRedirect: true };
  }
  return { path: '/app' };
}

export function getAuthHeaders(includeContentType = true): HeadersInit {
  const token = getAuthToken();
  const refreshToken = getRefreshToken();
  const headers: HeadersInit = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (refreshToken) {
    headers['X-Refresh-Token'] = refreshToken;
  }
  return headers;
}

/**
 * Returns a valid access token, refreshing it proactively if it will expire within 5 minutes.
 * Returns null if no session exists (caller should redirect to login).
 */
/**
 * Returns a still-valid access token, refreshing in the background if the
 * cached one is within 5 minutes of expiry.
 *
 * IMPORTANT race fix: this function used to perform its OWN /auth/refresh
 * fetch, parallel to refreshAuthSession's. When two callers (e.g. multiple
 * page-load fetches) hit getValidToken concurrently, both POSTed the SAME
 * refresh token to /auth/refresh. Supabase rotates the refresh token on
 * first use, so the SECOND request 401'd — and the old code reacted to
 * that 401 by calling removeAuthToken(), nuking the FRESH credentials the
 * first request had just saved. That's the boot-time auto-logout users
 * reported.
 *
 * Fix: delegate to refreshAuthSession which has an in-flight guard, so
 * concurrent callers share one refresh round-trip. On failure we now
 * return the cached token (which may itself be the freshly-rotated one
 * saved by the winning concurrent call) instead of wiping credentials.
 */
export async function getValidToken(): Promise<string | null> {
  const expiresAt = getTokenExpiresAt();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = getAuthToken();

  // Token still fresh for 5+ minutes — use as-is.
  if (token && expiresAt > 0 && expiresAt - nowSeconds >= 300) {
    return token;
  }

  const rt = getRefreshToken();
  if (!rt || !API_URL) {
    return token;
  }

  // Share the in-flight refresh with anyone else who's currently refreshing.
  const refreshed = await refreshAuthSession();
  if (refreshed) {
    return getAuthToken(); // refreshed value, set by refreshAuthSession
  }
  // Refresh didn't succeed — but DON'T wipe credentials here. Either:
  //   (a) Another concurrent call already updated localStorage with a fresh
  //       token; we'd be deleting valid creds.
  //   (b) Refresh genuinely failed — refreshAuthSession will have called
  //       removeAuthToken() itself when the refresh endpoint returned 401.
  // Returning whatever is currently cached lets the next request decide.
  return getAuthToken();
}

/**
 * Build auth headers after proactively refreshing an expiring access token.
 */
export async function getAuthHeadersAsync(includeContentType = true): Promise<HeadersInit> {
  await getValidToken();
  return getAuthHeaders(includeContentType);
}

/**
 * Saves new tokens from API response headers (silent mid-request refresh).
 */
export function saveTokensFromResponseHeaders(res: Response): void {
  const newAT = res.headers.get('X-New-Access-Token');
  if (newAT) {
    const newRT = res.headers.get('X-New-Refresh-Token') || getRefreshToken() || '';
    const newExp = res.headers.get('X-New-Expires-At');
    setAuthCredentials(newAT, newRT, newExp ? Number(newExp) : undefined);
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  if (!API_URL) {
    throw new Error('Backend API not configured. Please set VITE_API_URL in your .env file (e.g., VITE_API_URL=http://localhost:3333). Make sure your backend server is running.');
  }

  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  const data: AuthResponse = await response.json();
  if (data.token) {
    setAuthCredentials(data.token, data.refreshToken, data.expiresAt);
  }
  if (data.user) {
    setUserData(data.user);
  }
  return data;
}

export async function signup(name: string, email: string, password: string): Promise<AuthResponse> {
  if (!API_URL) {
    throw new Error('Backend API not configured. Please set VITE_API_URL in your .env file (e.g., VITE_API_URL=http://localhost:3333). Make sure your backend server is running.');
  }

  const response = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Signup failed' }));
    
    // Parse validation errors if present
    if (errorData.details && typeof errorData.details === 'object') {
      const validationErrors: string[] = [];
      Object.entries(errorData.details).forEach(([_field, errors]) => {
        if (Array.isArray(errors)) {
          errors.forEach((err: string) => {
            validationErrors.push(err);
          });
        }
      });
      
      if (validationErrors.length > 0) {
        const error = new Error(errorData.error || 'Validation failed');
        (error as any).validationErrors = validationErrors;
        throw error;
      }
    }
    
    throw new Error(errorData.error || 'Signup failed');
  }

  const data: AuthResponse = await response.json();
  
  // If verification required, return without setting token
  if (data.requiresVerification) {
    return data;
  }
  
  // If token and user provided, set them
  if (data.token && data.user) {
    setAuthCredentials(data.token, data.refreshToken, data.expiresAt);
    setUserData(data.user);
  }
  
  return data;
}

const OAUTH_RETURN_KEY = 'syntraiq-oauth-return';

export function storeOAuthReturnState(state?: { returnTo?: string; plan?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    if (state?.returnTo || state?.plan) {
      sessionStorage.setItem(OAUTH_RETURN_KEY, JSON.stringify(state));
    } else {
      sessionStorage.removeItem(OAUTH_RETURN_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function readOAuthReturnState(): { returnTo?: string; plan?: string } | undefined {
  try {
    const raw = sessionStorage.getItem(OAUTH_RETURN_KEY);
    sessionStorage.removeItem(OAUTH_RETURN_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function buildGoogleAuthUrl(_returnState?: { returnTo?: string; plan?: string }): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    // Native: verifier in app localStorage → deep link → exchangeCodeForSession
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: NATIVE_OAUTH_REDIRECT,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error || !data.url) {
      throw new Error(error?.message || 'Failed to build Google sign-in URL');
    }
    return data.url;
  }

  // Web: same Supabase PKCE flow — verifier must live in this browser tab
  if (typeof window === 'undefined') {
    throw new Error('Google sign-in is only available in the browser.');
  }

  const webRedirect = `${window.location.origin}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: webRedirect,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });

  if (error || !data.url) {
    throw new Error(error?.message || 'Failed to build Google sign-in URL');
  }
  return data.url;
}

/**
 * Sign in with Apple — iOS native app only (App Store Guideline 4.8).
 *
 * Supabase setup (native-only): enable Apple, add bundle ID under Client IDs
 * (`com.syntraiq.com`), leave Secret Key empty. Do NOT paste the .p8 file —
 * that field expects a JWT (OAuth only). See scripts/generate-apple-client-secret.mjs.
 */
export function isAppleSignInAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/**
 * Start Sign in with Apple (iOS native app only).
 * Uses ASAuthorizationAppleID + Supabase signInWithIdToken.
 */
export async function startAppleAuth(
  returnState?: { returnTo?: string; plan?: string },
): Promise<AuthResponse> {
  storeOAuthReturnState(returnState);

  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    throw new Error('Sign in with Apple is only available on the iOS app.');
  }

  const result = await AppleSignIn.signIn();

  if (result.cancelled) {
    throw new Error('Apple sign-in was cancelled.');
  }

  if (!result.identityToken || !result.nonce) {
    throw new Error('Apple sign-in did not return a valid identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: result.identityToken,
    nonce: result.nonce,
  });

  if (error || !data.session) {
    throw new Error(error?.message || 'Apple sign-in failed. Please try again.');
  }

  const givenName = result.fullName?.givenName?.trim();
  const familyName = result.fullName?.familyName?.trim();
  const fullName = [givenName, familyName].filter(Boolean).join(' ').trim();
  if (fullName) {
    await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        name: fullName,
      },
    });
  }

  return completeWithSupabaseSession(
    data.session.access_token,
    data.session.refresh_token,
    data.session.expires_at,
    data.session.expires_in,
  );
}

function parseOAuthCallbackParams(rawUrl: string): URLSearchParams {
  const parsed = new URL(rawUrl);
  const params = new URLSearchParams(parsed.search);

  if (parsed.hash) {
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }

  return params;
}



/**
 * Complete Google OAuth from a native callback URL.
 *
 * On native platforms we now use the Supabase JS SDK for the full exchange:
 *   1. supabase.auth.exchangeCodeForSession(callbackUrl) - uses the code_verifier
 *      that was stored in localStorage when buildGoogleAuthUrl() ran.
 *   2. Call /api/auth/verify with the resulting access_token to get the user
 *      profile from the backend (this endpoint already exists).
 *
 * Also handles the implicit-flow fallback (access_token in hash) for older
 * Supabase configurations.
 */
export async function completeGoogleOAuthFromCallbackUrl(callbackUrl: string): Promise<AuthResponse> {
  const normalizedUrl = callbackUrl.split('#')[0];
  if (processedOAuthCallbackUrls.has(normalizedUrl)) {
    const token = getAuthToken();
    const user = getUserData();
    if (token && user) {
      return {
        token,
        refreshToken: getRefreshToken() ?? undefined,
        expiresAt: getTokenExpiresAt() ?? undefined,
        user,
      };
    }
  }
  if (oauthCallbackInFlight === normalizedUrl) {
    throw new Error('Sign-in already in progress. Please wait.');
  }
  oauthCallbackInFlight = normalizedUrl;

  try {
    const result = await completeGoogleOAuthFromCallbackUrlInner(callbackUrl);
    processedOAuthCallbackUrls.add(normalizedUrl);
    return result;
  } finally {
    oauthCallbackInFlight = null;
  }
}

async function completeGoogleOAuthFromCallbackUrlInner(callbackUrl: string): Promise<AuthResponse> {
  const params = parseOAuthCallbackParams(callbackUrl);

  const oauthError = params.get('error') || params.get('error_description');
  if (oauthError) {
    throw new Error(oauthError);
  }

  // ── PKCE flow: let Supabase SDK exchange the code using its stored verifier ──
  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(callbackUrl);
    if (error || !data.session) {
      throw new Error(error?.message || 'Google sign-in failed. Please try again.');
    }
    return completeWithSupabaseSession(data.session.access_token, data.session.refresh_token, data.session.expires_at, data.session.expires_in);
  }

  // ── Implicit flow: access_token directly in hash fragment ──
  const accessToken = params.get('access_token');
  if (accessToken) {
    const refreshToken = params.get('refresh_token') ?? undefined;
    const expiresIn = params.get('expires_in');
    const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + Number(expiresIn) : undefined;
    return completeWithSupabaseSession(accessToken, refreshToken, expiresAt, expiresIn ? Number(expiresIn) : undefined);
  }

  // Legacy backend one-time code (not Supabase PKCE)
  const redeemCode = params.get('oauth_code');
  if (redeemCode) {
    if (!API_URL) {
      throw new Error('Backend API not configured.');
    }
    const response = await fetch(`${API_URL.replace(/\/+$/, '')}/api/auth/oauth/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: redeemCode }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to complete Google sign-in');
    }
    const data = (await response.json()) as AuthResponse & {
      returnState?: { returnTo?: string; plan?: string };
    };
    if (data.token) {
      setAuthCredentials(data.token, data.refreshToken, data.expiresAt);
    }
    if (data.user) {
      setUserData(data.user);
    }
    notifyAuthChange();
    if (data.returnState?.returnTo || data.returnState?.plan) {
      storeOAuthReturnState(data.returnState);
    }
    return data;
  }

  throw new Error('Missing sign-in token. Please try Google sign-in again.');
}

/**
 * Given a valid Supabase access_token, store credentials locally and fetch
 * the user profile from the backend's existing /api/auth/verify endpoint.
 */
async function completeWithSupabaseSession(
  accessToken: string,
  refreshToken: string | undefined,
  expiresAt: number | undefined,
  expiresIn: number | undefined,
): Promise<AuthResponse> {
  // Persist the tokens immediately so subsequent API calls are authenticated
  setAuthCredentials(accessToken, refreshToken, expiresAt);

  // Fetch user profile from the backend using the existing /api/auth/verify endpoint
  if (!API_URL) throw new Error('Backend API not configured.');
  const verifyRes = await fetch(`${API_URL.replace(/\/+$/, '')}/api/auth/verify`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch user profile after sign-in');
  }

  const data = await verifyRes.json();

  if (data.user) {
    setUserData(data.user);
  }

  notifyAuthChange();

  return {
    token: accessToken,
    refreshToken,
    expiresAt,
    expiresIn,
    user: data.user,
  };
}

/**
 * Start Google OAuth.
 * - iOS: ASWebAuthenticationSession (native sheet, intercepts syntraiq:// callback)
 * - Android: Chrome Custom Tab + deep link callback
 * - Web: full-page redirect to backend
 */
export async function startGoogleAuth(
  returnState?: { returnTo?: string; plan?: string },
): Promise<AuthResponse | void> {
  storeOAuthReturnState(returnState);
  const url = await buildGoogleAuthUrl(returnState);

  if (!Capacitor.isNativePlatform()) {
    window.location.href = url;
    return;
  }

  const result = await OAuthSession.authenticate({
    url,
    callbackScheme: NATIVE_OAUTH_SCHEME,
  });

  if (result.cancelled) {
    throw new Error('Google sign-in was cancelled.');
  }

  if (!result.callbackUrl) {
    throw new Error('Google sign-in did not return a callback URL.');
  }

  return completeGoogleOAuthFromCallbackUrl(result.callbackUrl);
}

/** Reset UI when Android OAuth tab is closed without finishing sign-in. */
export function onNativeOAuthBrowserDismissed(listener: () => void): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => undefined;
  }

  let handles: Array<{ remove: () => void }> = [];

  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      listener();
    }
  }).then((handle) => {
    handles.push(handle);
  });

  return () => {
    handles.forEach((handle) => handle.remove());
    handles = [];
  };
}

/** Called on /auth/callback for web redirects after Google sign-in. */
export async function completeGoogleOAuth(): Promise<AuthResponse> {
  const result = await completeGoogleOAuthFromCallbackUrl(window.location.href);
  if (!Capacitor.isNativePlatform()) {
    window.history.replaceState({}, document.title, '/auth/callback');
  }
  return result;
}

export async function logout(): Promise<void> {
  const token = getAuthToken();
  // Clear local session immediately so in-flight profile/verify requests
  // cannot re-hydrate the user before the UI updates.
  removeAuthToken();
  clearAllHomeChatSessions();

  if (token && API_URL) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAuthSession(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken || !API_URL) {
    return false;
  }

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          removeAuthToken();
        }
        return false;
      }

      const data: AuthResponse = await response.json();
      if (data.token) {
        setAuthCredentials(data.token, data.refreshToken, data.expiresAt);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function fetchVerifiedUser(): Promise<User | null> {
  const response = await authFetch(`${API_URL}/api/auth/verify`, { method: 'GET' });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    return getUserData();
  }

  const data = await response.json();
  setUserData(data.user);
  return data.user;
}

export async function verifyToken(): Promise<User | null> {
  if (!API_URL) {
    return getUserData();
  }

  if (!getAuthToken() && !getRefreshToken()) {
    if (getUserData()) removeAuthToken();
    return null;
  }

  try {
    await getValidToken();

    let user = await fetchVerifiedUser();

    if (!user) {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        user = await fetchVerifiedUser();
      }
    }

    if (!user) {
      // Final-stage failure: refresh didn't recover the session AND the
      // verify endpoint kept saying 401. Only hard-logout if there's no
      // refresh token left — `refreshAuthSession` clears it on a hard
      // refresh-401, so absence here proves the session is genuinely
      // gone. If a refresh token IS still present, this is more likely a
      // transient verify-endpoint hiccup; preserve the cached user so a
      // boot-time blip doesn't punt logged-in users to the login wall.
      const cached = getUserData();
      if (!getRefreshToken() && !cached) {
        removeAuthToken();
        return null;
      }
      // Either refresh token is still present (transient failure) or we
      // have a cached user profile — keep the session alive either way.
      if (cached) return cached;
      // No cached user but refresh token is present — session is probably
      // valid but the verify endpoint was unreachable. Don't log out.
      return null;
    }

    return user;
  } catch {
    // Offline / transient — keep cached profile but don't pretend verify succeeded.
    return getUserData();
  }
}

export async function initializeAuthSession(): Promise<void> {
  if (!getAuthToken() && !getRefreshToken()) {
    if (getUserData()) removeAuthToken();
    return;
  }
  await verifyToken();
}

let authSessionListenersRegistered = false;
const processedOAuthCallbackUrls = new Set<string>();
let oauthCallbackInFlight: string | null = null;

export function registerAuthSessionListeners(): void {
  if (authSessionListenersRegistered || typeof document === 'undefined') {
    return;
  }

  authSessionListenersRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void initializeAuthSession();
    }
  });

  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void initializeAuthSession();
      }
    });
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    void App.addListener('appUrlOpen', (event) => {
      void completeGoogleOAuthFromCallbackUrl(event.url).catch(() => undefined);
    });

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url?.startsWith(`${NATIVE_OAUTH_SCHEME}://`)) {
        void completeGoogleOAuthFromCallbackUrl(launch.url).catch(() => undefined);
      }
    });
  }

  // Proactively refresh before the access token expires while the app is open.
  const REFRESH_INTERVAL_MS = 4 * 60 * 1000;
  window.setInterval(() => {
    if (getRefreshToken()) {
      void getValidToken();
    }
  }, REFRESH_INTERVAL_MS);
}

export function isAuthenticated(): boolean {
  return getAuthToken() !== null || getRefreshToken() !== null;
}

/** True when we have a valid session token (profile may still be loading). */
export function isLoggedIn(): boolean {
  return isAuthenticated();
}

const AUTH_CHANGE_EVENT = 'syntraiq-auth-change';

export function notifyAuthChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

/** Subscribe to login / logout / token refresh — re-render UI when session changes. */
export function onAuthChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(AUTH_CHANGE_EVENT, listener);
  window.addEventListener('syntraiq-storage-change', listener);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, listener);
    window.removeEventListener('syntraiq-storage-change', listener);
  };
}

// Helper function to handle API responses and check for authentication errors
export async function handleApiResponse<T>(
  response: Response,
  onUnauthorized?: () => void
): Promise<T> {
  if (response.status === 401) {
    const refreshed = await refreshAuthSession();
    if (!refreshed) {
      // Don't auto-wipe the session; let the caller/UI decide
      if (onUnauthorized) {
        onUnauthorized();
      }
      const errorData = await response.json().catch(() => ({ error: 'Session expired. Please log in again.' }));
      throw new Error(errorData.error || 'Session expired. Please log in again.');
    }

    throw new Error('Session refreshed. Please retry the request.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return await response.json();
}

// Enhanced fetch wrapper that handles authentication errors
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  onUnauthorized?: () => void
): Promise<Response> {
  const isFormData = options.body instanceof FormData;

  const makeRequest = async () => {
    await getValidToken();
    const authHeaders = getAuthHeaders(!isFormData);
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...authHeaders,
      },
    });
  };

  let response = await makeRequest();
  saveTokensFromResponseHeaders(response);

  if (response.status === 401) {
    const refreshed = await refreshAuthSession();
    if (refreshed) {
      response = await makeRequest();
      saveTokensFromResponseHeaders(response);
    }
  }

  if (response.status === 401) {
    if (!getRefreshToken()) {
      removeAuthToken();
      if (onUnauthorized) {
        onUnauthorized();
      }
    }
  }

  return response;
}

/** Authenticated fetch that retries once after refreshing tokens. */
export async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return authenticatedFetch(url, options);
}

/** Attempt to refresh the session after a 401. Returns true if refreshed, false otherwise. Does NOT clear local tokens. */
export async function handleUnauthorizedResponse(): Promise<boolean> {
  const refreshed = await refreshAuthSession();
  return refreshed;
}

