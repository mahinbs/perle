// Vite exposes env variables via import.meta.env
const API_URL = import.meta.env.VITE_API_URL as string | undefined;

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
}

export function getStoredDarkModePreference(): boolean {
  const user = getUserData();
  return user?.darkMode === true;
}

export function initializeTheme(): void {
  applyTheme(getStoredDarkModePreference());
}

export function removeAuthToken(): void {
  if (typeof window === 'undefined') return;
  removeSessionAuthToken();
  removeRefreshToken();
  removeTokenExpiresAt();
  removeLocalItem(USER_DATA_KEY);
  applyTheme(false);
  notifyAuthChange();
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

export function getUserAvatarFallbackUrl(size = 80): string {
  const name = getUserData()?.name?.trim() || 'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=C7A869&color=111&size=${size}&bold=true&font-size=0.45`;
}

export function setUserData(user: User): void {
  if (typeof window === 'undefined') return;
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
    return { path: '/' };
  }
  if (navState?.returnTo) {
    return { path: navState.returnTo, useAuthRedirect: true };
  }
  if (navState?.plan) {
    return { path: `/subscription?plan=${navState.plan}`, useAuthRedirect: true };
  }
  return { path: '/' };
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

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        removeAuthToken();
        return null;
      }
      return token;
    }

    const data: AuthResponse = await res.json();
    if (data.token) {
      setAuthCredentials(data.token, data.refreshToken, data.expiresAt);
      return data.token;
    }
  } catch {
    // Network error — fall back to cached token
  }
  return token;
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

export async function logout(): Promise<void> {
  const token = getAuthToken();
  if (token && API_URL) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  removeAuthToken();
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
      removeAuthToken();
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

/** True when we have a stored profile AND a session token (what the UI should show). */
export function isLoggedIn(): boolean {
  return isAuthenticated() && getUserData() !== null;
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
        ...authHeaders,
        ...options.headers,
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
    } else {
      removeAuthToken();
    }
  }

  if (response.status === 401) {
    removeAuthToken();
    if (onUnauthorized) {
      onUnauthorized();
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

