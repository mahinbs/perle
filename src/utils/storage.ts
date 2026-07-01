/** Central storage keys — migrated from legacy `perle-*` names. */
export const STORAGE_KEYS = {
  userData: 'syntraiq-user-data',
  selectedModel: 'syntraiq-selected-model',
  aiFriendModel: 'syntraiq-ai-friend-model',
  aiPsychologistModel: 'syntraiq-ai-psychologist-model',
  spaceModel: 'syntraiq-space-model',
  searchHistory: 'syntraiq-search-history',
  verificationEmail: 'syntraiq-verification-email',
  verificationPlan: 'syntraiq-verification-plan',
  bookmarks: 'syntraiq-bookmarks',
  discoverCache: 'syntraiq-discover-cache-v2',
  articleCachePrefix: 'syntraiq-article-v1-',
  keepVoiceOverlayOpen: 'syntraiq-keep-voice-overlay-open',
  voiceSessionActive: 'syntraiq-voice-session-active',
  currentAnswerText: 'syntraiq-current-answer-text',
  currentWordIndex: 'syntraiq-current-word-index',
  voiceOpenSpeakFirst: 'syntraiq-voice-open-speak-first',
  speakNextAnswer: 'syntraiq-speak-next-answer',
  autoListenNext: 'syntraiq-auto-listen-next',
  voiceOutputComplete: 'syntraiq-voice-output-complete',
  triggerVoiceOutput: 'syntraiq-trigger-voice-output',
  speechRate: 'syntraiq-speech-rate',
  homeChatSession: 'syntraiq-home-chat-session',
  homeChatSessionGuest: 'syntraiq-home-chat-session-guest',
  homeChatSessionAuth: 'syntraiq-home-chat-session-auth',
  analyzeDocSession: 'syntraiq-analyze-doc-session',
} as const;

const LEGACY_KEY_MAP: Record<string, string> = {
  'perle-user-data': STORAGE_KEYS.userData,
  'perle-selected-model': STORAGE_KEYS.selectedModel,
  'perle-ai-friend-model': STORAGE_KEYS.aiFriendModel,
  'perle-ai-psychologist-model': STORAGE_KEYS.aiPsychologistModel,
  'perle-space-model': STORAGE_KEYS.spaceModel,
  'perle-search-history': STORAGE_KEYS.searchHistory,
  'perle-verification-email': STORAGE_KEYS.verificationEmail,
  'perle-verification-plan': STORAGE_KEYS.verificationPlan,
  'perle-bookmarks': STORAGE_KEYS.bookmarks,
  'perle-discover-cache-v2': STORAGE_KEYS.discoverCache,
  'perle-keep-voice-overlay-open': STORAGE_KEYS.keepVoiceOverlayOpen,
  'perle-voice-session-active': STORAGE_KEYS.voiceSessionActive,
  'perle-current-answer-text': STORAGE_KEYS.currentAnswerText,
  'perle-current-word-index': STORAGE_KEYS.currentWordIndex,
  'perle-voice-open-speak-first': STORAGE_KEYS.voiceOpenSpeakFirst,
  'perle-speak-next-answer': STORAGE_KEYS.speakNextAnswer,
  'perle-auto-listen-next': STORAGE_KEYS.autoListenNext,
  'perle-voice-output-complete': STORAGE_KEYS.voiceOutputComplete,
  'perle-trigger-voice-output': STORAGE_KEYS.triggerVoiceOutput,
  'perle-speech-rate': STORAGE_KEYS.speechRate,
};

const AUTH_TOKEN_KEY = 'syntraiq-auth-token';
const REFRESH_TOKEN_KEY = 'syntraiq-refresh-token';
const TOKEN_EXPIRES_AT_KEY = 'syntraiq-token-expires-at';
// Only truly legacy/old key names — never include AUTH_TOKEN_KEY itself
const LEGACY_AUTH_KEYS = ['perle-auth-token'];

function migrateLegacyLocalKey(legacyKey: string, modernKey: string): void {
  if (typeof window === 'undefined') return;
  const legacyValue = localStorage.getItem(legacyKey);
  if (legacyValue === null) return;
  if (localStorage.getItem(modernKey) === null) {
    localStorage.setItem(modernKey, legacyValue);
  }
  localStorage.removeItem(legacyKey);
}

export function migrateLegacyStorageKeys(): void {
  if (typeof window === 'undefined') return;

  installStorageNotifier();

  for (const [legacy, modern] of Object.entries(LEGACY_KEY_MAP)) {
    migrateLegacyLocalKey(legacy, modern);
  }

  for (const legacyAuthKey of LEGACY_AUTH_KEYS) {
    const legacyToken = localStorage.getItem(legacyAuthKey);
    if (legacyToken && !localStorage.getItem(AUTH_TOKEN_KEY)) {
      localStorage.setItem(AUTH_TOKEN_KEY, legacyToken);
    }
    localStorage.removeItem(legacyAuthKey);
  }

  const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (sessionToken && !localStorage.getItem(AUTH_TOKEN_KEY)) {
    localStorage.setItem(AUTH_TOKEN_KEY, sessionToken);
  }
  sessionStorage.removeItem(AUTH_TOKEN_KEY);

  // Legacy article cache keys use a prefix
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith('perle-article-v1-')) {
      const value = localStorage.getItem(key);
      const modernKey = key.replace('perle-article-v1-', STORAGE_KEYS.articleCachePrefix);
      if (value !== null && localStorage.getItem(modernKey) === null) {
        localStorage.setItem(modernKey, value);
      }
      localStorage.removeItem(key);
    }
  }
}

export function getLocalItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(key);
  if (value !== null) return value;

  for (const [legacy, modern] of Object.entries(LEGACY_KEY_MAP)) {
    if (modern === key) {
      const legacyValue = localStorage.getItem(legacy);
      if (legacyValue !== null) {
        localStorage.setItem(key, legacyValue);
        localStorage.removeItem(legacy);
        return legacyValue;
      }
    }
  }

  return null;
}

export function setLocalItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
  notifyStorageChange(key);
}

export function removeLocalItem(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
  notifyStorageChange(key);
}

export function getSessionAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const localToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (localToken) return localToken;

  const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (sessionToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, sessionToken);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    return sessionToken;
  }

  return null;
}

export function setSessionAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function removeSessionAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function removeRefreshToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getTokenExpiresAt(): number {
  if (typeof window === 'undefined') return 0;
  return Number(localStorage.getItem(TOKEN_EXPIRES_AT_KEY) || 0);
}

export function setTokenExpiresAt(expiresAt: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAt));
}

export function removeTokenExpiresAt(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
}

export function notifyStorageChange(key: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('syntraiq-storage-change', { detail: { key } })
  );
}

let storageNotifierInstalled = false;

/** Dispatch events when legacy code writes syntraiq/perle keys directly. */
export function installStorageNotifier(): void {
  if (typeof window === 'undefined' || storageNotifierInstalled) return;
  storageNotifierInstalled = true;

  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);

  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (key.startsWith('syntraiq-') || key.startsWith('perle-')) {
      notifyStorageChange(key);
    }
  };

  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);
    if (key.startsWith('syntraiq-') || key.startsWith('perle-')) {
      notifyStorageChange(key);
    }
  };
}

export function onStorageChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener('syntraiq-storage-change', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('syntraiq-storage-change', handler);
    window.removeEventListener('storage', handler);
  };
}
