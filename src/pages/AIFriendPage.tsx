import { useState, useRef, useEffect, useLayoutEffect, useCallback, Fragment, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import MicWaveIcon from "../components/MicWaveIcon";
import HeadsetWaveIcon from "../components/HeadsetWaveIcon";
import { Capacitor } from "@capacitor/core";
import {
  FaPen,
  FaLightbulb,
  FaSyncAlt,
  FaPaperclip,
  FaTimes,
  FaComments,
  FaPlus,
  FaEdit,
  FaTrash,
} from "react-icons/fa";
import { isImageFile } from "../utils/imagePicker";
import { downsampleImageFile } from "../utils/imageResize";
import { useToast } from "../contexts/ToastContext";
import {
  getUserData,
  getAuthToken,
  authFetch,
  tryRecoverAuthOrLogout,
} from "../utils/auth";
import { useAuthSession } from "../hooks/useAuthSession";
import { chatAPI, COMPANION_CHAT_MODEL } from "../utils/answerEngine";
import { IoIosArrowBack, IoIosSend } from "react-icons/io";
import {
  getChatDateLabel,
  isDifferentChatDay,
  formatChatMessageTime,
  isChatGreetingMessage,
  sortMessagesByTime,
} from "../utils/chatDates";
import { buildCompanionHistoryPayload } from "../utils/companionChat";
import {
  scheduleScrollToBottom,
} from "../utils/chatScroll";
import { getUserFriendlyErrorMessage } from "../utils/helpers";
import { ChatDateDivider } from "../components/ChatDateDivider";
import { AIDataConsentModal, hasAIConsent } from "../components/AIDataConsentModal";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  friendId?: string; // For group chat: which friend sent this
  friendName?: string; // For group chat: friend's name
  imageUrl?: string; // Optional image/video attachment preview
  attachmentType?: "image" | "video";
}

interface AIFriend {
  id: string;
  name: string;
  username: string; // Unique username for @mentions
  description: string;
  logo_url: string | null;
  custom_greeting: string | null;
  created_at: string;
  updated_at: string;
}

