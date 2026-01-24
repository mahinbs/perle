import { useCallback, useState, useEffect, useRef } from "react";
import { Header } from "../components/Header";
import { SearchBar } from "../components/SearchBar";
import { AnswerCard } from "../components/AnswerCard";
import { ConversationSidebar } from "../components/ConversationSidebar";
import { searchAPI } from "../utils/answerEngine";
import { formatQuery } from "../utils/helpers";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import { getUserData } from "../utils/auth";
import type { Mode, AnswerResult, LLMModel, UploadedFile } from "../types";

export default function HomePage() {
  const { state: currentData } = useRouterNavigation();
  const [mode, setMode] = useState<Mode>("Ask");
  const [query, setQuery] = useState<string>("");
  const [searchedQuery, setSearchedQuery] = useState<string>(""); // Track the query that was actually searched
  const [answer, setAnswer] = useState<AnswerResult | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    AnswerResult[]
  >([]); // Keep all answers in conversation
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel>("gemini-lite"); // Default to gemini-lite for free users
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [currentUploadedFiles, setCurrentUploadedFiles] = useState<UploadedFile[]>([]); // Track files for current answer
  const [newConversation, setNewConversation] = useState(false); // Flag to start new conversation
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null); // Current conversation ID
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Sidebar toggle (auto-hide)
  const [isLoadingOldConversation, setIsLoadingOldConversation] = useState(false); // Flag to disable animations
  const lastLoadedConversationIdRef = useRef<string | null>(null); // Track which conversation was loaded from sidebar
  const answerCardRef = useRef<HTMLDivElement>(null);
  const lastSearchedQueryRef = useRef<string>("");
  const isSearchingRef = useRef<boolean>(false);
  const queryRef = useRef<string>(""); // Keep query in ref to avoid stale closures

  // Load user premium status on mount and when user data changes
  useEffect(() => {
    // Load saved model preference from localStorage
    const savedModel = localStorage.getItem(
      "perle-selected-model"
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
      if (e.key === "perle-user-data") {
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
      const currentModel = localStorage.getItem(
        "perle-selected-model"
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
      localStorage.setItem("perle-selected-model", selectedModel);
    } else if (isPremium && selectedModel === "auto") {
      // Remove saved preference if user selects 'auto' (use default)
      localStorage.removeItem("perle-selected-model");
    }
  }, [selectedModel, isPremium]);

  // Load search history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("perle-search-history");
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch (e) {
        console.warn("Failed to parse search history:", e);
      }
    }
  }, []);

  // Handle search query and mode from other pages (e.g., Discover items)
  useEffect(() => {
    if (currentData?.searchQuery) {
      setQuery(currentData.searchQuery);
      // Set mode if provided
      if (
        currentData.mode &&
        ["Ask", "Research", "Summarize", "Compare"].includes(currentData.mode)
      ) {
        setMode(currentData.mode as Mode);
      }
      // Auto-trigger search when coming from Discover
      if (currentData.searchQuery) {
        setTimeout(() => {
          doSearch(currentData.searchQuery);
        }, 100);
      }
    }
  }, [currentData]);

  // Save search history to localStorage
  const saveToHistory = useCallback((newQuery: string) => {
    const formatted = formatQuery(newQuery);
    if (!formatted) return;

    setSearchHistory((prev) => {
      const updated = [formatted, ...prev.filter((q) => q !== formatted)].slice(
        0,
        10
      );
      localStorage.setItem("perle-search-history", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Update query ref whenever query changes
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const doSearch = useCallback(
    async (searchQuery?: string) => {
      // Use the provided searchQuery or get current query from ref (avoids stale closure)
      const currentQuery = searchQuery || queryRef.current;
      const q = formatQuery(currentQuery);
      if (!q) {
        setAnswer(null);
        setSearchedQuery("");
        lastSearchedQueryRef.current = "";
        return;
      }

      // Prevent duplicate searches if already searching
      if (isSearchingRef.current) {
        return;
      }

      // Prevent duplicate searches if this is the same query as the last one
      const finalQuery = searchQuery || queryRef.current;
      if (finalQuery === lastSearchedQueryRef.current) {
        return; // Don't search again if it's the same query
      }

      // Mark as searching and store the query
      isSearchingRef.current = true;
      lastSearchedQueryRef.current = finalQuery;

      // Capture current files to process for this search
      const filesToProcess = [...uploadedFiles];
      setCurrentUploadedFiles(filesToProcess);

      // Clear input immediately so they move to "Loading" state visually
      setUploadedFiles([]);

      setIsLoading(true);
      saveToHistory(q);

      // Update both query (for editing) and searchedQuery (for display)
      setQuery(finalQuery);
      setSearchedQuery(finalQuery);

      // Call the real API with uploaded files and conversation ID
      try {
        console.log(`🚀 FRONTEND SENDING: conversationId=${activeConversationId}, newConversation=${newConversation}`);
        const res = await searchAPI(q, mode, selectedModel, newConversation, filesToProcess, activeConversationId);

        console.log(`✅ FRONTEND RECEIVED: conversationId=${res.conversationId}`);
        
        // Update active conversation ID from response
        if (res.conversationId) {
          setActiveConversationId(res.conversationId);
          // Clear the loaded conversation ref when making a new search
          // This ensures new queries get typewriter effect even if continuing an old conversation
          lastLoadedConversationIdRef.current = null;
          console.log(`💾 FRONTEND SAVED: activeConversationId=${res.conversationId}`);
        }

        // Reset newConversation flag after using it (so next search continues the conversation)
        if (newConversation) {
          setNewConversation(false);
          // Start new conversation - clear history and add only this answer
          setConversationHistory([]);
        }
        // If not newConversation, keep existing history (will add to it below)

        // Set as current answer (will be moved to history above)
        // Include attachments in the answer result
        const answerWithAttachments = {
          ...res,
          attachments: filesToProcess.length > 0 ? filesToProcess : undefined
        };

        setAnswer(answerWithAttachments);

        // Update history with the answer containing attachments
        if (newConversation) {
          setConversationHistory([answerWithAttachments]);
        } else {
          // We need to replace the last added item if we want to include attachments, 
          // but doSearch adds raw 'res'. Let's fix history.
          setConversationHistory((prev) => {
            const newHistory = [...prev];
            // The last item was just added via setConversationHistory above?
            // No, React state updates are batched/async. 
            // We should modify how we update history.
            return newHistory;
          });

          // Actually, let's redo the history update logic cleanly
          setConversationHistory(prev => {
            const newHistory = newConversation ? [] : [...prev];
            newHistory.push(answerWithAttachments);
            return newHistory;
          });
        }

        // Start clearing files after successful search initiation
        // setUploadedFiles([]); // Handled at start
        // setCurrentUploadedFiles(uploadedFiles); // Handled at start
      } catch (error: any) {
        console.error("Search API error:", error);
        // Show error to user - no mock fallback
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
          mode,
          timestamp: Date.now(),
        };

        // Update conversation history with error
        if (newConversation) {
          setConversationHistory([errorAnswer]);
          setNewConversation(false);
        } else {
          setConversationHistory((prev) => [...prev, errorAnswer]);
        }

        setAnswer(errorAnswer);
      } finally {
        setIsLoading(false);
        isSearchingRef.current = false;
      }
      // Removed 'query' from dependencies to prevent re-creation on every query change
      // The function uses query from closure, which is fine since we pass it explicitly when needed
    },
    [mode, selectedModel, saveToHistory, uploadedFiles, activeConversationId, newConversation]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "k":
            e.preventDefault();
            document.querySelector("input")?.focus();
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

  // Handle pull-to-refresh on mobile
  // Pull-to-refresh handler - only trigger on intentional pull, not on scroll
  useEffect(() => {
    let startY = 0;
    let isPulling = false;
    let hasTriggered = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Only allow pull-to-refresh when at the very top of the page
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
        hasTriggered = false;
      } else {
        isPulling = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || hasTriggered) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      // Only trigger if user is pulling down (not scrolling up) and at top
      if (diff > 100 && window.scrollY === 0 && !hasTriggered) {
        // Only search if there's a previous query to refresh
        if (lastSearchedQueryRef.current) {
          doSearch(lastSearchedQueryRef.current);
        }
        hasTriggered = true;
        isPulling = false;
      }
    };

    const handleTouchEnd = () => {
      isPulling = false;
      hasTriggered = false;
    };

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [doSearch]);

  const handleQuerySelect = useCallback((selectedQuery: string) => {
    setQuery(selectedQuery);
    setShowHistory(false);
  }, []);

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setShowHistory(newQuery.length > 0);
  }, []);

  // Auto-scroll to AnswerCard when answer is received
  // Commented out - prevents scrolling to top when answer is received
  // useEffect(() => {
  //   if (answer && !isLoading && answerCardRef.current) {
  //     // Small delay to ensure the answer is rendered
  //     setTimeout(() => {
  //       answerCardRef.current?.scrollIntoView({
  //         behavior: 'smooth',
  //         block: 'start',
  //         inline: 'nearest'
  //       });
  //     }, 100);
  //   }
  // }, [answer, isLoading]);

  // Load specific conversation (no animations)
  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      setIsLoadingOldConversation(true); // Disable animations
      
      const baseUrl = import.meta.env.VITE_API_URL as string;
      const { getAuthHeaders } = await import('../utils/auth');
      
      const response = await fetch(`${baseUrl}/api/conversations/${conversationId}`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setActiveConversationId(conversationId);
        
        // Mark that we loaded this conversation from sidebar
        lastLoadedConversationIdRef.current = conversationId;
        
        // Convert messages to AnswerResult format with proper chunk structure
        const history: AnswerResult[] = data.messages.map((msg: any) => ({
          query: msg.query,
          chunks: [{ 
            text: msg.answer, 
            sourceIds: [],
            citationIds: []
          }],
          sources: [],
          mode: 'Ask' as Mode,
          timestamp: new Date(msg.created_at).getTime()
        }));
        
        setConversationHistory(history);
        setAnswer(null);
        setQuery("");
        setSearchedQuery("");
        
        // Close sidebar on mobile after selection
        setIsSidebarOpen(false);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      // Re-enable animations after a brief moment
      setTimeout(() => {
        setIsLoadingOldConversation(false);
      }, 100);
    }
  }, []);

  // Handle new conversation
  const handleNewConversation = useCallback(() => {
    console.log(`🆕 NEW CHAT CLICKED - Clearing activeConversationId`);
    setActiveConversationId(null);
    lastLoadedConversationIdRef.current = null; // Clear the loaded conversation ref
    setNewConversation(true);
    setAnswer(null);
    setConversationHistory([]);
    setSearchedQuery("");
    setQuery("");
    setIsSidebarOpen(false); // Close sidebar on mobile
  }, []);

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
      {/* Conversation Sidebar */}
      <ConversationSidebar
        activeConversationId={activeConversationId}
        onSelectConversation={loadConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Content - ORIGINAL LAYOUT */}
      <div className="container flex flex-col justify-between h-full">
        <Header />

        <>
          {/* <div className="sub text-sm" style={{ marginTop: 6 }}>
          An elegant answer engine with citations, comparisons, and summaries.
        </div> */}

          <div className="spacer-8" />
          {/* <ModeBar mode={mode} setMode={setMode} /> */}

          <div className="spacer-12" />
        <div ref={answerCardRef}>
            {/* Render all answers in conversation history */}
            {conversationHistory.map((prevAnswer, index) => {
              // Determine if this conversation was loaded from sidebar
              // If activeConversationId matches lastLoadedConversationIdRef, all items are from old conversation
              const isFromLoadedConversation = activeConversationId === lastLoadedConversationIdRef.current;
              const isLastItem = index === conversationHistory.length - 1;
              
              // Skip typewriter if:
              // 1. We're currently loading an old conversation
              // 2. This conversation was loaded from sidebar (all items should skip)
              // 3. It's not the last item (previous items in any conversation)
              // Only show typewriter for the last item if it's a new query (not from loaded conversation)
              const shouldSkipTypewriter = isLoadingOldConversation || 
                                         isFromLoadedConversation || 
                                         !isLastItem;
              
              return (
                <div
                  key={`answer-${prevAnswer.timestamp}-${index}`}
                  style={{
                    marginBottom: index < conversationHistory.length - 1 ? 24 : 0,
                    transition: isLoadingOldConversation ? 'none' : undefined,
                    animation: isLoadingOldConversation ? 'none' : undefined
                  }}
                >
                  <AnswerCard
                    chunks={prevAnswer.chunks}
                    sources={prevAnswer.sources}
                    isLoading={false}
                    mode={prevAnswer.mode || mode}
                    query={prevAnswer.query}
                    skipTypewriter={shouldSkipTypewriter}
                    attachments={prevAnswer.attachments}
                    generatedMedia={prevAnswer.generatedMedia}
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

          {/* Show current answer only if loading (it will be added to history when complete) */}
          {isLoading && (
            <AnswerCard
              chunks={[]}
              sources={[]}
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
            />
          )}
          </div>
          <div className="spacer-12" />
        </>

        <div className="sticky bottom-0 left-0 w-full mt-3">
          <SearchBar
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            query={query}
            setQuery={handleQueryChange}
            onSearch={doSearch}
            isLoading={isLoading}
            showHistory={showHistory}
            searchHistory={searchHistory}
            onQuerySelect={handleQuerySelect}
            onModelChange={setSelectedModel}
            uploadedFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
            hasAnswer={!!answer && !isLoading}
            searchedQuery={searchedQuery}
            isPremium={isPremium}
            onNewConversation={handleNewConversation}
            onMediaGenerated={handleMediaGenerated}
          />
        </div>
        {/* <div className="spacer-16" />
        <DiscoverRail /> */}

        {/* <div className="spacer-24" />
        <UpgradeCard /> */}

        {/* <div className="spacer-40" /> */}
      </div>
    </>
  );
}
