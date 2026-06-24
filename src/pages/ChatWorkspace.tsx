import { useCallback, useState, useEffect, useLayoutEffect, useRef } from "react";
import logo from "../assets/images/logo-1.png";
import { Header } from "../components/Header";
import { SearchBar } from "../components/SearchBar";
import { AnswerCard } from "../components/AnswerCard";
import { ConversationSidebar } from "../components/ConversationSidebar";
import { searchAPIStream, FILE_ONLY_DEFAULT_QUERY } from "../utils/answerEngine";
import { formatQuery } from "../utils/helpers";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { getUserData } from "../utils/auth";
import { getLocalItem, removeLocalItem, setLocalItem, STORAGE_KEYS } from "../utils/storage";
import type { Mode, AnswerResult, LLMModel, UploadedFile, ExperienceMode, Source } from "../types";
import { AIDataConsentModal, hasAIConsent } from "../components/AIDataConsentModal";
import {
  hasReachedDailyQueryLimit,
  incrementDailyQueryCount,
  shouldEnforceQueryLimit,
  getQueryLimitMessage,
  hasReachedLifetimeDeepLimit,
  incrementLifetimeDeepCount,
  getDeepLimitMessage,
} from "../utils/queryLimit";
import {
  CHAT_EXCHANGE_SCROLL_OFFSET,
  getActiveExchangeMinHeight,
  getExchangeScrollOffset,
  scrollExchangeToTop,
  useScrollViewportHeight,
} from "../utils/chatScroll";
import {
  homeChatStore,
  analyzeDocStore,
  type ChatSessionStore,
} from "../utils/homeChatSession";
import { FaFileAlt } from "react-icons/fa";

export type ChatWorkspaceVariant = "home" | "analyze";

const ANALYZE_DOC_TEMPLATES = [
  {
    id: "summarize",
    label: "Summarize",
    prompt: "Summarize the key points from the uploaded documents and images",
  },
  {
    id: "compare",
    label: "Compare",
    prompt: "Compare the main themes and differences across these files",
  },
  {
    id: "extract",
    label: "Extract data",
    prompt: "Extract important dates, names, figures, and action items from these files",
  },
  {
    id: "questions",
    label: "Study Q&A",
    prompt: "Generate study questions and answers based on these documents",
  },
  {
    id: "insights",
    label: "Key insights",
    prompt: "What are the most important insights and conclusions in these files?",
  },
  {
    id: "explain",
    label: "Explain simply",
    prompt: "Explain the content of these documents in simple, easy-to-understand language",
  },
];

type ChatWorkspaceProps = {
  variant?: ChatWorkspaceVariant;
};