function friendAvatarUrl(name: string, logoUrl?: string | null): string {
  if (logoUrl) return logoUrl;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=C7A869&color=111&size=120&bold=true`;
}


export default function AIFriendPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  // Get user data for avatar
  const { isLoggedIn, user: sessionUser } = useAuthSession();
  const userData = sessionUser ?? getUserData();
  const userName = userData?.name || "You";

  const [showConsentModal, setShowConsentModal] = useState(() => !hasAIConsent());
  // AI Friends state
  const [aiFriends, setAiFriends] = useState<AIFriend[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [showAllGroupAvatars, setShowAllGroupAvatars] = useState(false);
  const [showAllFriendsInSheet, setShowAllFriendsInSheet] = useState(false);
  // Default landing surface is the group chat — individual friend chats are
  // an opt-in from the friend picker.
  const [isGroupChat, setIsGroupChat] = useState(true);
  const [showFriendSelector, setShowFriendSelector] = useState(false);
  const [showFriendModal, setShowFriendModal] = useState(false);
  const [editingFriend, setEditingFriend] = useState<AIFriend | null>(null);
  const [friendName, setFriendName] = useState("");
  const [friendDescription, setFriendDescription] = useState("");
  const [friendLogoUrl, setFriendLogoUrl] = useState("");
  const [friendCustomGreeting, setFriendCustomGreeting] = useState("");
  const [selectedDefaultLogo, setSelectedDefaultLogo] = useState<string | null>(
    null
  );
  const [_isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [defaultLogos, setDefaultLogos] = useState<
    Array<{ id: string; name: string; url: string }>
  >([]);

  // Get selected friend or default
  const selectedFriend = selectedFriendId
    ? aiFriends.find((f) => f.id === selectedFriendId)
    : null;

  // Default AI profile for logged-out users or when no friend selected
  const defaultAiProfile = {
    name: isLoggedIn ? "AI Friend" : "SyntraIQ Friend",
    handle: isLoggedIn ? "@syntraIQ companion" : "@syntraIQ friend",
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
      isLoggedIn ? "AI+Friend" : "SyntraIQ+Friend"
    )}&background=C7A869&color=111&size=120&bold=true&font-size=0.5`,
  };

  // Use selected friend's info, group chat label, or default (logged-out only)
  const aiProfile = isGroupChat
    ? {
        name: "Group Chat",
        handle: `${aiFriends.length} friend${aiFriends.length === 1 ? "" : "s"}`,
        avatar: friendAvatarUrl("Group"),
      }
    : selectedFriend
      ? {
          name: selectedFriend.name,
          handle: `@${selectedFriend.username || selectedFriend.name.toLowerCase().replace(/\s+/g, "")}`,
          avatar: friendAvatarUrl(selectedFriend.name, selectedFriend.logo_url),
        }
      : defaultAiProfile;

  // Never land in a nameless individual chat — group is the default surface.
  useEffect(() => {
    if (isLoggedIn && !isGroupChat && !selectedFriendId) {
      setIsGroupChat(true);
    }
  }, [isLoggedIn, isGroupChat, selectedFriendId]);

  const handleHeaderProfileClick = () => {
    if (aiFriends.length === 0) {
      openCreateFriendModal();
      return;
    }
    setShowFriendSelector(true);
  };
  const genericUserAvatar =
    "https://ui-avatars.com/api/?name=+&background=444&color=ddd&size=120&bold=true";
  const userProfile = {
    name: userName,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
      userName
    )}&background=C7A869&color=111&size=120&bold=true&font-size=0.5`,
  };
  // Generate greeting based on selected friend or default
  const getGreeting = () => {
    // Group chat greeting
    if (isGroupChat) {
      return isLoggedIn
        ? "Hey! This is a group chat with all your AI friends. Tag them with @ to get specific responses, or just chat and everyone will reply! 😊"
        : "Hey! I'm SyntraIQ Friend. How can I help you today?";
    }

    // Individual chat greeting
    if (selectedFriend) {
      if (selectedFriend.custom_greeting) {
        return selectedFriend.custom_greeting;
      }
      return `Hi! I'm ${selectedFriend.name}, your friend. How can I help you today? Feel free to ask me anything or just chat! 😊`;
    }
    if (isLoggedIn) {
      return "Hey! I'm your AI Friend. How can I help you today? Feel free to ask me anything or just chat! 😊";
    }
    return "Hey! I'm SyntraIQ Friend. How can I help you today? Feel free to ask me anything or just chat! 😊";
  };

  const buildHistoryApiUrl = (before?: string) => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return "";
    const params = new URLSearchParams({
      chatMode: "ai_friend",
      limit: String(HISTORY_PAGE_SIZE),
    });
    if (isGroupChat) {
      params.set("groupChat", "true");
    } else if (selectedFriendId) {
      params.set("aiFriendId", selectedFriendId);
    }
    if (before) params.set("before", before);
    return `${API_URL}/api/chat/history?${params.toString()}`;
  };

  const mapHistoryToMessages = (
    raw: Array<{ role: string; content: string; timestamp: string; friendId?: string }>,
    idPrefix: string
  ): Message[] =>
    raw.map((msg, index) => {
      const friend = msg.friendId
        ? aiFriends.find((f) => f.id === msg.friendId)
        : undefined;
      return {
        id: `${idPrefix}-${index}-${msg.timestamp || index}`,
        role: msg.role === "user" ? "user" : "ai",
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        ...(msg.friendId
          ? { friendId: msg.friendId, friendName: friend?.name }
          : {}),
      };
    });

  const startNewConversation = () => {
    setNewConversation(true);
    historyHasMoreRef.current = false;
    historyOldestRef.current = null;
    setMessages([
      {
        id: "1",
        role: "ai",
        content: getGreeting(),
        timestamp: new Date(),
      },
    ]);
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content: getGreeting(),
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [newConversation, setNewConversation] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    "I'll heat up the dal if you promise to share how your day's been going.",
    "Maybe we can cook together sometime—what's your favorite comfort meal?",
    "Want me to send you a quick recipe to make that dinner extra special?",
  ]);
  const [dailySuggestionUses, setDailySuggestionUses] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Mention system state
  const [showMentionList, setShowMentionList] = useState(false);
  const [filteredFriends, setFilteredFriends] = useState<AIFriend[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const suppressAutoScrollRef = useRef(false);
  // Pagination state for chat history (latest 20 first, older 20 on scroll-up).
  const HISTORY_PAGE_SIZE = 20;
  const historyHasMoreRef = useRef<boolean>(false);
  const historyOldestRef = useRef<string | null>(null);
  const [isLoadingOlderHistory, setIsLoadingOlderHistory] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const friendSelectorContainerRef = useRef<HTMLDivElement>(null);
  const friendSelectorSheetRef = useRef<HTMLDivElement>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const attachedPreviewUrl = useMemo(
    () => (attachedFile ? URL.createObjectURL(attachedFile) : null),
    [attachedFile]
  );
  useEffect(() => {
    return () => {
      if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
    };
  }, [attachedPreviewUrl]);

  // WhatsApp-style UX: keep the latest messages in view at the bottom.
  useLayoutEffect(() => {
    if (suppressAutoScrollRef.current) return;
    scheduleScrollToBottom(messagesContainerRef.current);
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load AI friends for logged-in users
  useEffect(() => {
    if (isLoggedIn) {
      loadAIFriends();
      loadDefaultLogos();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (showFriendSelector) {
      setShowAllFriendsInSheet(false);
    }
  }, [showFriendSelector]);

  useEffect(() => {
    if (!isGroupChat) {
      setShowAllGroupAvatars(false);
    }
  }, [isGroupChat]);

  useEffect(() => {
    if (!showFriendSelector) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowFriendSelector(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showFriendSelector]);

  // Load default logos
  const loadDefaultLogos = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    try {
      const response = await authFetch(`${API_URL}/api/ai-friends/default-logos`, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        setDefaultLogos(data.logos || []);
      }
    } catch (error) {
      console.error("Failed to load default logos:", error);
    }
  };

  // Load user premium status (suggestions / context limits only — model is fixed).
  useEffect(() => {
    const user = getUserData();
    if (user) {
      setIsPremium(user.isPremium ?? false);
    } else {
      setIsPremium(false);
    }
  }, []);

  // Load AI friends from API
  const loadAIFriends = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    setIsLoadingFriends(true);
    try {
      const response = await authFetch(`${API_URL}/api/ai-friends`, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        setAiFriends(data.friends || []);
        // Do not auto-select a friend — we land in group chat by default.
        // Switching to an individual friend is an explicit user action from
        // the picker.
      }
    } catch (error) {
      console.error("Failed to load AI friends:", error);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  // Backfill friend names on history bubbles once friends list is loaded.
  useEffect(() => {
    if (aiFriends.length === 0) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.friendId || m.friendName) return m;
        const friend = aiFriends.find((f) => f.id === m.friendId);
        return friend ? { ...m, friendName: friend.name } : m;
      })
    );
  }, [aiFriends]);

  // Handle greeting and history loading when chat mode or friend selection changes
  useEffect(() => {
    const greeting = getGreeting();

    // Update greeting immediately (synchronously) for instant feedback, then
    // load persisted history below for both group and individual chats. We
    // previously short-circuited group chat here, which wiped the group
    // conversation every time the user navigated back to the screen.

    // For individual chat: show greeting immediately, then load history
    // Wait for friend data if a friend is selected but data isn't loaded yet
    if (selectedFriendId && aiFriends.length === 0) {
      // Show greeting even if friend data isn't loaded yet
      setMessages([
        {
          id: "1",
          role: "ai",
          content: greeting,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    // Show greeting immediately
    setMessages([
      {
        id: "1",
        role: "ai",
        content: greeting,
        timestamp: new Date(),
      },
    ]);

    // Load history in the background and append it
    const loadHistory = async () => {
      const API_URL = import.meta.env.VITE_API_URL;
      if (!API_URL) return;

      try {
        // Load history for specific friend if selected, otherwise load default.
        // Paginated: take the latest HISTORY_PAGE_SIZE exchanges; older pages
        // are fetched on scroll-up via loadOlderHistory.
        historyHasMoreRef.current = false;
        historyOldestRef.current = null;
        const historyUrl = buildHistoryApiUrl();

        console.log('📚 Loading history from:', historyUrl);
        
        const response = await authFetch(historyUrl, { method: "GET" });
        
        console.log('📚 History response status:', response.status);

        // Handle 401 — attempt silent refresh first so an expired access
        // token doesn't punt the user back to the login screen when their
        // refresh token is still valid.
        if (response.status === 401) {
          void tryRecoverAuthOrLogout();
          return;
        }

        if (response.ok) {
          const data = await response.json();
          console.log('📚 History data:', data);
          
          historyHasMoreRef.current = Boolean(data.hasMore);
          historyOldestRef.current = data.oldestTimestamp || null;
          if (data.messages && data.messages.length > 0) {
            console.log(`📚 Loaded ${data.messages.length} messages from history`);
            
            const historyMessages = mapHistoryToMessages(data.messages, "history").filter(
              (m) =>
                // In group chat, only show AI bubbles that belong to a real friend.
                !isGroupChat || m.role !== "ai" || Boolean(m.friendId)
            );

            // Real history replaces the placeholder greeting (greeting uses
            // today's date and breaks Today → Sunday dividers when prepended).
            setMessages(sortMessagesByTime(historyMessages));
          } else {
            console.log('📚 No history messages found');
          }
        } else {
          console.error('📚 History fetch failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
        // Keep the greeting even if history fails to load
      }
    };

    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroupChat, selectedFriendId, selectedFriend, aiFriends]);

  // Fetch the previous HISTORY_PAGE_SIZE exchanges and prepend, preserving
  // scroll position so the view doesn't jump.
  const loadOlderHistory = useCallback(async () => {
    if (!historyHasMoreRef.current || isLoadingOlderHistory) return;
    const before = historyOldestRef.current;
    if (!before) return;
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    setIsLoadingOlderHistory(true);
    suppressAutoScrollRef.current = true;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    try {
      const url = buildHistoryApiUrl(before);
      const response = await authFetch(url, { method: 'GET' });
      if (!response.ok) return;
      const data = await response.json();
      const older = mapHistoryToMessages(data.messages || [], `history-older-${before}`);
      if (older.length > 0) {
        setMessages((prev) =>
          sortMessagesByTime([
            ...older,
            ...prev.filter((m) => !isChatGreetingMessage(m)),
          ])
        );
      }
      historyHasMoreRef.current = Boolean(data.hasMore);
      historyOldestRef.current = data.oldestTimestamp || historyOldestRef.current;

      requestAnimationFrame(() => {
        const c = messagesContainerRef.current;
        if (!c) return;
        c.scrollTop = prevScrollTop + (c.scrollHeight - prevScrollHeight);
        requestAnimationFrame(() => {
          suppressAutoScrollRef.current = false;
        });
      });
    } catch (e) {
      console.warn('Failed to load older history:', e);
    } finally {
      setIsLoadingOlderHistory(false);
    }
  }, [isLoadingOlderHistory, isGroupChat, selectedFriendId, aiFriends]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (container.scrollTop < 200) void loadOlderHistory();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [loadOlderHistory]);

  // Speech recognition setup
  useEffect(() => {
    const hasSpeechRecognition =
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window;

    if (!hasSpeechRecognition) {
      return;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startVoiceInput = () => {
    const hasSpeechRecognition =
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window;

    if (!hasSpeechRecognition) {
      showToast({
        message: "Voice input is not supported in this browser",
        type: "error",
        duration: 2000,
      });
      return;
    }

    if (isListening) {
      stopVoiceInput();
      return;
    }

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") {
        const isNative = Capacitor.isNativePlatform();
        showToast({
          message: isNative
            ? "Microphone access denied. Please allow microphone access in your device settings."
            : "Microphone access denied. Please allow microphone access in your browser settings.",
          type: "error",
          duration: 3000,
        });
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Parse @mentions by username or display name (supports spaces e.g. @Gokhale Chirala)
  const parseMentions = (text: string): string[] => {
    const mentionedIds = new Set<string>();

    for (const friend of aiFriends) {
      const usernamePattern = new RegExp(
        `@${escapeRegExp(friend.username)}\\b`,
        "i"
      );
      const namePattern = new RegExp(
        `@\\s*${escapeRegExp(friend.name)}(?=\\s|[,.!?]|$)`,
        "i"
      );
      if (usernamePattern.test(text) || namePattern.test(text)) {
        mentionedIds.add(friend.id);
      }
    }

    // Fallback: @word tokens matched to username
    const tokenMatches = text.matchAll(/@(\w+)/g);
    for (const match of tokenMatches) {
      const token = match[1].toLowerCase();
      const friend = aiFriends.find(
        (f) =>
          f.username.toLowerCase() === token ||
          f.name.toLowerCase().replace(/\s+/g, "") === token
      );
      if (friend) mentionedIds.add(friend.id);
    }

    return Array.from(mentionedIds);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    if (isLoggedIn && !isGroupChat && !selectedFriendId) {
      showToast({
        message: "Select a friend from the list to chat one-on-one.",
        type: "info",
        duration: 3000,
      });
      setShowFriendSelector(true);
      return;
    }

    const fileToSend = attachedFile;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
      imageUrl: fileToSend ? URL.createObjectURL(fileToSend) : undefined,
      attachmentType: fileToSend
        ? fileToSend.type.startsWith("video/")
          ? "video"
          : "image"
        : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = inputValue.trim();
    setInputValue("");
    setAttachedFile(null);
    if (attachedFileName) {
      setAttachedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    setIsLoading(true);

    // Call real API
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) {
      showToast({
        message: "API URL not configured",
        type: "error",
        duration: 3000,
      });
      setIsLoading(false);
      return;
    }

    let groupChatManagesLoading = false;

    try {
      const contextMessageLimit = !isLoggedIn ? 5 : isPremium ? 10 : 8;
      const freshThread = newConversation;
      const buildHistoryForFriend = (friendId?: string) =>
        buildCompanionHistoryPayload(
          messages
            .filter((m) => {
              if (m.role === "user") return true;
              if (isGroupChat) return m.role === "ai";
              return !m.friendId || (friendId && m.friendId === friendId);
            }),
          contextMessageLimit
        );
      // Handle group chat vs individual chat
      if (isGroupChat && isLoggedIn && aiFriends.length > 0) {
        // Group chat: parse @ mentions
        const mentionedIds = parseMentions(messageText);
        const friendsToMessage =
          mentionedIds.length > 0
            ? aiFriends.filter((f) => mentionedIds.includes(f.id))
            : aiFriends; // If no mentions, message all friends

        if (friendsToMessage.length === 0) {
          showToast({
            message:
              "No friends found to message. Please check your @ mentions.",
            type: "error",
            duration: 3000,
          });
          setIsLoading(false);
          return;
        }

        // Send to each friend in parallel — show each reply as soon as it arrives.
        const fileUploads = fileToSend
          ? [{ id: 'f0', file: fileToSend, type: 'image' as const }]
          : [];

        groupChatManagesLoading = true;
        let pendingReplies = friendsToMessage.length;

        friendsToMessage.forEach((friend, index) => {
          chatAPI(
            messageText,
          COMPANION_CHAT_MODEL,
          'ai_friend',
            fileUploads,
            null,
            buildHistoryForFriend(friend.id),
            friend.id,
            undefined,
            freshThread,
            true,
          )
            .then((data) => {
              const aiResponse: Message = {
                id: `${Date.now()}-${friend.id}-${index}`,
                role: "ai",
                content: data.message || "No response",
                timestamp: new Date(),
                friendId: friend.id,
                friendName: friend.name,
              };
              setMessages((prev) => [...prev, aiResponse]);
              if (freshThread) {
                setNewConversation(false);
              }
            })
            .catch((error: any) => {
              if (error?.message?.includes("Session expired")) {
                // Soft recovery — refresh once before nuking the session.
                void tryRecoverAuthOrLogout();
              }
              const errorResponse: Message = {
                id: `${Date.now()}-error-${friend.id}`,
                role: "ai",
                content: `Sorry, ${friend.name} encountered an error: ${getUserFriendlyErrorMessage(error?.message || "Failed to connect")}`,
                timestamp: new Date(),
                friendId: friend.id,
                friendName: friend.name,
              };
              setMessages((prev) => [...prev, errorResponse]);
            })
            .finally(() => {
              pendingReplies -= 1;
              if (pendingReplies <= 0) {
                setIsLoading(false);
              }
            });
        });

        return;
      } else {
        // Individual chat: must have a selected friend — never the default SyntraIQ bot.
        if (!selectedFriendId) {
          setIsLoading(false);
          setShowFriendSelector(true);
          return;
        }

        const fileUploads = fileToSend
          ? [{ id: 'f0', file: fileToSend, type: 'image' as const }]
          : [];

        const data = await chatAPI(
          messageText,
          COMPANION_CHAT_MODEL,
          'ai_friend',
          fileUploads,
          null,
          buildHistoryForFriend(selectedFriendId || undefined),
          selectedFriendId || undefined,
          undefined,
          freshThread,
          false,
        );

        if (!data.message || data.message.trim().length === 0) {
          throw new Error("AI returned an empty response. Please try again.");
        }

        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: data.message,
          timestamp: new Date(),
          ...(selectedFriendId
            ? {
                friendId: selectedFriendId,
                friendName: selectedFriend?.name,
              }
            : {}),
        };
        setMessages((prev) => [...prev, aiResponse]);

        if (newConversation) {
          setNewConversation(false);
        }
      }
    } catch (error: any) {
      console.error("Chat API error:", error);
      showToast({
        message: getUserFriendlyErrorMessage(error.message || "Failed to get response from AI"),
        type: "error",
        duration: 3000,
      });
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: getUserFriendlyErrorMessage(
          error.message || "Failed to connect to the server"
        ),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      if (!groupChatManagesLoading) {
        setIsLoading(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionList && filteredFriends.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((prev) =>
          prev > 0 ? prev - 1 : filteredFriends.length - 1
        );
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((prev) =>
          prev < filteredFriends.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleMentionSelect(filteredFriends[selectedMentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionList(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const inspirationPool = [
    "I'll grab a plate too—food tastes better when we share it.",
    "Let's keep chatting while you eat. I don't mind being your dinner guest.",
    "Maybe your appetite will come back if I tell you a story. Want to hear one?",
    "I'll wait while you warm it up. We can plan dessert together.",
    "Sometimes good company is the secret ingredient. I'm here as long as you need.",
    "How about we set a timer and make dinner together, step by step?",
  ];

  const refreshSuggestions = () => {
    const shuffled = [...inspirationPool].sort(() => Math.random() - 0.5);
    setSuggestions(shuffled.slice(0, 3));
    setDailySuggestionUses((prev) => Math.min(prev + 1, 10));
  };

  const handleUseSuggestion = (text: string) => {
    setInputValue(text);
    inputRef.current?.focus();
  };

  const handleAttachClick = () => {
    if (isLoading) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.files?.[0];
    if (!raw) return;

    // Only allow images
    if (!raw.type.startsWith('image/')) {
      showToast({
        message: "Please select an image file",
        type: "error",
        duration: 3000,
      });
      return;
    }

    // Check file size (max 20 MB — matches backend cap)
    if (raw.size > 20 * 1024 * 1024) {
      showToast({
        message: "Image must be smaller than 20 MB",
        type: "error",
        duration: 3000,
      });
      return;
    }

    const file = await downsampleImageFile(raw);
    setAttachedFile(file);
    setAttachedFileName(file.name);
  };

  // Mention system handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart;

    setInputValue(newValue);
    setCursorPosition(newCursorPosition);

    // Auto-resize logic
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;

    // Only check for mentions if in group chat
    if (!isGroupChat) {
      setShowMentionList(false);
      return;
    }

    // Check if we are currently typing a mention
    // Look for the last @ before cursor
    const textBeforeCursor = newValue.substring(0, newCursorPosition);
    const lastAtSymbolIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtSymbolIndex !== -1) {
      // Check if the @ is at the start or preceded by a space/newline
      const isValidStart =
        lastAtSymbolIndex === 0 ||
        /[\s\n]/.test(textBeforeCursor[lastAtSymbolIndex - 1]);

      if (isValidStart) {
        // Get the text after @ up to cursor
        const query = textBeforeCursor.substring(lastAtSymbolIndex + 1);

        // If query contains space, verify it's a valid multi-word name or stop mentioning
        // For simplicity, let's allow spaces if they match friend names, 
        // but typically a simple implementation stops at space unless we do smarter matching.
        // Let's stop at newline.
        if (!query.includes("\n")) {
          // Filter friends by username or name
          const queryLower = query.toLowerCase();
          const matches = aiFriends.filter(friend =>
            friend.username.toLowerCase().includes(queryLower) ||
            friend.name.toLowerCase().includes(queryLower)
          );

          setFilteredFriends(matches);
          setShowMentionList(matches.length > 0);
          setSelectedMentionIndex(0); // Reset selection when filtering
          return;
        }
      }
    }

    // If we reach here, we are not in a valid mention state
    setShowMentionList(false);
  };

  const handleMentionSelect = (friend: AIFriend) => {
    // Find where the mention started
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const lastAtSymbolIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtSymbolIndex !== -1) {
      const textAfterCursor = inputValue.substring(cursorPosition);
      const prefix = inputValue.substring(0, lastAtSymbolIndex);

      // Construct new value: existing prefix + @username + space + existing suffix
      const newValue = `${prefix}@${friend.username} ${textAfterCursor}`;

      setInputValue(newValue);
      setShowMentionList(false);

      // Focus and set cursor after the inserted username
      if (inputRef.current) {
        inputRef.current.focus();
        // We need to set cursor position after render, simplified here by assuming state update is fast enough
        // or using setTimeout. React 18 automatic batching might make this tricky without setTimeout.
    setTimeout(() => {
          const newPosition = prefix.length + friend.username.length + 2; // @ + username + space
          inputRef.current?.setSelectionRange(newPosition, newPosition);
        }, 0);
      }
    }
  };

  // Friend management functions
  const handleLogoFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast({
        message: "Logo file must be less than 20 MB",
        type: "error",
        duration: 3000,
      });
      return;
    }

    if (!isImageFile(file)) {
      showToast({
        message: "Please select an image file (JPG, PNG, WebP, HEIC)",
        type: "error",
        duration: 3000,
      });
      return;
    }

    setIsUploadingLogo(true);
    setSelectedDefaultLogo(null); // Clear default logo selection

    // Upload to Supabase Storage
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) {
      setIsUploadingLogo(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("logo", file);

      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api/ai-friends/upload-logo`, {
        method: "POST",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setFriendLogoUrl(data.url);
        showToast({
          message: "Logo uploaded successfully!",
          type: "success",
          duration: 2000,
        });
      } else {
        const error = await response.json().catch(() => ({}));
        showToast({
          message: error.details || error.error || "Failed to upload logo",
          type: "error",
          duration: 4000,
        });
      }
    } catch (error: any) {
      showToast({
        message: error.message || "Failed to upload logo",
        type: "error",
        duration: 3000,
      });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSelectDefaultLogo = (logoId: string) => {
    setSelectedDefaultLogo(logoId);
    setFriendLogoUrl(""); // Clear custom logo
  };

  const handleCreateFriend = async () => {
    if (!friendName.trim() || !friendDescription.trim()) {
      showToast({
        message: "Please fill in name and description",
        type: "error",
        duration: 3000,
      });
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    try {
      const response = await authFetch(`${API_URL}/api/ai-friends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: friendName.trim(),
          description: friendDescription.trim(),
          logoUrl: friendLogoUrl || undefined,
          defaultLogo: selectedDefaultLogo || undefined,
          customGreeting: friendCustomGreeting.trim() || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await loadAIFriends();
        setSelectedFriendId(data.friend.id);
        setShowFriendModal(false);
        resetFriendForm();
        showToast({
          message: "Character created successfully!",
          type: "success",
          duration: 2000,
        });
      } else {
        const error = await response.json();
        showToast({
          message: error.error || "Failed to create character",
          type: "error",
          duration: 3000,
        });
      }
    } catch (error: any) {
      showToast({
        message: error.message || "Failed to create character",
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleUpdateFriend = async () => {
    if (!editingFriend || !friendName.trim() || !friendDescription.trim()) {
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    try {
      // Determine if logo should be removed (both are empty/null)
      const shouldRemoveLogo = !friendLogoUrl && !selectedDefaultLogo;
      
      const response = await authFetch(
        `${API_URL}/api/ai-friends/${editingFriend.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: friendName.trim(),
            description: friendDescription.trim(),
            logoUrl: shouldRemoveLogo ? null : (friendLogoUrl || undefined),
            defaultLogo: shouldRemoveLogo ? null : (selectedDefaultLogo || undefined),
            customGreeting: friendCustomGreeting.trim() || undefined,
          }),
        }
      );

      if (response.ok) {
        await loadAIFriends();
        setShowFriendModal(false);
        resetFriendForm();
        showToast({
          message: "Character updated successfully!",
          type: "success",
          duration: 2000,
        });
      } else {
        const error = await response.json();
        showToast({
          message: error.error || "Failed to update character",
          type: "error",
          duration: 3000,
        });
      }
    } catch (error: any) {
      showToast({
        message: error.message || "Failed to update character",
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleDeleteFriend = async (friendId: string) => {
    if (!confirm("Are you sure you want to delete this character?")) {
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    try {
      const response = await authFetch(`${API_URL}/api/ai-friends/${friendId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadAIFriends();
        if (selectedFriendId === friendId) {
          setSelectedFriendId(null);
        }
        showToast({
          message: "Character deleted successfully!",
          type: "success",
          duration: 2000,
        });
      } else {
        const error = await response.json();
        showToast({
          message: error.error || "Failed to delete character",
          type: "error",
          duration: 3000,
        });
      }
    } catch (error: any) {
      showToast({
        message: error.message || "Failed to delete AI friend",
        type: "error",
        duration: 3000,
      });
    }
  };

  const resetFriendForm = () => {
    setFriendName("");
    setFriendDescription("");
    setFriendLogoUrl("");
    setFriendCustomGreeting("");
    setSelectedDefaultLogo(null);
    setEditingFriend(null);
  };

  const openCreateFriendModal = () => {
    resetFriendForm();
    setShowFriendModal(true);
  };

  const openEditFriendModal = (friend: AIFriend) => {
    setEditingFriend(friend);
    setFriendName(friend.name);
    setFriendDescription(friend.description);
    setFriendCustomGreeting(friend.custom_greeting || "");

    // Check if logo is a default logo
    const defaultLogo = defaultLogos.find((l) => l.url === friend.logo_url);
    if (defaultLogo) {
      setSelectedDefaultLogo(defaultLogo.id);
      setFriendLogoUrl("");
    } else {
      setFriendLogoUrl(friend.logo_url || "");
      setSelectedDefaultLogo(null);
    }
    setShowFriendModal(true);
  };

  return (
    <div
      className="container h-screen flex flex-col !p-0"
      style={{ position: "relative" }}
    >
      {/* AI Data Consent Modal — shown once before first AI interaction */}
      {showConsentModal && (
        <AIDataConsentModal onAccept={() => setShowConsentModal(false)} />
      )}
      {/* Header */}
      <div className="border-b border-[var(--border)] sticky top-0 z-[100] bg-[var(--bg)]" style={{ paddingTop: "var(--safe-area-top)" }}>
        <div className="flex flex-nowrap justify-between items-center gap-2 p-3 px-4 min-h-[60px]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              className="btn-ghost glass-button p-2! shrink-0 text-[length:var(--font-md)]"
              onClick={() => navigateTo("/app")}
              aria-label="Back"
            >
              <IoIosArrowBack size={24} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {isLoggedIn && (
                <div ref={friendSelectorContainerRef} className="min-w-0">
                  <button
                    type="button"
                    onClick={handleHeaderProfileClick}
                    className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-[var(--input-bg)] transition-colors min-w-0 max-w-full"
                    aria-label="Switch character"
                  >
                    <div className="relative shrink-0 hidden md:block">
                      <img
                        src={isGroupChat && aiFriends.length > 0
                          ? friendAvatarUrl(aiFriends[0].name, aiFriends[0].logo_url)
                          : aiProfile.avatar}
                        alt={isGroupChat ? "Group chat" : `${aiProfile.name} avatar`}
                        className="w-10 h-10 min-w-10 rounded-full object-cover border-2 border-[var(--accent)]"
                      />
                      <div className="w-2 h-2 rounded-full bg-[#10A37F] shadow-[0_0_8px_rgba(16,163,127,0.5)] absolute bottom-0 right-0 animate-pulse" />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="h3 mb-0.5 truncate text-base">{aiProfile.name}</div>
                      {isGroupChat ? (
                        <div className="flex items-center max-md:hidden" style={{ gap: 0, marginTop: 2 }}>
                          <div 
                            className="relative flex items-center shrink-0" 
                            style={{ height: 20, cursor: aiFriends.length > 5 ? 'pointer' : 'default' }}
                            onClick={(e) => {
                              if (aiFriends.length > 5) {
                                e.stopPropagation();
                                setShowAllGroupAvatars(prev => !prev);
                              }
                            }}
                          >
                            {(showAllGroupAvatars ? aiFriends : aiFriends.slice(0, 5)).map((friend, index) => {
                              const avatar = friendAvatarUrl(friend.name, friend.logo_url);
                              return (
                                <img
                                  key={friend.id}
                                  src={avatar}
                                  alt={friend.name}
                                  title={friend.name}
                                  className="rounded-full object-cover border border-[var(--bg)]"
                                  style={{
                                    width: 20,
                                    height: 20,
                                    marginLeft: index === 0 ? 0 : -6,
                                    zIndex: aiFriends.length - index,
                                    boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
                                  }}
                                />
                              );
                            })}
                            {!showAllGroupAvatars && aiFriends.length > 5 && (
                              <div
                                className="rounded-full flex items-center justify-center border border-[var(--bg)] text-[9px] font-bold text-white bg-[var(--accent)]"
                                style={{
                                  width: 20,
                                  height: 20,
                                  marginLeft: -6,
                                  zIndex: 0,
                                  boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
                                }}
                              >
                                +{aiFriends.length - 5}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] opacity-75 ml-1.5 whitespace-nowrap hidden md:inline">
                            {aiFriends.length} friends joined
                          </span>
                        </div>
                      ) : (
                        <div className="sub text-xs opacity-80 truncate">
                          {aiProfile.handle}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              )}
              {!isLoggedIn && (
                <>
              <div className="relative">
                <img
                  src={aiProfile.avatar}
                  alt={`${aiProfile.name} avatar`}
                  className="w-11 h-11 rounded-full object-cover border-2 border-[var(--accent)]"
                />
                <div className="w-2.5 h-2.5 rounded-full bg-[#10A37F] shadow-[0_0_8px_rgba(16,163,127,0.5)] absolute bottom-0 right-0 animate-pulse" />
              </div>
              <div>
                <div className="h3 mb-0.5">{aiProfile.name}</div>
                <div className="sub text-sm text-[length:var(--font-sm)] opacity-80">
                  {aiProfile.handle}
                </div>
              </div>
                </>
              )}
            </div>
          </div>
            <div className="flex items-center gap-1.5 shrink-0">
            {isLoggedIn && aiFriends.length > 0 && (
            <button
                className={`btn-ghost glass-button !px-2 !py-1.5 flex gap-1 rounded-lg transition-colors text-xs whitespace-nowrap max-w-[120px] ${
                  isGroupChat
                    ? "bg-[rgba(199,168,105,0.15)] glass-panel"
                    : selectedFriendId
                      ? "bg-[rgba(199,168,105,0.15)] glass-panel"
                      : ""
                }`}
                onClick={() => {
                  // Group is the home surface — only switch back to group from individual.
                  if (!isGroupChat) {
                    setIsGroupChat(true);
                    setSelectedFriendId(null);
                  }
                }}
                aria-label={
                  isGroupChat
                    ? "Group chat"
                    : `Individual chat with ${selectedFriend?.name ?? "friend"} — tap to return to group`
                }
                title={
                  isGroupChat
                    ? "Group chat with all friends"
                    : "Tap to return to group chat"
                }
              >
                <span
                  className={
                    isGroupChat || selectedFriendId
                      ? "text-[var(--accent)]"
                      : "text-[var(--text)]"
                  }
                  style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {isGroupChat ? "Group" : selectedFriend?.name ?? "Friend"}
                </span>
              </button>
            )}
            {isLoggedIn && (
              <button
                className="btn-ghost glass-button !px-2 !py-1.5 flex gap-1 rounded-lg transition-colors hover:bg-[var(--input-bg)] text-xs whitespace-nowrap"
                onClick={startNewConversation}
                title="Start a new conversation"
              >
                <span>New</span>
              </button>
            )}
            {isLoggedIn && (
              <button
                className="btn-ghost glass-button !px-2 !py-1.5 flex gap-1 rounded-lg transition-colors hover:bg-[var(--input-bg)] disabled:opacity-50 disabled:cursor-not-allowed text-xs whitespace-nowrap"
                onClick={openCreateFriendModal}
                title="Create Character"
              >
                <FaPlus size={12} />
                <span>Create</span>
              </button>
            )}
            {/* <button
              className="btn-ghost p-2"
              aria-label="Favorite conversation"
            >
              <FaStar size={18} color="var(--accent)" />
            </button> */}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-5 flex flex-col">
        {isLoadingOlderHistory && (
          <div className="text-center sub text-sm py-2 mb-2">Loading older messages…</div>
        )}
        {messages.map((message, index) => {
          const showDateDivider =
            index === 0 ||
            isDifferentChatDay(
              messages[index - 1].timestamp,
              message.timestamp
            );
          // For group chat AI messages, get friend avatar and name
          const isUserInGroup = message.role === "user" && isGroupChat;
          let messageAvatar =
            message.role === "user"
              ? isUserInGroup
                ? genericUserAvatar
                : userProfile.avatar
              : aiProfile.avatar;
          let messageName =
            message.role === "user"
              ? isUserInGroup
                ? "You"
                : userProfile.name
              : aiProfile.name;

          if (message.role === "ai") {
            const friendFromId = message.friendId
              ? aiFriends.find((f) => f.id === message.friendId)
              : undefined;
            const friend =
              friendFromId ||
              (!isGroupChat && selectedFriend ? selectedFriend : undefined);
            if (friend) {
              messageAvatar = friendAvatarUrl(friend.name, friend.logo_url);
              messageName = friend.name;
            } else if (message.id === "1") {
              // Welcome / greeting bubble — neutral system styling in group.
              messageAvatar = isGroupChat
                ? friendAvatarUrl("Group")
                : aiProfile.avatar;
              messageName = isGroupChat ? "Group Chat" : aiProfile.name;
            }
          }

          return (
          <Fragment key={message.id}>
            {showDateDivider && (
              <ChatDateDivider label={getChatDateLabel(message.timestamp)} />
            )}
          <div
              className={`flex items-end gap-3 mb-4 ${message.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <img
                src={messageAvatar}
                alt={`${messageName} avatar`}
                className={`w-9 h-9 rounded-full object-cover border-2 ${message.role === "user"
                  ? "border-[var(--accent)]"
                  : "border-[rgba(16,163,127,0.5)]"
              }`}
            />
            <div
                className={`max-w-[72%] px-4 py-3 rounded-[var(--radius-sm)] shadow-[var(--shadow)] leading-relaxed break-words ${message.role === "user"
                  ? "bg-[rgba(199,168,105,0.15)] text-(--accent) border border-[rgba(199,168,105,0.3)] glass-panel flex flex-col items-end"
                  : "glass-panel text-[var(--text)] border border-[rgba(255,255,255,0.1)]"
              }`}
            >
                {/* Friend name on AI replies (group + individual) */}
                {message.role === "ai" &&
                  message.id !== "1" &&
                  (message.friendName || (!isGroupChat && messageName)) && (
                  <div className="text-[length:var(--font-xs)] font-semibold mb-1 opacity-80 self-start">
                    {message.friendName || messageName}
                  </div>
                )}
                {message.imageUrl && message.attachmentType === "video" ? (
                  <video
                    src={message.imageUrl}
                    controls
                    className="mb-2 rounded-lg max-w-full max-h-[300px] object-contain"
                  />
                ) : message.imageUrl ? (
                  <img
                    src={message.imageUrl}
                    alt="Attached"
                    className="mb-2 rounded-lg max-w-full max-h-[300px] object-contain"
                  />
                ) : null}
              <div className={`text-[length:var(--font-md)] whitespace-pre-wrap w-full ${message.role === "user" ? "text-right" : ""}`}>
                {message.content}
              </div>
                <div
                  className={`text-[length:var(--font-xs)] opacity-60 mt-1.5 ${message.role === "user" ? "text-right" : "text-left"
                    }`}
                >
                  {formatChatMessageTime(message.timestamp)}
              </div>
            </div>
          </div>
          </Fragment>
          );
        })}
        {isLoading && (
          <div className="flex items-end gap-3 mb-4">
            <img
              src={
                isGroupChat && aiFriends.length > 0
                  ? friendAvatarUrl(aiFriends[0].name, aiFriends[0].logo_url)
                  : selectedFriend
                    ? friendAvatarUrl(selectedFriend.name, selectedFriend.logo_url)
                    : aiProfile.avatar
              }
              alt="Thinking"
              className="w-9 h-9 rounded-full object-cover border-2 border-[rgba(16,163,127,0.5)]"
            />
            <div className="px-4 py-3 rounded-[var(--radius-sm)] glass-panel border border-[rgba(255,255,255,0.1)]">
              <div className="text-[length:var(--font-md)] font-semibold mb-1">
                {isGroupChat
                  ? `Waiting for ${aiFriends.map((f) => f.name).join(", ")}…`
                  : "Thinking..."}
              </div>
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-[var(--sub)] animate-[pulse_1.4s_ease-in-out_infinite]" />
                <span className="w-2 h-2 rounded-full bg-[var(--sub)] animate-[pulse_1.4s_ease-in-out_infinite_0.2s]" />
                <span className="w-2 h-2 rounded-full bg-[var(--sub)] animate-[pulse_1.4s_ease-in-out_infinite_0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area — no search-mode buttons here; this is conversational chat. */}
      <div className="p-3 px-4 border-none border-[var(--border)] sticky bottom-0 input-bar-safe-bottom">
        {attachedFile && (
          <div className="mb-2 flex items-start justify-end gap-2">
            <div className="relative inline-block">
              <img
                src={attachedPreviewUrl ?? ""}
                alt={attachedFileName || "Attached"}
                className="h-20 w-20 rounded-lg object-cover border border-[var(--border)]"
              />
              <button
                type="button"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--card)] border border-[var(--border)] flex items-center justify-center"
                onClick={() => {
                  setAttachedFileName(null);
                  setAttachedFile(null);
                  setIsUploading(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Remove attached image"
              >
                <FaTimes size={10} />
              </button>
            </div>
            {isUploading && (
              <span className="text-[length:var(--font-xs)] text-[var(--accent)] font-semibold self-center">
                Uploading…
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2 items-end flex-wrap glass-panel p-3 rounded-xl border border-[var(--border)]">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelected}
            aria-hidden
          />
          <div className="flex-1 flex items-center rounded-[var(--radius-lg)] px-3 py-1 !border-none min-h-[34px] max-h-[120px] relative">
            {/* Mention List */}
            {showMentionList && (
              <div className="absolute bottom-full left-0 mb-2 w-full max-w-[250px] glass-panel border border-[var(--border)] rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="p-1 max-h-[200px] overflow-y-auto">
                  {filteredFriends.map((friend, index) => (
                    <button
                      key={friend.id}
                      onClick={() => handleMentionSelect(friend)}
                      onMouseEnter={() => setSelectedMentionIndex(index)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors rounded-md group ${index === selectedMentionIndex
                        ? "bg-[var(--input-bg)]"
                        : "hover:bg-[var(--input-bg)]"
                        }`}
                    >
                      <img
                        src={friend.logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.name)}&background=C7A869&color=111&size=32&bold=true`}
                        alt={friend.name}
                        className={`w-6 h-6 rounded-full object-cover border transition-colors ${index === selectedMentionIndex
                          ? "border-[var(--accent)]"
                          : "border-[var(--border)] group-hover:border-[var(--accent)]"
                          }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium transition-colors truncate ${index === selectedMentionIndex
                          ? "text-[var(--accent)]"
                          : "text-[var(--text)] group-hover:text-[var(--accent)]"
                          }`}>
                          @{friend.username}
                        </div>
                        <div className="text-xs opacity-60 truncate">
                          {friend.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              onClick={(e) => {
                // Update cursor position on click to ensure mentions work correctly if user moves cursor
                setCursorPosition((e.target as HTMLTextAreaElement).selectionStart);
              }}
              onSelect={(e) => {
                setCursorPosition((e.target as HTMLTextAreaElement).selectionStart);
              }}
              placeholder="Type your message..."
              className="flex-1 border-none bg-transparent resize-none py-1 text-[length:var(--font-md)] text-[var(--text)] outline-none font-inherit leading-relaxed min-h-[24px] max-h-[100px] overflow-y-auto h-auto"
              rows={1}
              disabled={isLoading}
            />
          </div>

          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex gap-2 items-center">
              <button
                className={`btn-ghost glass-button w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center transition-colors duration-200 ${isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                  } ${attachedFileName
                    ? " bg-[rgba(199,168,105,0.15)] text-[var(--accent)]"
                    : " bg-transparent text-inherit"
                }`}
                onClick={handleAttachClick}
                aria-label="Attach file"
                disabled={isLoading}
              >
                <FaPaperclip size={16} />
              </button>

              <button
                className={`btn-ghost glass-button w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center transition-all duration-200 ${showSuggestions
                    ? "bg-[rgba(199,168,105,0.2)] text-[var(--accent)]"
                    : "bg-transparent text-inherit"
                }`}
                onClick={() => setShowSuggestions((prev) => !prev)}
                aria-label="Toggle inspiration replies"
                aria-expanded={showSuggestions}
              >
                <FaLightbulb size={16} />
              </button>

              <button
                className="btn-ghost glass-button w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center transition-all duration-200 bg-transparent text-inherit"
                onClick={() => {
                  setMessages([
                    {
                      id: "1",
                      role: "ai",
                      content: getGreeting(),
                      timestamp: new Date(),
                    },
                  ]);
                  showToast({
                    message: "New chat started",
                    type: "success",
                    duration: 2000,
                  });
                }}
                aria-label="Start new chat"
              >
                <FaComments size={16} />
              </button>
            </div>

            <div className="flex gap-2 items-center shrink-0">
              <button
                className={`btn-ghost glass-button min-w-6 w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center${isListening ? " mic-recording" : ""}`}
                onClick={isListening ? stopVoiceInput : startVoiceInput}
                aria-label={isListening ? "Stop recording" : "Voice input"}
                disabled={!isListening && isLoading}
              >
                <MicWaveIcon size={19} active={isListening} />
              </button>

              <button
                className="btn-ghost glass-button w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center bg-transparent text-inherit opacity-70"
                onClick={isListening ? stopVoiceInput : startVoiceInput}
                aria-label="Voice conversation"
                disabled={isLoading}
              >
                <HeadsetWaveIcon size={19} />
              </button>

              <button
                className={`btn glass-button bg-transparent! text-[#C7A869]! w-7 h-7 min-h-fit! border! rounded-full !p-0 flex items-center justify-center ${inputValue.trim() && !isLoading && !isUploading
                    ? "opacity-100 cursor-pointer"
                    : "opacity-50 cursor-not-allowed"
                }`}
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading || isUploading}
                aria-label="Send message"
              >
                <span className="text-[length:var(--font-lg)] font-semibold">
                  <IoIosSend />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="sub text-sm mt-2 text-[length:var(--font-xs)] text-center">
          Press Enter to send, Shift+Enter for new line
        </div>

        {showSuggestions && (
          <div className="mt-4 p-3 rounded-[var(--radius-sm)] bg-[rgba(199,168,105,0.08)] border border-[rgba(199,168,105,0.2)]">
            <div className="row flex justify-between items-center mb-2.5">
              <div className="row flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[rgba(199,168,105,0.2)] flex items-center justify-center text-[var(--accent)]">
                  <FaLightbulb size={14} />
                </span>
                <div>
                  <div className="sub text-[length:var(--font-sm)] font-semibold">
                    Inspiration Reply
                  </div>
                  <div className="sub text-sm text-[length:var(--font-xs)] opacity-70">
                    Free: {Math.max(0, 10 - dailySuggestionUses)}/10 today
                  </div>
                </div>
              </div>
              <button
                className="btn-ghost glass-button w-8 min-w-[32px] h-8 rounded-[10%] flex items-center justify-center p-0"
                onClick={refreshSuggestions}
                aria-label="Refresh inspiration replies"
              >
                <FaSyncAlt size={14} />
              </button>
            </div>

            <div className="col flex flex-col gap-2.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleUseSuggestion(suggestion)}
                  className="text-left glass-card border border-[var(--border)] rounded-[var(--radius-sm)] px-3.5 py-3 flex gap-3 items-start cursor-pointer transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] hover:-translate-y-px"
                >
                  <span className="text-[var(--accent)] flex items-center justify-center mt-0.5">
                    <FaPen size={12} />
                  </span>
                  <span className="text-[length:var(--font-sm)] text-[var(--text)] leading-relaxed">
                    {suggestion}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Friend Management Modal */}
      {showFriendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[101] p-4">
          <div className="glass-card rounded-lg border border-[var(--border)] max-w-md w-full max-h-[90vh] !overflow-y-auto no-scrollbar">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingFriend ? "Edit Character" : "Create Character"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Name (1-50 characters)
                  </label>
                  <input
                    type="text"
                    value={friendName}
                    onChange={(e) => setFriendName(e.target.value)}
                    maxLength={50}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--text)]"
                    placeholder="e.g., Alex, Sam, Jordan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Character Personality (10-500 characters)
                  </label>
                  <textarea
                    value={friendDescription}
                    onChange={(e) => setFriendDescription(e.target.value)}
                    maxLength={500}
                    rows={4}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--text)] resize-none"
                    placeholder="Describe personality, speaking style, interests, and role-play traits."
                  />
                  <div className="text-xs opacity-70 mt-1">
                    {friendDescription.length}/500
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Custom Greeting (Optional, max 500 characters)
                  </label>
                  <textarea
                    value={friendCustomGreeting}
                    onChange={(e) => setFriendCustomGreeting(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--text)] resize-none"
                    placeholder={`Leave empty to use default: "Hi! I'm ${friendName || "[Name]"
                      }, your friend. How can I help you today? Feel free to ask me anything or just chat! 😊"`}
                  />
                  <div className="text-xs opacity-70 mt-1">
                    {friendCustomGreeting.length}/500
                  </div>
                  <div className="text-xs opacity-60 mt-1">
                    If set, this will be used as the greeting message instead of
                    the default.
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Logo (Optional)
                  </label>

                  {/* Default Logo Options */}
                  <div className="mb-4">
                    <div className="text-xs opacity-70 mb-2">
                      Choose a default avatar:
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {defaultLogos.map((logo) => (
                        <button
                          key={logo.id}
                          type="button"
                          onClick={() => handleSelectDefaultLogo(logo.id)}
                          className={`p-2 rounded-lg border-2 transition-all ${selectedDefaultLogo === logo.id
                            ? "border-[var(--accent)] bg-[rgba(199,168,105,0.15)]"
                            : "border-[var(--border)] hover:border-[var(--accent)]"
                            }`}
                        >
                          <img
                            src={logo.url}
                            alt={logo.name}
                            className="w-full aspect-square rounded-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Upload */}
                  <div className="border-t border-[var(--border)] pt-4">
                    <div className="text-xs opacity-70 mb-2">
                      Or upload your own (Max 20 MB):
                    </div>
                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*,.heic,.heif"
                      onChange={handleLogoFileChange}
                      disabled={isUploadingLogo}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      disabled={isUploadingLogo}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--text)] disabled:opacity-50 text-sm font-medium"
                    >
                      {isUploadingLogo ? "Uploading..." : "Choose image from device"}
                    </button>
                    {isUploadingLogo && (
                      <div className="text-xs text-[var(--accent)] mt-1">
                        Uploading...
                      </div>
                    )}
                    {friendLogoUrl && !selectedDefaultLogo && (
                      <div className="mt-2 flex items-center gap-2">
                        <img
                          src={friendLogoUrl}
                          alt="Logo preview"
                          className="w-20 h-20 rounded-full object-cover border border-[var(--border)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFriendLogoUrl("");
                            setSelectedDefaultLogo(null);
                          }}
                          className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg border border-red-500/30 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {(selectedDefaultLogo || friendLogoUrl) && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFriendLogoUrl("");
                            setSelectedDefaultLogo(null);
                          }}
                          className="px-3 py-1.5 text-xs bg-[var(--input-bg)] hover:bg-[var(--border)] text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors"
                        >
                          Remove Logo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowFriendModal(false);
                    resetFriendForm();
                  }}
                  className="flex-1 px-4 py-2 glass-button rounded-lg hover:bg-[var(--border)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={
                    editingFriend ? handleUpdateFriend : handleCreateFriend
                  }
                  disabled={
                    !friendName.trim() ||
                    !friendDescription.trim() ||
                    friendDescription.length < 10
                  }
                  className="flex-1 px-4 py-2 bg-[var(--accent)] text-[#111] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {editingFriend ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFriendSelector &&
        !showFriendModal &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[100001]"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
              onMouseDown={() => setShowFriendSelector(false)}
            />
            <div
              ref={friendSelectorSheetRef}
              role="dialog"
              aria-label="Switch character"
              className="fixed left-0 right-0 bottom-0 z-[100002] bottom-sheet-safe-bottom"
              style={{
                background: "var(--bg)",
                color: "var(--text)",
                borderTop: "1px solid var(--border)",
                borderRadius: "16px 16px 0 0",
                padding: "12px 16px",
                maxHeight: "70vh",
                overflowY: "auto",
                boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.25)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-[length:var(--font-md)]">
                  Switch character
                </div>
                <button
                  type="button"
                  className="btn-ghost glass-button w-8 h-8 rounded-full flex items-center justify-center"
                  onClick={() => setShowFriendSelector(false)}
                  aria-label="Close"
                >
                  <FaTimes size={14} />
                </button>
              </div>

              {aiFriends.length > 0 && (
                <button
                  type="button"
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg mb-2 text-left ${
                    isGroupChat
                      ? "bg-[rgba(199,168,105,0.15)] border border-[rgba(199,168,105,0.3)]"
                      : "glass-button border border-[var(--border)]"
                  }`}
                  onClick={() => {
                    setIsGroupChat(true);
                    setSelectedFriendId(null);
                    setShowFriendSelector(false);
                  }}
                >
                  <img
                    src={
                      aiFriends.length > 0
                        ? friendAvatarUrl(aiFriends[0].name, aiFriends[0].logo_url)
                        : friendAvatarUrl("Group")
                    }
                    alt="Group chat"
                    className="w-9 h-9 rounded-full object-cover border-2 border-[var(--accent)] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">Group Chat</div>
                    <div className="text-xs opacity-70">
                      Chat with all {aiFriends.length} friends
                    </div>
                  </div>
                </button>
              )}

              <div className="flex flex-col gap-2">
                {(showAllFriendsInSheet ? aiFriends : aiFriends.slice(0, 5)).map((friend) => (
                  <div
                    key={friend.id}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg border ${
                      !isGroupChat && selectedFriendId === friend.id
                        ? "bg-[rgba(199,168,105,0.15)] border-[rgba(199,168,105,0.3)]"
                        : "border-[var(--border)] glass-button"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      onClick={() => {
                        setSelectedFriendId(friend.id);
                        setIsGroupChat(false);
                        setShowFriendSelector(false);
                      }}
                    >
                      <img
                        src={
                          friend.logo_url ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            friend.name
                          )}&background=C7A869&color=111&size=40&bold=true`
                        }
                        alt={friend.name}
                        className="w-10 h-10 rounded-full object-cover border border-[var(--border)] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {friend.name}
                          </div>
                          <div className="text-xs opacity-50 text-[var(--accent)] shrink-0">
                            @{friend.username}
                          </div>
                        </div>
                        <div className="text-xs opacity-70 truncate">
                          {(friend.description || "").slice(0, 48)}
                          {(friend.description || "").length > 48 ? "…" : ""}
                        </div>
                      </div>
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowFriendSelector(false);
                          openEditFriendModal(friend);
                        }}
                        className="p-2 rounded-lg hover:bg-[var(--input-bg)]"
                        aria-label={`Edit ${friend.name}`}
                      >
                        <FaEdit size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFriend(friend.id)}
                        className="p-2 rounded-lg hover:bg-[var(--input-bg)] text-red-400"
                        aria-label={`Delete ${friend.name}`}
                      >
                        <FaTrash size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!showAllFriendsInSheet && aiFriends.length > 5 && (
                <button
                  type="button"
                  className="w-full mt-2 glass-button border border-[var(--border)] rounded-lg py-2 text-sm font-medium opacity-80"
                  onClick={() => setShowAllFriendsInSheet(true)}
                >
                  Show {aiFriends.length - 5} more characters
                </button>
              )}

              <button
                type="button"
                className="w-full mt-3 glass-button border border-[var(--border)] rounded-lg py-3 flex items-center justify-center gap-2 font-semibold text-sm"
                onClick={() => {
                  setShowFriendSelector(false);
                  openCreateFriendModal();
                }}
              >
                <FaPlus size={14} />
                Create Character
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
