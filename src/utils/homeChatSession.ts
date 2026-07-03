import type { AnswerResult, UploadedFile } from "../types";
import { STORAGE_KEYS } from "./storage";

export type HomeChatSnapshot = {
  conversationHistory: AnswerResult[];
  answer: AnswerResult | null;
  activeConversationId: string | null;
  searchedQuery: string;
  lastSearchedKey: string;
  lastSearchedQuery: string;
  /** True when hydrated from cache — skip typewriter on restore. */
  skipTypewriter: boolean;
};

const EMPTY_SNAPSHOT: HomeChatSnapshot = {
  conversationHistory: [],
  answer: null,
  activeConversationId: null,
  searchedQuery: "",
  lastSearchedKey: "",
  lastSearchedQuery: "",
  skipTypewriter: false,
};

function cloneEmptySnapshot(): HomeChatSnapshot {
  return { ...EMPTY_SNAPSHOT, conversationHistory: [] };
}

function sanitizeAttachments(
  attachments?: UploadedFile[]
): UploadedFile[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((file) => ({
    id: file.id,
    type: file.type,
    preview: file.preview,
    file:
      file.file instanceof File
        ? file.file
        : ({
            name: (file.file as File | undefined)?.name ?? "attachment",
            type: (file.file as File | undefined)?.type ?? "",
            size: (file.file as File | undefined)?.size ?? 0,
          } as File),
  }));
}

function sanitizeAnswerResult(item: AnswerResult): AnswerResult {
  return {
    ...item,
    chunks: Array.isArray(item.chunks) ? item.chunks : [],
    attachments: sanitizeAttachments(item.attachments as any),
  };
}

function sanitizeSnapshot(snapshot: HomeChatSnapshot): HomeChatSnapshot {
  return {
    ...snapshot,
    conversationHistory: (snapshot.conversationHistory ?? []).map(sanitizeAnswerResult),
    answer: snapshot.answer ? sanitizeAnswerResult(snapshot.answer) : null,
  };
}

function serializeSnapshot(snapshot: HomeChatSnapshot) {
  const sanitized = sanitizeSnapshot(snapshot);
  return JSON.stringify({
    conversationHistory: sanitized.conversationHistory.map((item) => ({
      ...item,
      attachments: item.attachments?.map(({ id, type, preview }) => ({
        id,
        type,
        preview,
      })),
    })),
    answer: sanitized.answer
      ? {
          ...sanitized.answer,
          attachments: sanitized.answer.attachments?.map(({ id, type, preview }) => ({
            id,
            type,
            preview,
          })),
        }
      : null,
    activeConversationId: sanitized.activeConversationId,
    searchedQuery: sanitized.searchedQuery,
    lastSearchedKey: sanitized.lastSearchedKey,
    lastSearchedQuery: sanitized.lastSearchedQuery,
  });
}

export type ChatSessionStore = {
  read: () => HomeChatSnapshot | null;
  write: (snapshot: HomeChatSnapshot) => void;
  clear: () => void;
  getInitial: () => HomeChatSnapshot;
};

export function createChatSessionStore(storageKey: string): ChatSessionStore {
  let memoryCache: HomeChatSnapshot | null = null;

  function parseSnapshot(raw: string): HomeChatSnapshot | null {
    try {
      const saved = JSON.parse(raw) as Partial<HomeChatSnapshot> & {
        conversationHistory?: AnswerResult[];
      };
      if (
        !saved.conversationHistory?.length &&
        !saved.answer &&
        !saved.searchedQuery
      ) {
        return null;
      }
      return sanitizeSnapshot({
        conversationHistory: saved.conversationHistory ?? [],
        answer: saved.answer ?? null,
        activeConversationId: saved.activeConversationId ?? null,
        searchedQuery: saved.searchedQuery ?? "",
        lastSearchedKey: saved.lastSearchedKey ?? "",
        lastSearchedQuery: saved.lastSearchedQuery ?? "",
        skipTypewriter: true,
      });
    } catch {
      return null;
    }
  }

  function read(): HomeChatSnapshot | null {
    if (memoryCache) return memoryCache;
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = parseSnapshot(raw);
    if (parsed) {
      memoryCache = parsed;
      return parsed;
    }
    sessionStorage.removeItem(storageKey);
    return null;
  }

  function write(snapshot: HomeChatSnapshot): void {
    const hasContent =
      snapshot.conversationHistory.length > 0 ||
      snapshot.answer != null ||
      snapshot.searchedQuery.length > 0;

    if (!hasContent) {
      memoryCache = null;
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(storageKey);
      }
      return;
    }

    memoryCache = snapshot;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(storageKey, serializeSnapshot(snapshot));
    }
  }

  function clear(): void {
    memoryCache = null;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(storageKey);
    }
  }

  function getInitial(): HomeChatSnapshot {
    return read() ?? cloneEmptySnapshot();
  }

  return { read, write, clear, getInitial };
}

export const guestHomeChatStore = createChatSessionStore(STORAGE_KEYS.homeChatSessionGuest);

const authStoreCache = new Map<string, ChatSessionStore>();

function authStoreKey(userId: string): string {
  return `${STORAGE_KEYS.homeChatSessionAuth}:${userId}`;
}

/** Pick the session bucket for the current auth state (guest vs signed-in user). */
export function getHomeChatStore(loggedIn: boolean, userId?: string | null): ChatSessionStore {
  if (!loggedIn || !userId) return guestHomeChatStore;
  let store = authStoreCache.get(userId);
  if (!store) {
    store = createChatSessionStore(authStoreKey(userId));
    authStoreCache.set(userId, store);
  }
  return store;
}

/** Wipe guest + all per-user auth buckets — used on login/logout/account switch. */
export function clearAllHomeChatSessions(): void {
  guestHomeChatStore.clear();
  authStoreCache.forEach((store) => store.clear());
  authStoreCache.clear();
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEYS.homeChatSession);
    sessionStorage.removeItem(STORAGE_KEYS.homeChatSessionAuth);
    const prefix = `${STORAGE_KEYS.homeChatSessionAuth}:`;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) {
        sessionStorage.removeItem(key);
      }
    }
  }
}

export function getEmptyHomeChatSnapshot(): HomeChatSnapshot {
  return cloneEmptySnapshot();
}

/** @deprecated Use getHomeChatStore(loggedIn) — kept for imports that expect a default. */
export const homeChatStore = guestHomeChatStore;
export const analyzeDocStore = createChatSessionStore(STORAGE_KEYS.analyzeDocSession);

export const readHomeChatSnapshot = homeChatStore.read;
export const writeHomeChatSnapshot = homeChatStore.write;
export const clearHomeChatSnapshot = homeChatStore.clear;
export const getInitialHomeChatState = homeChatStore.getInitial;