export function ChatWorkspace({ variant = "home" }: ChatWorkspaceProps) {
  const isAnalyzePage = variant === "analyze";
  const sessionStore: ChatSessionStore = isAnalyzePage ? analyzeDocStore : homeChatStore;
  const { state: currentData, navigateTo } = useRouterNavigation();
  const restoredSnapshotRef = useRef(sessionStore.getInitial());
  const [mode, setMode] = useState<Mode>("Ask");
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("normal");
  const [hasSelectedMode, setHasSelectedMode] = useState(false);
  const [query, setQuery] = useState<string>("");
  const [searchedQuery, setSearchedQuery] = useState<string>(
    () => restoredSnapshotRef.current.searchedQuery
  );
  const [answer, setAnswer] = useState<AnswerResult | null>(
    () => restoredSnapshotRef.current.answer
  );
  const [conversationHistory, setConversationHistory] = useState<
    AnswerResult[]
  >(() => restoredSnapshotRef.current.conversationHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingSources, setStreamingSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingTextRef = useRef("");
  const streamingSourcesRef = useRef<Source[]>([]);
  const pendingBufferRef = useRef("");
  const flushTimerRef = useRef<number | null>(null);

  const startDrip = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setInterval(() => {
      const pending = pendingBufferRef.current;
      if (!pending) return;
      // Adaptive reveal: keep a smooth word-by-word feel for a small backlog,
      // but accelerate hard when the model dumps a lot so the text never lags
      // behind generation (fast, Perplexity/Claude-style streaming).
      const len = pending.length;
      const take =
        len > 600 ? 40 :
        len > 300 ? 22 :
        len > 120 ? 12 :
        len > 40 ? 7 : 4;
      const chunk = pending.slice(0, take);
      pendingBufferRef.current = pending.slice(take);
      streamingTextRef.current += chunk;
      setStreamingText((s) => s + chunk);
    }, 12);
  };

  const stopDripAndFlush = () => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (pendingBufferRef.current) {
      streamingTextRef.current += pendingBufferRef.current;
      setStreamingText((s) => s + pendingBufferRef.current);
      pendingBufferRef.current = "";
    }
  };
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel>("gemini-lite"); // Default to gemini-lite for free users
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [currentUploadedFiles, setCurrentUploadedFiles] = useState<UploadedFile[]>([]); // Track files for current answer
  const [newConversation, setNewConversation] = useState(false); // Flag to start new conversation
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    () => restoredSnapshotRef.current.activeConversationId
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Sidebar toggle (auto-hide)
  const [isLoadingOldConversation, setIsLoadingOldConversation] = useState(false); // Flag to disable animations
  const lastLoadedConversationIdRef = useRef<string | null>(null); // Track which conversation was loaded from sidebar
  // Pagination state for the loaded conversation. We start with the latest 20
  // messages and pull older 20 each time the user scrolls to the top.
  const hasMoreOlderRef = useRef<boolean>(false);
  const oldestTimestampRef = useRef<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const answerCardRef = useRef<HTMLDivElement>(null);
  const loadingCardRef = useRef<HTMLDivElement>(null);
  const streamingCardRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingAutoScrollRef = useRef(false);
  const pendingScrollOnCompleteRef = useRef(false);
  const pendingFollowUpRef = useRef(false);
  const lastSearchedKeyRef = useRef<string>(restoredSnapshotRef.current.lastSearchedKey);
  const lastSearchedQueryRef = useRef<string>(restoredSnapshotRef.current.lastSearchedQuery);
  const skipTypewriterOnRestoreRef = useRef(restoredSnapshotRef.current.skipTypewriter);
  const experienceModeRef = useRef<ExperienceMode>(experienceMode);
  const isSearchingRef = useRef<boolean>(false);
  const queryRef = useRef<string>(""); // Keep query in ref to avoid stale closures
  const navigatedSearchHandledRef = useRef(false);
  const isFirstExperienceModeEffectRef = useRef(true);
  const [showConsentModal, setShowConsentModal] = useState(() => !hasAIConsent());

  const queryLimitReached =
    shouldEnforceQueryLimit() && hasReachedDailyQueryLimit();

  const goToSubscriptionForLimit = useCallback(() => {
    navigateTo("/subscription", {
      limitReached: true,
      message: getQueryLimitMessage(),
    });
  }, [navigateTo]);

  // Persist chat across route changes (profile, subscription, etc.)
  useEffect(() => {
    sessionStore.write({
      conversationHistory,
      answer,
      activeConversationId,
      searchedQuery,
      lastSearchedKey: lastSearchedKeyRef.current,
      lastSearchedQuery: lastSearchedQueryRef.current,
      skipTypewriter: skipTypewriterOnRestoreRef.current,
    });
  }, [conversationHistory, answer, activeConversationId, searchedQuery, sessionStore]);

  // Save snapshot synchronously on unmount so the next mount hydrates instantly
  useEffect(() => {
    return () => {
      sessionStore.write({
        conversationHistory,
        answer,
        activeConversationId,
        searchedQuery,
        lastSearchedKey: lastSearchedKeyRef.current,
        lastSearchedQuery: lastSearchedQueryRef.current,
        skipTypewriter: true,
      });
    };
  }, [conversationHistory, answer, activeConversationId, searchedQuery, sessionStore]);

  // Clear stale voice-session flags when home mounts (prevents ghost re-searches)
  useEffect(() => {
    if (!isAnalyzePage) {
      removeLocalItem(STORAGE_KEYS.keepVoiceOverlayOpen);
      removeLocalItem(STORAGE_KEYS.voiceSessionActive);
      removeLocalItem(STORAGE_KEYS.autoListenNext);
      removeLocalItem(STORAGE_KEYS.speakNextAnswer);
    }
  }, [isAnalyzePage]);

  // Load user premium status on mount and when user data changes
  useEffect(() => {
    // Load saved model preference from localStorage
    const savedModel = getLocalItem(
      STORAGE_KEYS.selectedModel
    ) as LLMModel | null;

    const updatePremiumStatus = (isInitialLoad = false) => {
      const user = getUserData();
      if (user) {
        const premium = user.isPremium ?? false;
        setIsPremium(premium);

        // Only set default model on initial load or if no saved preference
        if (isInitialLoad) {
          if (savedModel && premium) {
            // Restore saved model if user is premium
            setSelectedModel(savedModel);
          } else if (premium) {
            setSelectedModel("auto"); // Premium users default to 'auto'
          } else {
            setSelectedModel("gemini-lite"); // Free users always use gemini-lite
          }
        }
        // Don't reset model on subsequent updates - keep user's selection
      } else {
        // Not logged in = free user
        setIsPremium(false);
        if (isInitialLoad) {
          setSelectedModel("gemini-lite");
        }
      }
    };

    // Initial load only
    updatePremiumStatus(true);

    // Listen for storage changes (when user logs in/out or premium status changes)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.userData || e.key === "perle-user-data") {
        const user = getUserData();
        if (user) {
          const premium = user.isPremium ?? false;
          setIsPremium(premium);
          // Don't reset model - keep user's selection
          if (!premium && selectedModel !== "gemini-lite") {
            setSelectedModel("gemini-lite");
          }
        } else {
          setIsPremium(false);
          if (selectedModel !== "gemini-lite") {
            setSelectedModel("gemini-lite");
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also check periodically (for same-tab updates) - but don't reset model
    const interval = setInterval(() => {
      const user = getUserData();
      const currentModel = getLocalItem(
        STORAGE_KEYS.selectedModel
      ) as LLMModel | null;
      if (user) {
        const premium = user.isPremium ?? false;
        setIsPremium(premium);
        // Don't reset model - keep user's selection
        // Only force gemini-lite for free users
        if (!premium) {
          setSelectedModel("gemini-lite");
        } else if (currentModel) {
          // Restore saved model for premium users
          setSelectedModel(currentModel);
        }
      } else {
        setIsPremium(false);
        setSelectedModel("gemini-lite");
      }
    }, 2000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []); // Remove selectedModel from dependencies to prevent reset loop

  // Ensure free users always use gemini-lite (even if they try to change it)
  useEffect(() => {
    if (!isPremium && selectedModel !== "gemini-lite") {
      setSelectedModel("gemini-lite");
    }
  }, [isPremium, selectedModel]);

  // Save model selection to localStorage when it changes (for premium users)
  useEffect(() => {
    if (isPremium && selectedModel !== "auto") {
      setLocalItem(STORAGE_KEYS.selectedModel, selectedModel);
    } else if (isPremium && selectedModel === "auto") {
      removeLocalItem(STORAGE_KEYS.selectedModel);
    }
  }, [selectedModel, isPremium]);

  // Load search history from localStorage on mount
  useEffect(() => {
    const saved = getLocalItem(STORAGE_KEYS.searchHistory);
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch (e) {
        console.warn("Failed to parse search history:", e);
      }
    }
  }, []);

  // Save search history to localStorage
  const appendConversationAnswer = useCallback(
    (prev: AnswerResult[], item: AnswerResult): AnswerResult[] => {
      if (prev.length === 0) return [item];
      const last = prev[prev.length - 1];
      // Replace back-to-back duplicate entries (same query within 10s)
      if (
        last.query === item.query &&
        Math.abs((last.timestamp ?? 0) - (item.timestamp ?? 0)) < 10000
      ) {
        return [...prev.slice(0, -1), item];
      }
      return [...prev, item];
    },
    []
  );

  const saveToHistory = useCallback((newQuery: string) => {
    const formatted = formatQuery(newQuery);
    if (!formatted) return;

    setSearchHistory((prev) => {
      const updated = [formatted, ...prev.filter((q) => q !== formatted)].slice(
        0,
        10
      );
      setLocalItem(STORAGE_KEYS.searchHistory, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Update query ref whenever query changes
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    experienceModeRef.current = experienceMode;
  }, [experienceMode]);

  // Allow re-searching the same query only when experience mode actually changes
  useEffect(() => {
    if (isFirstExperienceModeEffectRef.current) {
      isFirstExperienceModeEffectRef.current = false;
      return;
    }
    lastSearchedKeyRef.current = "";
  }, [experienceMode]);

  const doSearch = useCallback(
    async (searchQuery?: string) => {
      const currentQuery = searchQuery ?? queryRef.current;
      const displayQuery = formatQuery(currentQuery);
      const filesToProcess = [...uploadedFiles];

      let q = displayQuery;
      if (!q && filesToProcess.length > 0) {
        q = FILE_ONLY_DEFAULT_QUERY;
      }

      if (q && /\b(sleep disorder|sleep disorders|insomnia|can't sleep|cannot sleep|trouble sleeping)\b/i.test(q)) {
        navigateTo("/sleep-disorders");
        return;
      }
      if (!q) {
        setAnswer(null);
        setSearchedQuery("");
        lastSearchedKeyRef.current = "";
        return;
      }

      if (shouldEnforceQueryLimit() && hasReachedDailyQueryLimit()) {
        goToSubscriptionForLimit();
        return;
      }

      // Deep research: free users get ONE lifetime use (it's heavy + slow).
      const isDeepSearch = experienceModeRef.current === "deep_research";
      if (isDeepSearch && shouldEnforceQueryLimit() && hasReachedLifetimeDeepLimit()) {
        navigateTo("/subscription", {
          limitReached: true,
          message: getDeepLimitMessage(),
        });
        return;
      }

      // Prevent duplicate searches if already searching
      if (isSearchingRef.current) {
        return;
      }

      const finalQuery = q;
      const activeExperienceMode = experienceModeRef.current;
      const searchKey = `${activeExperienceMode}:${finalQuery}`;
      if (searchKey === lastSearchedKeyRef.current) {
        return;
      }

      isSearchingRef.current = true;
      lastSearchedKeyRef.current = searchKey;
      lastSearchedQueryRef.current = finalQuery;
      skipTypewriterOnRestoreRef.current = false;

      setCurrentUploadedFiles(filesToProcess);

      // Clear input immediately so they move to "Loading" state visually
      setUploadedFiles([]);

      // Pin the new exchange at the top; older Q&A scroll up out of view.
      pendingAutoScrollRef.current = true;
      pendingScrollOnCompleteRef.current = true;
      pendingFollowUpRef.current = conversationHistory.length > 0;
      setIsLoading(true);
      setIsStreaming(false);
      stopDripAndFlush();
      streamingTextRef.current = "";
      streamingSourcesRef.current = [];
      pendingBufferRef.current = "";
      setStreamingText("");
      setStreamingSources([]);
      saveToHistory(q);

      if (shouldEnforceQueryLimit()) {
        incrementDailyQueryCount();
        if (isDeepSearch) {
          incrementLifetimeDeepCount();
        }
      }

      setQuery(displayQuery);
      setSearchedQuery(displayQuery || "📎 Attached files");

      // Call the real API with uploaded files and conversation ID
      try {
        const isContinuationFollowUp = (text: string): boolean => {
          const lower = text.toLowerCase().trim();
          const continuationPhrases = [
            "explain in detail",
            "explain more",
            "more details",
            "in detail",
            "tell me more",
            "go deeper",
            "elaborate",
            "continue",
          ];
          return continuationPhrases.some((p) => lower.includes(p));
        };

        const getLastNonEmptySources = () => {
          for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const maybeSources = (conversationHistory[i] as any)?.sources;
            if (Array.isArray(maybeSources) && maybeSources.length > 0) {
              return maybeSources;
            }
          }
          return [];
        };

        console.log(`🚀 FRONTEND SENDING: conversationId=${activeConversationId}, newConversation=${newConversation}`);
        // Build history for the backend. Skip exchanges with empty query or
        // empty assistant text — empty content fails the server's zod min(1)
        // check and surfaces as "Invalid request". (Happens when a prior stream
        // ended without any tokens, e.g. transient Gemini 503.)
        const localConversationHistory = conversationHistory
          .slice(-10)
          .flatMap((item) => {
            const q = (item.query || "").trim();
            const a = item.chunks.map((c) => c.text).join("\n\n").trim();
            if (!q || !a) return [];
            return [
              { role: "user" as const, content: q },
              { role: "assistant" as const, content: a },
            ];
          });
        const backendMode: Mode =
          activeExperienceMode === "normal" ? "Ask" : "Research";
        const backendSearchType: 'auto' | 'instant' | 'deep' =
          activeExperienceMode === "normal"
            ? "auto"
            : activeExperienceMode === "web_search"
            ? "instant"
            : "deep";
        const isExaShortcutModel =
          selectedModel === "exa-auto" ||
          selectedModel === "exa-instant" ||
          selectedModel === "exa-deep";
        const effectiveSearchType: "auto" | "instant" | "deep" =
          selectedModel === "exa-auto"
            ? "auto"
            : selectedModel === "exa-instant"
            ? "instant"
            : selectedModel === "exa-deep"
            ? "deep"
            : backendSearchType;
        const effectiveModel: LLMModel = isExaShortcutModel ? "auto" : selectedModel;

        // Always stream — including when files are attached. The backend's
        // /api/stream endpoint accepts the same multipart upload contract as
        // /api/search, so describe-this-image / explain-this-doc requests
        // now drip in tokens just like plain queries. Was previously
        // split-pathed into a one-shot searchAPI which gave the user a
        // stuck-on-spinner experience until the full answer arrived.
        {
          await searchAPIStream(
            q,
            backendMode,
            effectiveModel,
            newConversation,
            activeConversationId,
            localConversationHistory,
            effectiveSearchType,
            {
              onMeta: (convId) => {
                if (convId) {
                  setActiveConversationId(convId);
                  lastLoadedConversationIdRef.current = null;
                }
              },

              onSources: (sources) => {
                streamingSourcesRef.current = sources;
                setStreamingSources(sources);
                setIsLoading(false);
                setIsStreaming(true);
              },

              onToken: (text) => {
                pendingBufferRef.current += text;
                startDrip();
              },

              onDone: (suggestedQuestions, cleanText) => {
                stopDripAndFlush();
                skipTypewriterOnRestoreRef.current = true;
                setIsStreaming(false);

                let finalSources = streamingSourcesRef.current;
                if (
                  finalSources.length === 0 &&
                  !newConversation &&
                  isContinuationFollowUp(q)
                ) {
                  const fallbackSources = getLastNonEmptySources();
                  if (fallbackSources.length > 0) {
                    finalSources = fallbackSources as Source[];
                  }
                }

                const wasNewConversation = newConversation;
                if (wasNewConversation) {
                  setNewConversation(false);
                }

                // The backend's `cleanText` is the authoritative full answer.
                // If the streamed text is shorter (e.g. model leaked the
                // SUGGESTED_FOLLOWUPS marker mid-stream and we stopped
                // emitting tokens, or a network blip dropped the tail),
                // prefer cleanText so the UI shows the complete answer.
                const streamed = streamingTextRef.current || "";
                const useCleanText =
                  cleanText &&
                  cleanText.trim().length > 0 &&
                  cleanText.length > streamed.length + 50; // 50-char fudge for trivial diffs
                const finalText = useCleanText ? cleanText : streamed;
                if (useCleanText) {
                  console.warn(
                    `[stream] streamed text (${streamed.length}) shorter than cleanText (${cleanText.length}) — using cleanText`,
                  );
                  // Also reflect on screen so the user sees the full version
                  setStreamingText(cleanText);
                  streamingTextRef.current = cleanText;
                }

                const finalAnswer: AnswerResult = {
                  sources: finalSources,
                  chunks: [
                    {
                      text: finalText,
                      citationIds: finalSources.slice(0, 2).map((s) => s.id),
                      confidence: 0.9,
                    },
                  ],
                  query: q,
                  mode: backendMode,
                  timestamp: Date.now(),
                  suggestedQuestions,
                  // wasStreamed=true tells the history AnswerCard to skip typewriter
                  // and show the full text immediately — prevents blank-frame flash.
                  wasStreamed: true,
                  attachments:
                    filesToProcess.length > 0 ? filesToProcess : undefined,
                };

                // Clear streaming state AFTER finalAnswer is built so the
                // streaming card content is still visible until the commit.
                setStreamingText("");
                setStreamingSources([]);
                streamingTextRef.current = "";
                streamingSourcesRef.current = [];

                setAnswer(finalAnswer);

                if (wasNewConversation) {
                  setConversationHistory([finalAnswer]);
                } else {
                  setConversationHistory((prev) =>
                    appendConversationAnswer(prev, finalAnswer)
                  );
                }

                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    skipTypewriterOnRestoreRef.current = false;
                  })
                );
              },

              onError: (msg) => {
                stopDripAndFlush();
                throw new Error(msg);
              },
            },
            filesToProcess,
          );
        }
      } catch (error: any) {
        console.error("Search API error:", error);
        stopDripAndFlush();
        setIsStreaming(false);
        streamingTextRef.current = "";
        streamingSourcesRef.current = [];
        pendingBufferRef.current = "";
        setStreamingText("");
        setStreamingSources([]);

        // Server-side free-tier limit hit (e.g. localStorage cleared to bypass the
        // client gate) → route to the upgrade page with the server's message.
        if (error?.limitReached) {
          setIsLoading(false);
          isSearchingRef.current = false;
          navigateTo("/subscription", {
            limitReached: true,
            message:
              error.limitKind === "deep" ? getDeepLimitMessage() : getQueryLimitMessage(),
          });
          return;
        }

        // Show error to user - no mock fallback
        const backendMode: Mode =
          experienceMode === "normal" ? "Ask" : "Research";

        const errorAnswer = {
          chunks: [
            {
              text: `Error: ${error.message ||
                "Failed to get answer from API. Please check your backend server is running."
                }`,
              citationIds: [],
              confidence: 0,
            },
          ],
          sources: [],
          query: q,
                mode: backendMode,
          timestamp: Date.now(),
        };

        // Update conversation history with error
        if (newConversation) {
          setConversationHistory([errorAnswer]);
          setNewConversation(false);
        } else {
          setConversationHistory((prev) =>
            appendConversationAnswer(prev, errorAnswer)
          );
        }

        setAnswer(errorAnswer);
      } finally {
        setIsLoading(false);
        isSearchingRef.current = false;
      }
      // Removed 'query' from dependencies to prevent re-creation on every query change
      // The function uses query from closure, which is fine since we pass it explicitly when needed
    },
    [mode, selectedModel, saveToHistory, uploadedFiles, activeConversationId, newConversation, conversationHistory, experienceMode, navigateTo, appendConversationAnswer, goToSubscriptionForLimit]
  );

  // Handle search query from other pages (e.g., Discover, Profile history)
  useEffect(() => {
    if (isAnalyzePage) return;
    const navQuery = currentData?.searchQuery?.trim();
    if (!navQuery) return;
    if (navigatedSearchHandledRef.current) return;
    navigatedSearchHandledRef.current = true;

    const navMode =
      currentData.mode &&
      ["Ask", "Research", "Summarize", "Compare"].includes(currentData.mode)
        ? (currentData.mode as Mode)
        : "Ask";

    const searchKey = `${experienceModeRef.current}:${navQuery}`;
    if (
      lastSearchedKeyRef.current === searchKey &&
      conversationHistory.some((item) => item.query === navQuery)
    ) {
      setQuery(navQuery);
      setMode(navMode);
      return;
    }

    skipTypewriterOnRestoreRef.current = false;
    setQuery(navQuery);
    setMode(navMode);
    setTimeout(() => {
      doSearch(navQuery);
    }, 100);
  }, [
    currentData?.searchQuery,
    currentData?.mode,
    conversationHistory,
    doSearch,
  ]);

  const hasStarted = conversationHistory.length > 0 || isLoading || isStreaming;

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "k":
            e.preventDefault();
            document
              .querySelector<HTMLTextAreaElement>("textarea.search-input-scrollbar")
              ?.focus();
            break;
          case "Enter":
            e.preventDefault();
            doSearch();
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [doSearch]);

  // Pull-to-refresh disabled — accidental touches when returning from other pages re-ran searches.

  const handleQuerySelect = useCallback((selectedQuery: string) => {
    setQuery(selectedQuery);
    setShowHistory(false);
  }, []);

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setShowHistory(newQuery.length > 0);
  }, []);

  const scrollViewportHeight = useScrollViewportHeight(scrollContainerRef);
  const activeExchangeMinHeight = getActiveExchangeMinHeight(
    scrollViewportHeight,
    CHAT_EXCHANGE_SCROLL_OFFSET,
    conversationHistory.length > 0 && (isLoading || isStreaming)
  );

  const pinActiveExchange = useCallback((target: HTMLElement | null, isFollowUp?: boolean) => {
    const container = scrollContainerRef.current;
    if (!container || !target) return;

    const followUp = isFollowUp ?? pendingFollowUpRef.current;
    const offset = getExchangeScrollOffset(followUp);
    const minH = getActiveExchangeMinHeight(container.clientHeight, offset, followUp);
    if (minH) {
      target.style.minHeight = `${minH}px`;
    }

    scrollExchangeToTop(container, target, { behavior: "auto", offset });
  }, []);

  // ChatGPT-style UX: pin the new question + answer at the top of the scroll area.
  useLayoutEffect(() => {
    if (!isLoading) return;
    if (!pendingAutoScrollRef.current) return;

    const target = loadingCardRef.current;
    if (!target) return;

    pendingAutoScrollRef.current = false;
    pinActiveExchange(target, pendingFollowUpRef.current);
  }, [isLoading, conversationHistory.length, pinActiveExchange]);

  // Pin streaming card when tokens start flowing.
  useLayoutEffect(() => {
    if (!isStreaming) return;

    const target = streamingCardRef.current;
    if (!target) return;

    pinActiveExchange(target, pendingFollowUpRef.current);
  }, [isStreaming, pinActiveExchange]);

  // Keep the completed answer pinned after the loading card is replaced.
  useLayoutEffect(() => {
    if (isLoading || isStreaming || conversationHistory.length === 0) return;
    if (!pendingScrollOnCompleteRef.current) return;
    pendingScrollOnCompleteRef.current = false;

    const wrapper = answerCardRef.current;
    if (!wrapper) return;

    const exchanges = wrapper.querySelectorAll<HTMLElement>("[data-chat-exchange]");
    const lastExchange = exchanges[exchanges.length - 1];
    if (lastExchange) {
      pinActiveExchange(lastExchange, pendingFollowUpRef.current);
    }
  }, [isLoading, isStreaming, conversationHistory.length, pinActiveExchange]);

  // Load latest page (20) of a specific conversation. Older pages are pulled
  // on scroll via loadOlderMessages.
  const PAGE_SIZE = 20;
  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      setIsLoadingOldConversation(true); // Disable animations
      hasMoreOlderRef.current = false;
      oldestTimestampRef.current = null;

      const baseUrl = import.meta.env.VITE_API_URL as string;
      const { getAuthHeaders } = await import('../utils/auth');

      const response = await fetch(
        `${baseUrl}/api/conversations/${conversationId}?limit=${PAGE_SIZE}`,
        { headers: getAuthHeaders() },
      );

      if (response.ok) {
        const data = await response.json();
        setActiveConversationId(conversationId);
        lastLoadedConversationIdRef.current = conversationId;

        const history: AnswerResult[] = data.messages.map((msg: any) => ({
          query: msg.query,
          chunks: [{ text: msg.answer, sourceIds: [], citationIds: [] }],
          sources: [],
          mode: 'Ask' as Mode,
          timestamp: new Date(msg.created_at).getTime(),
        }));

        setConversationHistory(history);
        // Track pagination cursor for "load older on scroll-up".
        hasMoreOlderRef.current = Boolean(data.hasMore);
        oldestTimestampRef.current = data.oldestTimestamp || null;

        setAnswer(null);
        setQuery("");
        setSearchedQuery("");
        setIsSidebarOpen(false);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setTimeout(() => setIsLoadingOldConversation(false), 100);
    }
  }, []);

  // Pull the previous 20 messages, prepend them to the in-memory list, and
  // preserve the user's current scroll position so the view doesn't jump.
  const loadOlderMessages = useCallback(async () => {
    const convId = lastLoadedConversationIdRef.current;
    const before = oldestTimestampRef.current;
    if (!convId || !before || !hasMoreOlderRef.current || isLoadingOlder) return;
    setIsLoadingOlder(true);

    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    try {
      const baseUrl = import.meta.env.VITE_API_URL as string;
      const { getAuthHeaders } = await import('../utils/auth');
      const url = `${baseUrl}/api/conversations/${convId}?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`;
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      const older: AnswerResult[] = (data.messages || []).map((msg: any) => ({
        query: msg.query,
        chunks: [{ text: msg.answer, sourceIds: [], citationIds: [] }],
        sources: [],
        mode: 'Ask' as Mode,
        timestamp: new Date(msg.created_at).getTime(),
      }));
      if (older.length > 0) {
        setConversationHistory((prev) => [...older, ...prev]);
      }
      hasMoreOlderRef.current = Boolean(data.hasMore);
      oldestTimestampRef.current = data.oldestTimestamp || oldestTimestampRef.current;

      // Restore scroll position so the just-loaded items appear above the
      // user's current view rather than yanking them to the top.
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current;
        if (!c) return;
        const newScrollHeight = c.scrollHeight;
        c.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      });
    } catch (e) {
      console.warn('Failed to load older messages:', e);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder]);

  // Scroll listener: when user scrolls within ~200px of the top, fetch older.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (container.scrollTop < 200) void loadOlderMessages();
      });
    };
    container.addEventListener('scroll', handler, { passive: true });
    return () => container.removeEventListener('scroll', handler);
  }, [loadOlderMessages]);

  // Handle new conversation
  const handleNewConversation = useCallback(() => {
    if (shouldEnforceQueryLimit() && hasReachedDailyQueryLimit()) {
      goToSubscriptionForLimit();
      return;
    }

    console.log(`🆕 NEW CHAT CLICKED - Clearing activeConversationId`);
    sessionStore.clear();
    lastSearchedKeyRef.current = "";
    lastSearchedQueryRef.current = "";
    skipTypewriterOnRestoreRef.current = false;
    setActiveConversationId(null);
    lastLoadedConversationIdRef.current = null;
    setNewConversation(true);
    setAnswer(null);
    setConversationHistory([]);
    setSearchedQuery("");
    setQuery("");
    setIsSidebarOpen(false);
  }, [navigateTo, goToSubscriptionForLimit, sessionStore]);

  // Handle conversation deletion
  const handleDeleteConversation = useCallback((conversationId: string) => {
    if (activeConversationId === conversationId) {
      // If deleting active conversation, start new one
      handleNewConversation();
    }
  }, [activeConversationId, handleNewConversation]);

  // Handle media generation (image/video) - add to conversation
  const handleMediaGenerated = useCallback((media: { type: 'image' | 'video'; url: string; prompt: string }) => {
    console.log(`🎨 Media generated (${media.type}): ${media.prompt}`);

    // Create a fake answer result to display the generated media
    const mediaAnswer: AnswerResult = {
      chunks: [{
        text: media.type === 'image'
          ? `Generated image: "${media.prompt}"`
          : `Generated video: "${media.prompt}"`,
        citationIds: [],
        confidence: 1
      }],
      sources: [],
      query: media.prompt,
      mode: 'Ask',
      timestamp: Date.now(),
      generatedMedia: media // Add media to the answer
    };

    // Add to conversation history so it appears in chat
    setConversationHistory(prev => [...prev, mediaAnswer]);
    setAnswer(mediaAnswer);

    // Update searchedQuery so the UI shows the prompt
    setSearchedQuery(media.prompt);
  }, []);

  return (
    <>
      {/* AI Data Consent Modal — shown once before first AI interaction */}
      {showConsentModal && (
        <AIDataConsentModal onAccept={() => setShowConsentModal(false)} />
      )}
      {/* Conversation Sidebar */}
      <ConversationSidebar
        activeConversationId={activeConversationId}
        onSelectConversation={loadConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Content */}
      <div className="container !px-2 !pb-0 flex flex-col h-dvh overflow-hidden relative">
        {/* Background Logo */}
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none -translate-y-[5%] z-0 opacity-[0.1] select-none dark:invert">
          <img
            src={logo}
            alt=""
            className="w-[70%] max-w-[400px] h-auto object-contain grayscale"
          />
        </div>

        <div className="relative z-10 flex flex-col flex-1 min-h-0">
          <Header onOpenSidebar={() => setIsSidebarOpen(true)} />

          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain overflow-anchor-none no-scrollbar flex flex-col"
          >
          <div className="spacer-4" />
          {isAnalyzePage && !hasStarted && (
            <div className="px-2 mb-4">
              <div className="sub text-sm font-semibold mb-3 uppercase tracking-wide opacity-70">
                Analysis prompts
              </div>
              <div
                className="flex gap-3 overflow-x-auto pb-2 no-scrollbar"
                style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
              >
                {ANALYZE_DOC_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setQuery(template.prompt);
                      setShowHistory(false);
                    }}
                    className="glass-card border border-[var(--border)] rounded-xl p-4 text-left hover:border-[var(--accent)] transition-colors shrink-0"
                    style={{ width: 200, scrollSnapAlign: "start" }}
                  >
                    <FaFileAlt size={16} className="text-[var(--accent)] mb-2" />
                    <div className="text-sm font-semibold mb-1">{template.label}</div>
                    <div className="text-xs opacity-60 line-clamp-2">{template.prompt}</div>
                  </button>
                ))}
              </div>
              <p className="sub text-sm mt-2 opacity-70">
                Attach up to {isPremium ? 5 : 2} PDFs, documents, or images, then ask your question.
              </p>
            </div>
          )}
          <div ref={answerCardRef}>
            {conversationHistory.map((prevAnswer, index) => {
              // Determine if this conversation was loaded from sidebar
              // If activeConversationId matches lastLoadedConversationIdRef (and isn't null), all items are from old conversation
              const isFromLoadedConversation = Boolean(lastLoadedConversationIdRef.current) && activeConversationId === lastLoadedConversationIdRef.current;
              const isLastItem = index === conversationHistory.length - 1;

              // Skip typewriter if:
              // 1. We're currently loading an old conversation
              // 2. This conversation was loaded from sidebar (all items should skip)
              // 3. It's not the last item (previous items in any conversation)
              // Only show typewriter for the last item if it's a new query (not from loaded conversation)
              const shouldSkipTypewriter = isLoadingOldConversation ||
                isFromLoadedConversation ||
                skipTypewriterOnRestoreRef.current ||
                !isLastItem ||
                // Skip typewriter for answers that were streamed live —
                // text was already shown progressively in the streaming card.
                Boolean(prevAnswer.wasStreamed);
              const isActiveExchange = !isLoading && !isStreaming && isLastItem;
              const exchangeMinHeight =
                isActiveExchange && scrollViewportHeight > 0
                  ? getActiveExchangeMinHeight(
                      scrollViewportHeight,
                      CHAT_EXCHANGE_SCROLL_OFFSET,
                      conversationHistory.length > 1
                    )
                  : undefined;

              return (
                <div
                  key={`answer-${prevAnswer.timestamp}-${index}`}
                  data-chat-exchange
                  style={{
                    marginBottom: index < conversationHistory.length - 1 ? 5 : 0,
                    transition: isLoadingOldConversation ? 'none' : undefined,
                    animation: isLoadingOldConversation ? 'none' : undefined,
                    ...(exchangeMinHeight ? { minHeight: exchangeMinHeight } : {}),
                  }}
                >
                  <AnswerCard
                    chunks={prevAnswer.chunks}
                    sources={prevAnswer.sources}
                    suggestedQuestions={prevAnswer.suggestedQuestions || []}
                    isLoading={false}
                    mode={prevAnswer.mode || mode}
                    query={prevAnswer.query}
                    skipTypewriter={shouldSkipTypewriter}
                    attachments={prevAnswer.attachments}
                    generatedMedia={prevAnswer.generatedMedia}
                    hideSources={false}
                    onQueryEdit={(editedQuery) => {
                      setQuery(editedQuery);
                      doSearch(editedQuery);
                    }}
                    onSearch={(searchQuery, searchMode) => {
                      if (searchMode) {
                        setMode(searchMode);
                      }
                      setQuery(searchQuery);
                      doSearch(searchQuery);
                    }}
                  />
                </div>
              );
            })}

            {isStreaming && streamingText.length === 0 && (
              <AnswerCard
                chunks={[]}
                sources={streamingSources}
                isLoading={true}
                query={searchedQuery}
                attachments={currentUploadedFiles}
                // Sources reveal only on the final answer, after streaming completes.
                hideSources={true}
              />
            )}
            {isStreaming && streamingText.length > 0 && (
              <div
                ref={streamingCardRef}
                data-chat-exchange
                style={{
                  scrollMarginTop: getExchangeScrollOffset(
                    conversationHistory.length > 0
                  ),
                  ...(activeExchangeMinHeight
                    ? { minHeight: activeExchangeMinHeight }
                    : {}),
                }}
              >
                <AnswerCard
                  chunks={[
                    {
                      text: streamingText,
                      citationIds: [],
                      confidence: 0.9,
                    },
                  ]}
                  sources={streamingSources}
                  isLoading={false}
                  mode={mode}
                  query={searchedQuery}
                  skipTypewriter={true}
                  // isStreamingAnswer=true → renders plain pre-wrap text + blinking cursor.
                  // This is lightweight (no markdown parse on every token) and prevents
                  // expensive formatText() calls for each incoming character.
                  isStreamingAnswer={true}
                  suggestedQuestions={[]}
                  attachments={currentUploadedFiles}
                  // Sources show only on the final answer, after streaming completes.
                  hideSources={true}
                />
              </div>
            )}

            {isLoading && (
              <div
                ref={loadingCardRef}
                data-chat-exchange
                style={{
                  scrollMarginTop: getExchangeScrollOffset(
                    conversationHistory.length > 0
                  ),
                  ...(activeExchangeMinHeight
                    ? { minHeight: activeExchangeMinHeight }
                    : {}),
                }}
              >
                <AnswerCard
                  chunks={[]}
                  sources={[]}
                  suggestedQuestions={[]}
                  isLoading={true}
                  mode={mode}
                  query={searchedQuery}
                  onQueryEdit={(editedQuery) => {
                    setQuery(editedQuery);
                    doSearch(editedQuery);
                  }}
                  onSearch={(searchQuery, searchMode) => {
                    if (searchMode) {
                      setMode(searchMode);
                    }
                    setQuery(searchQuery);
                    doSearch(searchQuery);
                  }}
                  attachments={currentUploadedFiles}
                  hideSources={false}
                />
              </div>
            )}

          </div>
          <div className="spacer-12" />
          </div>

        <div className="shrink-0 sticky bottom-0 left-0 w-full mt-3 input-bar-safe-bottom">
          <SearchBar
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            query={query}
            setQuery={handleQueryChange}
            onSearch={doSearch}
            isLoading={isLoading || isStreaming}
            showHistory={showHistory}
            searchHistory={searchHistory}
            onQuerySelect={handleQuerySelect}
            onModelChange={setSelectedModel}
            uploadedFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
            hasAnswer={
              !isLoading && !isStreaming && (!!answer || conversationHistory.length > 0)
            }
            answer={answer}
            currentAnswerText={
              (answer?.chunks?.map((c) => c.text).join(" ").trim()) ||
              (conversationHistory.length > 0
                ? conversationHistory[conversationHistory.length - 1].chunks
                    ?.map((c) => c.text)
                    .join(" ")
                    .trim()
                : "")
            }
            searchedQuery={searchedQuery}
            isPremium={isPremium}
            onNewConversation={handleNewConversation}
            onMediaGenerated={handleMediaGenerated}
            experienceMode={experienceMode}
            onExperienceModeChange={(mode) => {
              if (!hasSelectedMode) {
                setHasSelectedMode(true);
              }
              setExperienceMode(mode);
            }}
            showModelSelector={isPremium}
            queryLimitReached={queryLimitReached}
            onQueryLimitReached={goToSubscriptionForLimit}
            pageContext={variant}
          />
        </div>
        {/* <div className="spacer-16" />
        <DiscoverRail /> */}

        {/* <div className="spacer-24" />
        <UpgradeCard /> */}

        {/* <div className="spacer-40" /> */}
        </div>
      </div>
    </>
  );
}
