import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useToast } from "../contexts/ToastContext";
import type { LLMModel, AnswerResult, ExperienceMode, Mode } from "../types";
import { searchAPI } from "../utils/answerEngine";
import { Capacitor } from "@capacitor/core";
import {
  getLocalItem,
  onStorageChange,
  removeLocalItem,
  setLocalItem,
  STORAGE_KEYS,
} from "../utils/storage";
import {
  FaPaperclip,
  FaFolderOpen,
  FaImage,
  FaCamera,
  FaPen,
  FaVideo,
  FaPlus,
  FaTimes,
  FaSpinner,
  FaDownload,
  FaImages,
  FaTools,
  FaFileAlt,
} from "react-icons/fa";
import { IoIosSend } from "react-icons/io";
import MicWaveIcon from "./MicWaveIcon";
import HeadsetWaveIcon from "./HeadsetWaveIcon";
import VoiceOverlay from "./VoiceOverlay";
import { LLMModelSelector } from "./LLMModelSelector";
import { getAuthHeaders, getAuthToken, isAuthenticated } from "../utils/auth";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import syntraGif from "../assets/gif/syntraiq.gif";
import { ExperienceModeButtons } from "./ExperienceModeButtons";
import { getUserData } from "../utils/auth";

import { UploadedFile } from "../types";

interface SearchBarProps {
  selectedModel: LLMModel;
  query: string;
  setQuery: (query: string) => void;
  onSearch: (searchQuery?: string) => void;
  isLoading: boolean;
  showHistory: boolean;
  searchHistory: string[];
  onQuerySelect: (query: string) => void;
  onModelChange: (model: LLMModel) => void;
  /** @deprecated Prefer `onModelChange`. Kept for backward compatibility. */
  setSelectedModel?: (model: LLMModel) => void;
  uploadedFiles?: UploadedFile[];
  onFilesChange?: (files: UploadedFile[]) => void;
  hasAnswer?: boolean;
  searchedQuery?: string;
  isPremium?: boolean;
  onNewConversation?: () => void; // Callback to start new conversation
  onMediaGenerated?: (media: { type: 'image' | 'video'; url: string; prompt: string }) => void; // Callback when media is generated
  answer?: AnswerResult | null;
  currentAnswerText?: string;
  experienceMode?: ExperienceMode;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
  showModelSelector?: boolean;
  queryLimitReached?: boolean;
  onQueryLimitReached?: () => void;
  /** home = default search; analyze = document analysis workspace */
  pageContext?: "home" | "analyze";
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  setQuery,
  onSearch,
  isLoading,
  uploadedFiles = [],
  onFilesChange,
  hasAnswer = false,
  searchedQuery = "",
  isPremium = false,
  onNewConversation,
  onMediaGenerated,
  selectedModel,
  setSelectedModel,
  onModelChange,
  experienceMode = "normal",
  onExperienceModeChange,
  showModelSelector = true,
  queryLimitReached = false,
  onQueryLimitReached,
  pageContext = "home",
}) => {
  const isAnalyzeContext = pageContext === "analyze";
  const showQuickToolCards = !isAnalyzeContext;
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState<"menu" | "camera" | null>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [toolMode, setToolMode] = useState<"image" | "video" | null>(null);
  const [toolDescription, setToolDescription] = useState("");
  const [toolAttachedImages, setToolAttachedImages] = useState<UploadedFile[]>(
    []
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState<string>("");
  const [generatingImages, setGeneratingImages] = useState<UploadedFile[]>([]);
  const [generatedMedia, setGeneratedMedia] = useState<{
    type: "image" | "video";
    url: string;
    prompt: string;
  } | null>(null);
  const [lastToolsMedia, setLastToolsMedia] = useState<{
    type: "image" | "video";
    url: string;
    prompt: string;
  } | null>(null); // Track last media generated in Tools for editing
  const [isCapturing, setIsCapturing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [voiceAnswer, setVoiceAnswer] = useState<AnswerResult | null>(null);
  const [voiceIsLoading, setVoiceIsLoading] = useState(false);
  const [voiceQuery, setVoiceQuery] = useState("");
  const voiceConversationIdRef = useRef<string | null>(null);
  const voiceHistoryRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const { showToast } = useToast();

  const clearVoiceSessionFlags = () => {
    removeLocalItem(STORAGE_KEYS.keepVoiceOverlayOpen);
    removeLocalItem(STORAGE_KEYS.voiceSessionActive);
    removeLocalItem(STORAGE_KEYS.autoListenNext);
    removeLocalItem(STORAGE_KEYS.speakNextAnswer);
    removeLocalItem(STORAGE_KEYS.currentAnswerText);
    removeLocalItem(STORAGE_KEYS.voiceOpenSpeakFirst);
  };

  const resetVoiceSession = () => {
    setVoiceAnswer(null);
    setVoiceQuery("");
    setVoiceIsLoading(false);
    voiceConversationIdRef.current = null;
    voiceHistoryRef.current = [];
    pendingVoiceSpeakRef.current = false;
    clearVoiceSessionFlags();
  };

  const getVoiceSearchParams = () => {
    const backendMode: Mode = experienceMode === "normal" ? "Ask" : "Research";
    const backendSearchType: "auto" | "instant" | "deep" =
      experienceMode === "normal"
        ? "auto"
        : experienceMode === "web_search"
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
    return { backendMode, effectiveSearchType, effectiveModel };
  };

  const performVoiceSearch = async (transcript: string) => {
    const q = transcript.trim();
    if (!q) return;

    if (queryLimitReached) {
      onQueryLimitReached?.();
      return;
    }

    setVoiceQuery(q);
    setVoiceIsLoading(true);
    setVoiceAnswer(null);

    try {
      const { backendMode, effectiveSearchType, effectiveModel } = getVoiceSearchParams();
      const res = await searchAPI(
        q,
        backendMode,
        effectiveModel,
        false,
        [],
        voiceConversationIdRef.current,
        voiceHistoryRef.current,
        effectiveSearchType,
      );

      if (res.conversationId) {
        voiceConversationIdRef.current = res.conversationId;
      }

      const answerText = res.chunks.map((c) => c.text).join("\n\n");
      voiceHistoryRef.current = [
        ...voiceHistoryRef.current,
        { role: "user" as const, content: q },
        { role: "assistant" as const, content: answerText },
      ].slice(-20);

      setVoiceAnswer(res);
      localStorage.setItem("syntraiq-speak-next-answer", "1");
      localStorage.setItem("syntraiq-keep-voice-overlay-open", "1");
      localStorage.setItem("syntraiq-voice-session-active", "1");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Voice search failed";
      showToast({ message, type: "error", duration: 3000 });
    } finally {
      setVoiceIsLoading(false);
    }
  };

  // Reopen voice overlay when answer text is written during an active voice session
  useEffect(() => {
    const reopenIfNeeded = () => {
      const shouldKeepOpen = getLocalItem(STORAGE_KEYS.keepVoiceOverlayOpen);
      const currentAnswerText = getLocalItem(STORAGE_KEYS.currentAnswerText);

      if (shouldKeepOpen && currentAnswerText && showVoiceOverlay) {
        setLocalItem(STORAGE_KEYS.voiceSessionActive, "1");
        removeLocalItem(STORAGE_KEYS.keepVoiceOverlayOpen);
      }
    };

    reopenIfNeeded();
    return onStorageChange(reopenIfNeeded);
  }, [voiceIsLoading, voiceAnswer, showVoiceOverlay]);
  const { navigateTo } = useRouterNavigation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const hasClearedForAnswerRef = useRef<boolean>(false);
  const voiceSilenceTimerRef = useRef<number | null>(null);
  const voiceInputModeRef = useRef<"dictation" | "session">("dictation");
  const uploadBtnRef = useRef<HTMLButtonElement>(null);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const attachBackdropRef = useRef<HTMLDivElement>(null);

  const closeAttachModal = () => setShowAttachModal(null);

  const openAttachMenu = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowAttachModal("menu");
  };

  const pickAttachment = (kind: "files" | "image" | "camera") => {
    if (kind === "camera") {
      setShowAttachModal("camera");
      void startCameraCapture();
      return;
    }

    closeAttachModal();

    window.setTimeout(() => {
      const input = fileInputRef.current;
      if (!input) return;
      input.removeAttribute("capture");
      input.multiple = true;
      if (kind === "image") {
        input.accept = "image/jpeg,image/png,image/gif,image/webp";
      } else {
        input.accept =
          "image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }
      input.click();
    }, 120);
  };

  // Check for speech support
  useEffect(() => {
    const hasSpeechRecognition =
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    // For voice input (microphone), we only need speech recognition
    // Voice output (text-to-speech) is checked separately when used
    // Enable the mic button if speech recognition is available
    setSpeechSupported(hasSpeechRecognition);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        inputRef.current?.blur();
        if (isListening) {
          stopVoiceInput();
        }
        if (isSpeaking) {
          stopVoiceOutput();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isListening, isSpeaking]);

  // Reset textarea height when query changes externally (e.g., from voice input)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(
        inputRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [query]);

  // Clear input when answer is received (but keep searchedQuery for display in AnswerCard)
  useEffect(() => {
    if (hasAnswer && !isListening && query && !hasClearedForAnswerRef.current) {
      // Clear the input field when answer is first received
      // The searchedQuery will still be displayed in AnswerCard
      setQuery("");
      hasClearedForAnswerRef.current = true;
    } else if (!hasAnswer) {
      // Reset the flag when there's no answer (new search started)
      hasClearedForAnswerRef.current = false;
    }
    // Removed 'query' from dependencies to prevent infinite loop when clearing
  }, [hasAnswer, isListening]); // Clear when answer is received

  // Initialize query with searchedQuery when entering follow-up mode (only if user hasn't typed anything)
  useEffect(() => {
    // Only set query from searchedQuery if input is empty and we have an answer
    // This allows the user to start typing a follow-up without it being overwritten
    if (hasAnswer && searchedQuery && !query) {
      // Don't auto-populate - let user type their follow-up
      // This effect is kept for potential future use but currently does nothing
    }
  }, [hasAnswer, searchedQuery, query]);

  const handleTryMaxClick = () => {
    const user = getUserData();
    if (user?.isPremium) {
      const maxModel = "gpt-4o" as LLMModel;
      (setSelectedModel ?? onModelChange)(maxModel);
      localStorage.setItem("syntraiq-selected-model", maxModel);
      showToast({ message: "SyntraIQ Max model selected", type: "success", duration: 2500 });
      return;
    }
    navigateTo("/subscription");
  };

  const canSubmitSearch =
    Boolean(query.trim()) || uploadedFiles.length > 0;

  const triggerSearchWithScroll = () => {
    if (!canSubmitSearch || isLoading) return;
    if (queryLimitReached) {
      onQueryLimitReached?.();
      return;
    }
    inputRef.current?.blur();
    const trimmed = query.trim();
    onSearch(trimmed || undefined);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (query.trim() || uploadedFiles.length > 0) {
        triggerSearchWithScroll();
      }
    }
  };

  // NOTE: query copy UX is currently disabled in the UI (button commented out).

  const startVoiceInput = (mode: "dictation" | "session" = "session") => {
    if (!speechSupported) {
      alert("Voice input is not supported in this browser");
      return;
    }

    voiceInputModeRef.current = mode;

    if (mode === "session") {
      setShowVoiceOverlay(true);
      localStorage.setItem("syntraiq-voice-session-active", "1");
    }

    // Stop any ongoing TTS playback before starting a new recording
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
    } catch { }

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

    let finalTranscript = "";
    let shouldRestartAfterSilencePrompt = false;

    const clearSilenceTimer = () => {
      if (voiceSilenceTimerRef.current) {
        window.clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = null;
      }
    };

    const startSilenceTimer = () => {
      if (mode === "dictation") return;
      clearSilenceTimer();
      voiceSilenceTimerRef.current = window.setTimeout(() => {
        // If user hasn't spoken in 10s, prompt and continue listening cycle.
        if (!finalTranscript.trim()) {
          shouldRestartAfterSilencePrompt = true;
          try {
            recognition.stop();
          } catch { }
          try {
            if ("speechSynthesis" in window) {
              window.speechSynthesis.cancel();
              const nudge = new SpeechSynthesisUtterance(
                "Please give me an input so I can help you."
              );
              nudge.rate = 1;
              nudge.pitch = 1;
              nudge.volume = 1;
              window.speechSynthesis.speak(nudge);
            }
          } catch { }
        }
      }, 10_000);
    };

    recognition.onstart = () => {
      setIsListening(true);
      setShowUploadMenu(false); // Close upload menu when recording starts
      startSilenceTimer();
    };

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim();
      // If user starts speaking while TTS is in progress, barge-in and stop TTS.
      if (mode === "session") {
        try {
          if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
          }
        } catch { }
      }
      if (transcript) {
        setQuery(transcript);
        finalTranscript = transcript;
      }
      clearSilenceTimer();
    };

    recognition.onend = () => {
      clearSilenceTimer();
      setIsListening(false);

      if (shouldRestartAfterSilencePrompt) {
        shouldRestartAfterSilencePrompt = false;
        // Resume listening after the spoken prompt ends.
        window.setTimeout(() => {
          const voiceSessionActive =
            localStorage.getItem("syntraiq-voice-session-active") === "1";
          if (voiceSessionActive && showVoiceOverlay) {
            startVoiceInput("session");
          }
        }, 1800);
        return;
      }

      if (mode === "dictation") {
        if (finalTranscript.trim()) {
          setQuery(finalTranscript);
        }
        inputRef.current?.focus();
        return;
      }

      // Auto-trigger voice search when recording stops — isolated from home page chat
      if (finalTranscript.trim()) {
        console.log('🎤 Voice input complete, transcript:', finalTranscript);
        setQuery(finalTranscript);
        void performVoiceSearch(finalTranscript);
        setTimeout(() => {
          setQuery("");
        }, 100);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      clearSilenceTimer();
      setIsListening(false);
      if (event.error === "not-allowed") {
        const isNative = Capacitor.isNativePlatform();
        showToast({
          message: isNative
            ? "Microphone access denied. Please allow microphone access in your device settings and try again."
            : "Microphone access denied. Please allow microphone access in your browser settings and try again.",
          type: "error",
          duration: 4000,
        });
      } else if (event.error === "no-speech") {
        showToast({
          message: "No speech detected. Please try again.",
          type: "error",
          duration: 3000,
        });
      } else {
        showToast({
          message: `Speech recognition error: ${event.error}. Please try again.`,
          type: "error",
          duration: 3000,
        });
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceInput = () => {
    if (voiceSilenceTimerRef.current) {
      window.clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  // Voice output helpers

  const stopVoiceOutput = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const speakTextImmediately = (text: string) => {
    const content = (text || "")
      .replace(/\bundefined\b/gi, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (!content) return;
    try {
      if (!("speechSynthesis" in window)) {
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 0.9;
      let resumeKeepAlive: number | null = null;
      let spokenOffset = 0;

      utterance.onstart = () => {
        setIsSpeaking(true);
        localStorage.setItem("syntraiq-current-answer-text", "");
        resumeKeepAlive = window.setInterval(() => {
          try {
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
          } catch { /* ignore */ }
        }, 10000);
      };

      utterance.onboundary = (event) => {
        if (event.name !== "word" && event.charIndex <= spokenOffset) return;
        spokenOffset = event.charIndex + (event.charLength || 0);
        const slice = content.slice(0, spokenOffset).trim();
        if (slice) {
          localStorage.setItem("syntraiq-current-answer-text", slice);
        }
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        localStorage.setItem("syntraiq-current-answer-text", content);
        if (resumeKeepAlive) { clearInterval(resumeKeepAlive); resumeKeepAlive = null; }
        const voiceSessionActive =
          localStorage.getItem("syntraiq-voice-session-active") === "1";
        if (voiceSessionActive) {
          localStorage.setItem("syntraiq-auto-listen-next", "1");
        }
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        localStorage.setItem("syntraiq-current-answer-text", content);
        if (resumeKeepAlive) { clearInterval(resumeKeepAlive); resumeKeepAlive = null; }
      };
      window.setTimeout(() => window.speechSynthesis.speak(utterance), 100);
    } catch {
      setIsSpeaking(false);
    }
  };

  // When a voice query answer arrives, speak it directly from SearchBar.
  // Uses voice-only state so home page chat is never updated.
  const pendingVoiceSpeakRef = useRef(false);
  useEffect(() => {
    if (localStorage.getItem("syntraiq-speak-next-answer") === "1") {
      pendingVoiceSpeakRef.current = true;
    }
    if (!pendingVoiceSpeakRef.current) return;
    if (voiceIsLoading) return;
    const chunks = voiceAnswer?.chunks;
    if (!chunks || chunks.length === 0) return;
    localStorage.removeItem("syntraiq-speak-next-answer");
    pendingVoiceSpeakRef.current = false;
    const answerText = chunks.map((c) => c.text).join("\n\n");
    speakTextImmediately(answerText);
  }, [voiceAnswer, voiceIsLoading]);

  // When an answer finishes in active voice session, start listening again automatically.
  useEffect(() => {
    const tryAutoListen = () => {
      const shouldAutoListen =
        getLocalItem(STORAGE_KEYS.autoListenNext) === "1";
      const voiceSessionActive =
        getLocalItem(STORAGE_KEYS.voiceSessionActive) === "1";
      if (shouldAutoListen && voiceSessionActive && showVoiceOverlay && !isListening) {
        removeLocalItem(STORAGE_KEYS.autoListenNext);
        startVoiceInput("session");
      }
    };

    tryAutoListen();
    return onStorageChange(tryAutoListen);
  }, [showVoiceOverlay, isListening, voiceIsLoading, voiceAnswer]);

  const getFileType = (file: File): "image" | "document" | "other" => {
    if (file.type.startsWith("image/")) return "image";
    if (
      file.type.startsWith("text/") ||
      file.type.includes("pdf") ||
      file.type.includes("document") ||
      file.type.includes("csv") ||
      file.type.includes("word") ||
      file.type.includes("msword") ||
      file.type.includes("wordprocessingml") ||
      file.type.includes("opendocument") ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".doc") ||
      file.name.endsWith(".docx") ||
      file.name.endsWith(".odt") ||
      file.name.endsWith(".pdf")
    )
      return "document";
    return "other";
  };

  // Check if file is video (should be blocked)
  const isVideoFile = (file: File): boolean => {
    return (
      file.type.startsWith("video/") ||
      file.name.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/i) !== null
    );
  };

  // Check if file is GIF (should be blocked)
  const isGifFile = (file: File): boolean => {
    return (
      file.type === "image/gif" ||
      file.name.match(/\.gif$/i) !== null
    );
  };

  const createFilePreview = (file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        resolve(undefined);
      }
    });
  };

  // API functions for media generation
  const generateImage = async (
    prompt: string,
    aspectRatio: string = "1:1",
    referenceImages?: File | File[]
  ): Promise<{
    url: string;
    prompt: string;
    width: number;
    height: number;
    aspectRatio: string;
    provider: string;
  }> => {
    const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (!baseUrl) {
      throw new Error(
        "API URL not configured. Please set VITE_API_URL in your .env file."
      );
    }

    const hasReferenceImages = Array.isArray(referenceImages)
      ? referenceImages.length > 0
      : Boolean(referenceImages);

    if (hasReferenceImages) {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("aspectRatio", aspectRatio);
      const files = Array.isArray(referenceImages)
        ? referenceImages
        : referenceImages
          ? [referenceImages]
          : [];
      files.forEach((file) => formData.append("referenceImages", file));
      if (files[0]) formData.append("referenceImage", files[0]);

      const token = getAuthToken();
      const res = await fetch(
        `${baseUrl.replace(/\/+$/, "")}/api/media/generate-image`,
        {
          method: "POST",
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: formData,
        }
      );

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `Image generation failed with status ${res.status}`
        );
      }

      const data = await res.json();
      return data.image;
    }

    // Regular JSON request without reference image
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/media/generate-image`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ prompt, aspectRatio }),
      }
    );

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        errorData.error || `Image generation failed with status ${res.status}`
      );
    }

    const data = await res.json();
    return data.image;
  };

  const generateVideo = async (
    prompt: string,
    duration: number = 5,
    aspectRatio: string = "16:9",
    referenceImages?: File | File[]
  ): Promise<{
    url: string;
    prompt: string;
    duration: number;
    width: number;
    height: number;
    aspectRatio: string;
    provider: string;
  }> => {
    const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (!baseUrl) {
      throw new Error(
        "API URL not configured. Please set VITE_API_URL in your .env file."
      );
    }

    const hasReferenceImages = Array.isArray(referenceImages)
      ? referenceImages.length > 0
      : Boolean(referenceImages);

    if (hasReferenceImages) {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("duration", duration.toString());
      formData.append("aspectRatio", aspectRatio);
      const files = Array.isArray(referenceImages)
        ? referenceImages
        : referenceImages
          ? [referenceImages]
          : [];
      files.forEach((file) => formData.append("referenceImages", file));
      if (files[0]) formData.append("referenceImage", files[0]);

      const token = getAuthToken();
      const res = await fetch(
        `${baseUrl.replace(/\/+$/, "")}/api/media/generate-video`,
        {
          method: "POST",
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: formData,
        }
      );

      if (res.status === 429) {
        const limitData = await res.json().catch(() => ({}));
        const msg = limitData.error || "Daily video generation limit reached.";
        const used: number = limitData.used ?? 0;
        const limit: number = limitData.limit ?? 0;
        const tier: string = limitData.tier ?? '';
        const upgradeHint = tier === 'pro'
          ? " Upgrade to Max for 12 videos/day."
          : "";
        throw new Error(`${msg} (${used}/${limit} used)${upgradeHint}`);
      }

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `Video generation failed with status ${res.status}`
        );
      }

      const data = await res.json();
      return data.video;
    }

    // Regular JSON request without reference image
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/media/generate-video`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ prompt, duration, aspectRatio }),
      }
    );

    if (res.status === 429) {
      const limitData = await res.json().catch(() => ({}));
      const msg = limitData.error || "Daily video generation limit reached.";
      const used: number = limitData.used ?? 0;
      const limit: number = limitData.limit ?? 0;
      const tier: string = limitData.tier ?? '';
      const upgradeHint = tier === 'pro'
        ? " Upgrade to Max for 12 videos/day."
        : "";
      throw new Error(`${msg} (${used}/${limit} used)${upgradeHint}`);
    }

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        errorData.error || `Video generation failed with status ${res.status}`
      );
    }

    const data = await res.json();
    return data.video;
  };

  // Check if prompt is an edit request
  const isEditRequest = (prompt: string): boolean => {
    const lowerPrompt = prompt.toLowerCase().trim();
    const editKeywords = [
      'edit', 'change', 'modify', 'update', 'alter', 'adjust',
      'better', 'make better', 'improve', 'enhance',
      'add to', 'add more', 'remove from', 'remove the', 'remove',
      'make it', 'make the', 'turn it', 'turn the',
      'that image', 'the image', 'this image',
      'brighter', 'darker', 'lighter', 'clearer'
    ];
    return editKeywords.some(keyword => lowerPrompt.includes(keyword));
  };

  // Handle tool generation
  const handleGenerateMedia = async () => {
    // Check if we have a prompt
    if (!toolDescription.trim()) {
      showToast({
        message: "Please enter a description",
        type: "error",
        duration: 3000,
      });
      return;
    }

    const promptToUse = toolDescription.trim();

    let referenceImages: File[] = toolAttachedImages.map((img) => img.file);

    // If no reference images attached but prompt is an edit request and we have last media
    if (referenceImages.length === 0 && isEditRequest(promptToUse) && lastToolsMedia) {
      console.log('🔍 Edit request detected in Tools - using previous media as reference');
      console.log(`📸 Previous media: ${lastToolsMedia.type} - "${lastToolsMedia.prompt}"`);

      if (lastToolsMedia.type === 'image') {
        try {
          const response = await fetch(lastToolsMedia.url);
          const blob = await response.blob();
          const file = new File([blob], 'reference.png', { type: 'image/png' });
          referenceImages = [file];
          console.log('✅ Using last generated image as reference for editing');
        } catch (error) {
          console.error('Failed to load previous image as reference:', error);
        }
      } else if (lastToolsMedia.type === 'video') {
        // Video edit: backend will use the whole video as reference via File API (file_uri)
        // Don't send a frame - backend looks up last video and passes it as reference video
        console.log('📹 Last media was video - backend will use whole video as reference (video-to-video)');
      }
    }

    setIsGenerating(true);
    setGeneratingPrompt(promptToUse);
    setGeneratingImages(toolAttachedImages);
    setGeneratedMedia(null);
    setToolDescription("");
    setToolAttachedImages([]);

    const referencePayload =
      referenceImages.length > 0 ? referenceImages : undefined;

    try {
      if (toolMode === "image") {
        const result = await generateImage(promptToUse, "1:1", referencePayload);
        const mediaData = {
          type: "image" as const,
          url: result.url,
          prompt: result.prompt,
        };
        setGeneratedMedia(mediaData);
        setLastToolsMedia(mediaData); // Save for future edits

        // Notify parent to add to conversation history
        if (onMediaGenerated) {
          onMediaGenerated(mediaData);
        }

        showToast({
          message: referencePayload
            ? "Image generated using reference image(s)!"
            : "Image generated successfully!",
          type: "success",
          duration: 3000,
        });
      } else if (toolMode === "video") {
        const result = await generateVideo(promptToUse, 5, "16:9", referencePayload);
        const mediaData = {
          type: "video" as const,
          url: result.url,
          prompt: result.prompt,
        };
        setGeneratedMedia(mediaData);
        setLastToolsMedia(mediaData); // Save for future edits

        // Notify parent to add to conversation history
        if (onMediaGenerated) {
          onMediaGenerated(mediaData);
        }

        showToast({
          message: referencePayload
            ? "Video generated using reference image(s)!"
            : "Video generated successfully!",
          type: "success",
          duration: 3000,
        });
      }
    } catch (error: any) {
      console.error("Media generation error:", error);
      let errorMessage = "Failed to generate media. Please try again.";

      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      // Handle specific error cases
      if (
        errorMessage.includes("limit reached") ||
        errorMessage.includes("Daily")
      ) {
        showToast({
          message: errorMessage,
          type: "error",
          duration: 5000,
        });
      } else if (
        errorMessage.includes("requires") ||
        errorMessage.includes("subscription") ||
        errorMessage.includes("tier")
      ) {
        showToast({
          message: errorMessage,
          type: "error",
          duration: 5000,
        });
      } else {
        showToast({
          message: errorMessage,
          type: "error",
          duration: 4000,
        });
      }
    } finally {
      setIsGenerating(false);
      setGeneratingPrompt("");
      setGeneratingImages([]);
    }
  };

  // Handle download of generated media
  const handleDownloadMedia = async () => {
    if (!generatedMedia) return;

    try {
      const response = await fetch(generatedMedia.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `generated-${generatedMedia.type}-${Date.now()}.${generatedMedia.type === "image" ? "png" : "mp4"
        }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast({
        message: `${generatedMedia.type === "image" ? "Image" : "Video"
          } downloaded successfully!`,
        type: "success",
        duration: 2000,
      });
    } catch (error) {
      console.error("Download error:", error);
      showToast({
        message: "Failed to download media",
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleFileUpload = async (files: File[] | null) => {
    if (!files || files.length === 0) return;

    // Handle tool mode file uploads (for image generation reference)
    if (toolMode) {
      const maxFiles = isPremium ? 5 : 2;
      const currentFileCount = toolAttachedImages.length;

      if (currentFileCount >= maxFiles) {
        showToast({
          message: `Maximum ${maxFiles} image${maxFiles > 1 ? "s" : ""} allowed for ${toolMode === "image" ? "image" : "video"} generation.`,
          type: "error",
          duration: 3000,
        });
        return;
      }

      const newFiles: UploadedFile[] = [];
      const rejectedFiles: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Only allow images for tool mode
        if (!file.type.startsWith("image/")) {
          rejectedFiles.push(file.name);
          continue;
        }

        // Block GIF files
        if (isGifFile(file)) {
          rejectedFiles.push(file.name);
          continue;
        }

        if (currentFileCount + newFiles.length >= maxFiles) {
          break;
        }

        const preview = await createFilePreview(file);

        newFiles.push({
          id: `${Date.now()}-${i}-${Math.random()}`,
          file,
          type: "image",
          preview,
        });
      }

      if (rejectedFiles.length > 0) {
        const hasGifs = rejectedFiles.some(name => name.match(/\.gif$/i));
        showToast({
          message: hasGifs
            ? `GIF files are not supported. Only static images are allowed for ${toolMode === "image" ? "image" : "video"} generation.`
            : `Only image files are supported for ${toolMode === "image" ? "image" : "video"} generation.`,
          type: "error",
          duration: 3000,
        });
      }

      if (newFiles.length > 0) {
        setToolAttachedImages((prev) => [...prev, ...newFiles]);
      }
      return;
    }

    // Handle regular file uploads
    if (!onFilesChange) return;

    const maxFiles = isPremium ? 5 : 2;
    const currentFileCount = uploadedFiles.length;

    // Check total file limit
    if (currentFileCount >= maxFiles) {
      showToast({
        message: `Maximum ${maxFiles} file${maxFiles > 1 ? "s" : ""} allowed. ${isPremium ? "Premium" : "Free"
          } users can upload up to ${maxFiles} files.`,
        type: "error",
        duration: 4000,
      });
      return;
    }

    const newFiles: UploadedFile[] = [];
    const rejectedFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Block video files
      if (isVideoFile(file)) {
        rejectedFiles.push(file.name);
        continue;
      }

      // Block GIF files
      if (isGifFile(file)) {
        rejectedFiles.push(file.name);
        continue;
      }

      // Check if adding this file would exceed limit
      if (currentFileCount + newFiles.length >= maxFiles) {
        showToast({
          message: `Maximum ${maxFiles} file${maxFiles > 1 ? "s" : ""
            } allowed. Some files were not added.`,
          type: "error",
          duration: 4000,
        });
        break;
      }

      const type = getFileType(file);
      const preview = await createFilePreview(file);

      newFiles.push({
        id: `${Date.now()}-${i}-${Math.random()}`,
        file,
        type,
        preview,
      });
    }

    if (rejectedFiles.length > 0) {
      const hasVideos = rejectedFiles.some(name =>
        name.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/i) !== null
      );
      const hasGifs = rejectedFiles.some(name => name.match(/\.gif$/i));
      let message = "";

      if (hasVideos && hasGifs) {
        message = `Video and GIF files are not supported. ${rejectedFiles.length} file${rejectedFiles.length > 1 ? "s" : ""} rejected.`;
      } else if (hasVideos) {
        message = `Video files are not supported. ${rejectedFiles.length} file${rejectedFiles.length > 1 ? "s" : ""} rejected.`;
      } else if (hasGifs) {
        message = `GIF files are not supported. ${rejectedFiles.length} file${rejectedFiles.length > 1 ? "s" : ""} rejected.`;
      } else {
        message = `${rejectedFiles.length} file${rejectedFiles.length > 1 ? "s" : ""} rejected.`;
      }

      showToast({
        message,
        type: "error",
        duration: 4000,
      });
    }

    if (newFiles.length > 0 && onFilesChange) {
      onFilesChange([...uploadedFiles, ...newFiles]);
    }
  };

  const removeFile = (fileId: string) => {
    if (!onFilesChange) return;
    onFilesChange(uploadedFiles.filter((f) => f.id !== fileId));
  };

  const startCameraCapture = async () => {
    try {
      setIsCapturing(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      setIsCapturing(false);
      setShowAttachModal(null);
      showToast({
        message: "Could not access camera. Please allow camera permission and try again.",
        type: "error",
        duration: 4000,
      });
    }
  };

  const stopCameraCapture = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
    setShowAttachModal(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !onFilesChange) return;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    context.drawImage(videoRef.current, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `camera-capture-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          const newFile: UploadedFile = {
            id: `${Date.now()}-${Math.random()}`,
            file,
            type: "image",
            preview: canvas.toDataURL("image/jpeg"),
          };
          onFilesChange([...uploadedFiles, newFile]);
        }
      },
      "image/jpeg",
      0.8
    );

    stopCameraCapture();
  };

  // Cleanup camera stream and voice on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Close upload menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showUploadMenu &&
        !(event.target as Element).closest("[data-upload-menu]")
      ) {
        setShowUploadMenu(false);
      }
    };

    if (showUploadMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUploadMenu]);

  // Close tools menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showToolsMenu &&
        !(event.target as Element).closest("[data-tools-menu]")
      ) {
        setShowToolsMenu(false);
      }
    };

    if (showToolsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showToolsMenu]);

  useEffect(() => {
    if (!showAttachModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showAttachModal === "camera") {
          stopCameraCapture();
        } else {
          closeAttachModal();
        }
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAttachModal]);

  return (
    <>
      {/* Tools Container - Responsive Layout */}
      {!toolMode && !hasAnswer && showQuickToolCards && (
        <>
          {/* Mobile horizontal scrollable container */}
          <div
            className="search-tools-scroll flex md:!hidden mb-1"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              overflowX: "auto",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
              paddingBottom: 2,
            }}
          >
            <style>{`.search-tools-scroll::-webkit-scrollbar { display: none; }`}</style>
            {!isPremium && (
              <button
                className="btn-ghost glass-button btn-shadow !border-yellow-600 !text-yellow-600"
                onClick={handleTryMaxClick}
                style={{
                  padding: "6px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  flexShrink: 0,
                  borderRadius: "20px",
                  background: "var(--card)",
                  fontWeight: 500,
                }}
              >
                <img
                  src={syntraGif}
                  loading="eager"
                  alt="SyntraIQ"
                  className="rounded-full w-6 h-6 object-cover"
                  style={{ display: "block" }}
                />
                <span style={{ fontSize: "var(--font-sm)", whiteSpace: "nowrap" }}>
                  Try SyntraIQ Max
                </span>
              </button>
            )}
            <button
              className="btn-ghost glass-button btn-shadow !font-normal"
              onClick={() => navigateTo("/create?mode=video")}
              disabled={isListening || isGenerating}
              style={{
                padding: "6px 10px",
                opacity: isListening || isGenerating ? 0.5 : 1,
                cursor: isListening || isGenerating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                borderRadius: "20px",
                background: "var(--card)",
              }}
            >
              <FaVideo size={14} />
              <span style={{ fontSize: "var(--font-sm)", whiteSpace: "nowrap" }}>
                Create Videos
              </span>
            </button>
            <button
              className="btn-ghost glass-button btn-shadow !font-normal"
              onClick={() => navigateTo("/create?mode=image")}
              disabled={isListening || isGenerating}
              style={{
                padding: "6px 10px",
                opacity: isListening || isGenerating ? 0.5 : 1,
                cursor: isListening || isGenerating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                borderRadius: "20px",
                background: "var(--card)",
              }}
            >
              <FaImage size={14} />
              <span style={{ fontSize: "var(--font-sm)", whiteSpace: "nowrap" }}>
                Generate Image
              </span>
            </button>
            <button
              className="btn-ghost glass-button btn-shadow !font-normal"
              onClick={() => navigateTo("/analyze")}
              disabled={isListening || isGenerating}
              style={{
                padding: "6px 10px",
                opacity: isListening || isGenerating ? 0.5 : 1,
                cursor: isListening || isGenerating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                borderRadius: "20px",
                background: "var(--card)",
              }}
            >
              <FaFileAlt size={14} />
              <span style={{ fontSize: "var(--font-sm)", whiteSpace: "nowrap" }}>
                Analyze Doc
              </span>
            </button>
            <button
              className="btn-ghost glass-button btn-shadow !font-normal"
              onClick={() => {
                if (isAuthenticated()) {
                  navigateTo("/gallery");
                } else {
                  showToast({
                    message: "Please log in to view your gallery",
                    type: "error",
                    duration: 3000,
                  });
                }
              }}
              disabled={isListening || isGenerating}
              style={{
                padding: "6px 10px",
                opacity: isListening || isGenerating ? 0.5 : 1,
                cursor: isListening || isGenerating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                borderRadius: "20px",
                background: "var(--card)",
              }}
            >
              <FaImages size={14} />
              <span style={{ fontSize: "var(--font-sm)", whiteSpace: "nowrap" }}>
                View Gallery
              </span>
            </button>
            <button
              className="btn-ghost glass-button btn-shadow !font-normal"
              onClick={() => navigateTo("/sleep-disorders")}
              disabled={isListening || isGenerating}
              style={{
                padding: "6px 10px",
                opacity: isListening || isGenerating ? 0.5 : 1,
                cursor: isListening || isGenerating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
                borderRadius: "20px",
                background: "var(--card)",
              }}
            >
              <span style={{ fontSize: "var(--font-sm)", whiteSpace: "nowrap" }}>
                Sleep Disorders
              </span>
            </button>
          </div>

          {/* Desktop dropdown container */}
          <div className="hidden md:flex relative mb-2" data-tools-menu>
            <button
              ref={toolsBtnRef}
              className={`btn-ghost  glass-button btn-shadow !font-normal ${toolMode ? "!text-black" : ""
                }`}
              onClick={() => {
                if (toolMode) {
                  // Exit tool mode
                  setToolMode(null);
                  setToolDescription("");
                  setToolAttachedImages([]);
                  setGeneratedMedia(null);
                  setLastToolsMedia(null); // Clear for next session
                } else {
                  // Toggle tools menu
                  setShowToolsMenu(!showToolsMenu);
                }
              }}
              aria-label="Tools"
              disabled={isListening || isGenerating}
              style={{
                padding: "8px 12px",
                opacity: isListening || isGenerating ? 0.5 : 1,
                cursor: isListening || isGenerating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                background: toolMode ? "var(--accent)" : "transparent",
                color: toolMode ? "white" : "inherit",
              }}
            >
              <FaTools size={16} />
              <span style={{ fontSize: "var(--font-md)" }}>Tools</span>
            </button>

            {showToolsMenu && (() => {
              const rect = toolsBtnRef.current?.getBoundingClientRect();
              return (
              <div
                className="glass-panel !font-normal"
                data-tools-menu
                style={{
                  position: "fixed",
                  bottom: rect ? window.innerHeight - rect.top + 8 : 0,
                  left: rect ? rect.left : 0,
                  padding: 8,
                  zIndex: 9999,
                  minWidth: 200,
                  color: "var(--text)",
                }}
              >
                {!isPremium && (
                  <button
                    className="btn-ghost glass-button btn-shadow"
                    onClick={() => {
                      setShowToolsMenu(false);
                      handleTryMaxClick();
                    }}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      marginBottom: 4,
                      color: "#dfb768",
                      fontWeight: 500,
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <img src={syntraGif} alt="" className="w-4 h-4 rounded-full object-cover" />
                      Try SyntraIQ Max
                    </span>
                  </button>
                )}

                <button
                  className="btn-ghost glass-button btn-shadow"
                  onClick={() => {
                    setShowToolsMenu(false);
                    navigateTo("/create?mode=video");
                  }}
                  disabled={isListening || isGenerating}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    marginBottom: 4,
                    opacity: isListening || isGenerating ? 0.5 : 1,
                    cursor:
                      isListening || isGenerating ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <FaVideo size={16} /> Create Videos
                  </span>
                </button>

                <button
                  className="btn-ghost glass-button btn-shadow"
                  onClick={() => {
                    setShowToolsMenu(false);
                    navigateTo("/create?mode=image");
                  }}
                  disabled={isListening || isGenerating}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    marginBottom: 4,
                    opacity: isListening || isGenerating ? 0.5 : 1,
                    cursor:
                      isListening || isGenerating ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <FaImage size={16} /> Generate Image
                  </span>
                </button>

                <button
                  className="btn-ghost glass-button btn-shadow"
                  onClick={() => {
                    setShowToolsMenu(false);
                    navigateTo("/analyze");
                  }}
                  disabled={isListening || isGenerating}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    marginBottom: 4,
                    opacity: isListening || isGenerating ? 0.5 : 1,
                    cursor:
                      isListening || isGenerating ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <FaFileAlt size={16} /> Analyze Doc
                  </span>
                </button>

                <div
                  style={{
                    height: 1,
                    background: "var(--border)",
                    margin: "8px 0",
                  }}
                />

                <button
                  className="btn-ghost glass-button btn-shadow"
                  onClick={() => {
                    setShowToolsMenu(false);
                    if (isAuthenticated()) {
                      navigateTo("/gallery");
                    } else {
                      showToast({
                        message: "Please log in to view your gallery",
                        type: "error",
                        duration: 3000,
                      });
                    }
                  }}
                  disabled={isListening || isGenerating}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    opacity: isListening || isGenerating ? 0.5 : 1,
                    cursor:
                      isListening || isGenerating ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <FaImages size={16} /> View Gallery
                  </span>
                </button>

                <button
                  className="btn-ghost glass-button btn-shadow"
                  onClick={() => {
                    setShowToolsMenu(false);
                    navigateTo("/sleep-disorders");
                  }}
                  disabled={isListening || isGenerating}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    marginTop: 4,
                    opacity: isListening || isGenerating ? 0.5 : 1,
                    cursor:
                      isListening || isGenerating ? "not-allowed" : "pointer",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    Sleep Disorders
                  </span>
                </button>
              </div>
              );
            })()}
          </div>
        </>
      )}
      {!toolMode && onExperienceModeChange && (
        <div className="mb-2 px-1">
          <ExperienceModeButtons
            experienceMode={experienceMode}
            onExperienceModeChange={onExperienceModeChange}
            disabled={isLoading || isListening}
            size="small"
          />
        </div>
      )}
      <div
        className="glass-card font-ubuntu !px-3 !pt-1 !pb-2 no-scrollbar !overflow-x-hidden"
        style={{
          position: "relative",
          overflow: "visible",
          zIndex: 1,
        }}
      >


        {/* Generating State Display - Above Search Bar */}
        {isGenerating && generatingPrompt && (
          <div style={{ marginBottom: 16 }}>
            <div
              className="sub text-sm"
              style={{ marginBottom: 8, fontWeight: 500 }}
            >
              Generating {toolMode === "image" ? "Image" : "Video"}
            </div>
            <div className="glass-card" style={{ padding: 12, position: "relative" }}>
              {generatingImages && generatingImages.length > 0 && (
                <div style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 12,
                  flexWrap: "wrap",
                  padding: "0 4px"
                }}>
                  {generatingImages.map((img) => (
                    <div
                      key={img.id}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 6,
                        overflow: "hidden",
                        border: "1px solid var(--border)",
                        position: "relative"
                      }}
                    >
                      {img.preview ? (
                        <img
                          src={img.preview}
                          alt="Reference"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <div style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "20px"
                        }}>Frame</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div
                style={{
                  fontSize: "var(--font-md)",
                  color: "var(--text)",
                  fontWeight: 500,
                  padding: "8px 12px",
                  background: "var(--border)",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: 12,
                }}
              >
                {generatingPrompt}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px",
                  justifyContent: "center",
                }}
              >
                <FaSpinner
                  size={20}
                  style={{
                    animation: "spin 1s linear infinite",
                    display: "inline-block",
                    color: "var(--accent)",
                  }}
                />
                <span
                  style={{ fontSize: "var(--font-md)", color: "var(--text)" }}
                >
                  Generating {toolMode === "image" ? "image" : "video"}...
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Generated Media Display - Above Search Bar */}
        {generatedMedia && !isGenerating && (
          <div style={{ marginBottom: 16 }}>
            <div
              className="sub text-sm"
              style={{ marginBottom: 8, fontWeight: 500 }}
            >
              Generated {generatedMedia.type === "image" ? "Image" : "Video"}
            </div>
            <div className="glass-card" style={{ padding: 12, position: "relative", maxWidth: "100%", overflow: "hidden" }}>
              {generatedMedia.type === "image" ? (
                <img
                  src={generatedMedia.url}
                  alt={generatedMedia.prompt}
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    maxHeight: "300px",
                    objectFit: "contain",
                    borderRadius: "8px",
                    display: "block",
                  }}
                  onError={() => {
                    showToast({
                      message: "Failed to load generated image",
                      type: "error",
                      duration: 3000,
                    });
                  }}
                />
              ) : (
                <video
                  src={generatedMedia.url}
                  controls
                  playsInline
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    maxHeight: "min(50vh, 400px)",
                    borderRadius: "8px",
                    display: "block",
                    objectFit: "contain",
                  }}
                  onError={() => {
                    showToast({
                      message: "Failed to load generated video",
                      type: "error",
                      duration: 3000,
                    });
                  }}
                />
              )}
              <div
                style={{
                  marginTop: 12,
                  fontSize: "var(--font-md)",
                  color: "var(--text)",
                  fontWeight: 500,
                  padding: "8px 12px",
                  background: "var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {generatedMedia.prompt}
              </div>
              <button
                className="btn-ghost glass-button btn-shadow"
                onClick={() => setGeneratedMedia(null)}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  padding: 6,
                  background: "rgba(0, 0, 0, 0.5)",
                  borderRadius: "50%",
                }}
                aria-label="Close"
              >
                <FaTimes size={14} style={{ color: "white" }} />
              </button>
              <button
                className="btn-ghost glass-button btn-shadow"
                onClick={handleDownloadMedia}
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  padding: 8,
                  background: "rgba(0, 0, 0, 0.6)",
                  borderRadius: "50%",
                }}
                aria-label="Download"
                title="Download"
              >
                <FaDownload size={16} style={{ color: "white" }} />
              </button>
            </div>
          </div>
        )}

        {/* Voice Overlay */}
        <VoiceOverlay
          isOpen={showVoiceOverlay}
          isListening={isListening}
          isLoading={voiceIsLoading}
          queryText={voiceQuery}
          responseText={voiceAnswer?.chunks.map((c) => c.text).join(" ") || ""}
          sources={voiceAnswer?.sources || []}
          onToggleListening={() => {
            if (isListening) {
              stopVoiceInput();
            } else {
              startVoiceInput("session");
            }
          }}
          onClose={() => {
            setShowVoiceOverlay(false);
            stopVoiceInput();
            try {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            } catch { }
            setIsSpeaking(false);
            resetVoiceSession();
          }}
        />


        <div className="row search-container !gap-0">
          {/* Tools Dropdown */}

          <div style={{ display: "flex", flexDirection: "column", maxWidth: "100%", minWidth: 0}}>
            {/* Attached files/images above message input */}
            {!toolMode && uploadedFiles.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, paddingTop: 4 }}>
                {uploadedFiles.map((file) => (
                  <div key={file.id} style={{ position: "relative" }}>
                    {file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.file.name}
                        style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }}
                      />
                    ) : (
                      <div
                        className="glass-card"
                        style={{ width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, fontSize: 24 }}
                      >
                        {file.type === "document" ? "📄" : "📁"}
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn-ghost glass-button"
                      onClick={() => removeFile(file.id)}
                      style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                      aria-label="Remove file"
                    >
                      <FaTimes size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}


          </div>

          {toolMode ? (
            <div
            className="w-full"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                position: "relative",
              }}
            >
              {/* Attached images — above the prompt textarea */}
              {toolAttachedImages.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    paddingLeft: 4,
                    paddingBottom: 2,
                  }}
                >
                  {toolAttachedImages.map((img) => (
                    <div
                      key={img.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "var(--font-sm)",
                        boxShadow: "var(--shadow)",
                        maxWidth: "250px",
                      }}
                    >
                      {img.preview ? (
                        <img
                          src={img.preview}
                          alt="Reference"
                          style={{
                            width: 32,
                            height: 32,
                            objectFit: "cover",
                            borderRadius: "6px",
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: "20px" }}>🖼️</span>
                      )}
                      <button
                        className="btn-ghost glass-button btn-shadow"
                        onClick={(e) => {
                          e.stopPropagation();
                          setToolAttachedImages(
                            toolAttachedImages.filter((i) => i.id !== img.id)
                          );
                        }}
                        disabled={isGenerating}
                        style={{
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isGenerating ? 0.5 : 1,
                          minWidth: "24px",
                          height: "24px",
                          flexShrink: 0,
                        }}
                        aria-label="Remove"
                        title="Remove image"
                      >
                        <FaTimes size={14} style={{ color: "var(--text)" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    zIndex: 2,
                  }}
                >
                  <button
                    className="btn-ghost glass-button max-md:!w-[34px] max-md:!h-[34px] max-md:!min-w-[34px] max-md:!min-h-[34px] max-md:!p-[6px] flex items-center justify-center max-md:![&>svg]:!w-[12px] max-md:![&>svg]:!h-[12px]"
                    onClick={() => {
                      setToolMode(null);
                      setToolDescription("");
                      setToolAttachedImages([]);
                      setGeneratedMedia(null);
                      setLastToolsMedia(null);
                    }}
                    style={{
                      padding: 8,
                      color: "var(--text)",
                      opacity: 0.6,
                    }}
                    aria-label="Exit tool mode"
                    title="Exit tool mode"
                  >
                    <FaTimes size={14} />
                  </button>
                  <button
                    className="btn-ghost glass-button btn-shadow max-md:!w-[34px] max-md:!h-[34px] max-md:!min-w-[34px] max-md:!min-h-[34px] max-md:!p-[6px] flex items-center justify-center max-md:![&>svg]:!w-[12px] max-md:![&>svg]:!h-[12px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    disabled={
                      isListening ||
                      isGenerating ||
                      toolAttachedImages.length >= (isPremium ? 5 : 2)
                    }
                    style={{
                      padding: 6,
                      opacity:
                        isListening ||
                          isGenerating ||
                          toolAttachedImages.length >= (isPremium ? 5 : 2)
                          ? 0.5
                          : 1,
                      cursor:
                        isListening ||
                          isGenerating ||
                          toolAttachedImages.length >= (isPremium ? 5 : 2)
                          ? "not-allowed"
                          : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0, 0, 0, 0.05)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      minWidth: "28px",
                      height: "28px",
                      pointerEvents: "auto",
                    }}
                    aria-label="Add reference images"
                    title={
                      toolAttachedImages.length >= (isPremium ? 5 : 2)
                        ? `Maximum ${isPremium ? 5 : 2} images allowed`
                        : "Add reference images (optional)"
                    }
                  >
                    <FaPlus size={14} style={{ color: "var(--text)" }} />
                  </button>
                </div>
                <textarea
                  ref={inputRef}
                  className="input search-input-scrollbar"
                  aria-label={
                    toolMode === "image"
                      ? "Describe your image"
                      : "Describe your video"
                  }
                  placeholder={
                    toolMode === "image"
                      ? "Describe your image"
                      : toolAttachedImages.length > 0
                        ? "Describe your video (optional)"
                        : "Describe your video"
                  }
                  value={toolDescription}
                  onChange={(e) => {
                    setToolDescription(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(
                      e.target.scrollHeight,
                      120
                    )}px`;
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      (e.metaKey || e.ctrlKey)
                    ) {
                      e.preventDefault();
                      inputRef.current?.blur();
                      handleGenerateMedia();
                    }
                  }}
                  disabled={isGenerating}
                  style={{
                    width: "100%",
                    fontSize: "var(--font-lg)",
                    resize: "none",
                    minHeight: 44,
                    maxHeight: 120,
                    lineHeight: 1.5,
                    overflowY: "auto",
                    fontFamily: "inherit",
                    borderRadius: ".5rem",
                    paddingRight: 8,
                    paddingLeft: toolAttachedImages.length === 0 ? 76 : 40, // Make room for exit and add image buttons on the left
                    paddingBottom: 8,
                    paddingTop: 8,
                    opacity: isGenerating ? 0.6 : 1,
                  }}
                  rows={1}
                />
              </div>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              className="input search-input-scrollbar"
              aria-label="Search"
              placeholder={
                isAnalyzeContext
                  ? hasAnswer
                    ? "Ask a follow-up about your files..."
                    : uploadedFiles.length > 0
                      ? "Ask about your uploaded files..."
                      : "Attach PDFs, docs, or images — then ask your question"
                  : hasAnswer
                    ? "Ask follow-up..."
                    : "Ask anything — we'll cite every answer"
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(
                  e.target.scrollHeight,
                  120
                )}px`;
              }}
              onKeyDown={handleKeyDown}
              style={{
                fontSize: "var(--font-lg)",
                resize: "none",
                minHeight: 44,
                maxHeight: 120,
                lineHeight: 1.5,
                overflowY: "auto",
                fontFamily: "inherit",
                borderRadius: ".5rem",
                paddingInline: 8,
              }}
              rows={1}
            />
          )}

          <div className="row gap-[5px] max-md:!gap-[9px] max-md:flex-nowrap" style={{ flexShrink: 0 }}>
            {/* Attach File - Hide when tool mode is active */}
            {!toolMode && (
              <div
                style={{ position: "relative" }}
                className="flex gap-0"
                data-upload-menu
              >
                <button
                  ref={uploadBtnRef}
                  type="button"
                  className="btn-ghost glass-button btn-shadow aspect-square max-md:!w-[34px] max-md:!h-[34px] max-md:!min-w-[34px] max-md:!min-h-[34px] max-md:!p-[6px] flex items-center justify-center max-md:![&>svg]:!w-[14px] max-md:![&>svg]:!h-[14px]"
                  onClick={openAttachMenu}
                  aria-label="Upload files"
                  disabled={isListening}
                  style={{
                    padding: hasAnswer ? 6 : 8,
                    opacity: isListening ? 0.5 : 1,
                    cursor: isListening ? "not-allowed" : "pointer",
                    touchAction: "manipulation",
                  }}
                >
                  <FaPaperclip size={hasAnswer ? 14 : 18} />
                </button>
              </div>
            )}

            {/* Model selector — premium only (keeps send button visible for free/guest users) */}
            {!toolMode && showModelSelector && isPremium && (
              <div>
                <LLMModelSelector
                  selectedModel={selectedModel}
                  onModelChange={(model) => {
                    // Support either prop to avoid breaking older call sites/tests
                    (setSelectedModel ?? onModelChange)(model);
                    // Save to localStorage immediately for premium users
                    if (isPremium) {
                      localStorage.setItem("syntraiq-selected-model", model);
                    }
                  }}
                  isPremium={isPremium}
                  experienceMode={experienceMode}
                  onExperienceModeChange={onExperienceModeChange}
                />
              </div>
            )}

            {/* Voice Search (no overlay): start/stop dictation, auto-search on end */}
            {/* Voice/Search Button Toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {toolMode ? (
                <button
                  className="btn !text-black max-md:!px-2 max-md:!py-1 max-md:!text-sm"
                  onClick={handleGenerateMedia}
                  disabled={
                    isGenerating ||
                    (!toolDescription.trim() &&
                      !(toolMode === "video" && toolAttachedImages.length > 0))
                  }
                  aria-label={
                    toolMode === "image"
                      ? "Generate image"
                      : toolAttachedImages.length > 0
                        ? "Generate video from image"
                        : "Generate video"
                  }
                  style={{
                    padding: "4px 12px",
                    fontSize: "var(--font-md)",
                    background: "var(--accent)",
                    color: "white",
                    opacity:
                      isGenerating ||
                        (!toolDescription.trim() &&
                          !(toolMode === "video" && toolAttachedImages.length > 0))
                        ? 0.6
                        : 1,
                    cursor:
                      isGenerating ||
                        (!toolDescription.trim() &&
                          !(toolMode === "video" && toolAttachedImages.length > 0))
                        ? "not-allowed"
                        : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isGenerating ? (
                    <>
                      <FaSpinner
                        size={16}
                        style={{
                          animation: "spin 1s linear infinite",
                          display: "inline-block",
                        }}
                      />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <span>Generate</span>
                  )}
                </button>
              ) : speechSupported ? (
                <button
                  className={`btn-ghost glass-button btn-shadow aspect-square max-md:!w-[34px] max-md:!h-[34px] max-md:!min-w-[34px] max-md:!min-h-[34px] max-md:!p-[6px] flex items-center justify-center max-md:![&>svg]:!w-[18px] max-md:![&>svg]:!h-[18px]${isListening && voiceInputModeRef.current === "dictation" ? " mic-recording" : ""}`}
                  onClick={() => {
                    if (isListening && voiceInputModeRef.current === "dictation") {
                      stopVoiceInput();
                    } else if (!isListening) {
                      startVoiceInput("dictation");
                    }
                  }}
                  aria-label={
                    isListening ? "Stop dictation" : "Dictate message"
                  }
                  style={{
                    padding: hasAnswer ? "4px 6px" : "4px 8px",
                    fontSize: "var(--font-md)",
                  }}
                >
                  <MicWaveIcon
                    size={hasAnswer ? 20 : 25}
                    active={isListening && voiceInputModeRef.current === "dictation"}
                  />
                </button>
              ) : null}
            </div>

            {/* New conversation — available to all; free users limited by daily query cap */}
            {hasAnswer && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button
                  className="btn-ghost glass-button btn-shadow aspect-square max-md:!w-[34px] max-md:!h-[34px] max-md:!min-w-[34px] max-md:!min-h-[34px] max-md:!p-[6px] flex items-center justify-center max-md:![&>svg]:!w-[14px] max-md:![&>svg]:!h-[14px]"
                  onClick={() => {
                    if (onNewConversation) {
                      onNewConversation();
                      setQuery("");
                    }
                  }}
                  disabled={isLoading}
                  style={{
                    padding: hasAnswer ? 6 : 8,
                    fontSize: "var(--font-md)",
                  }}
                  aria-label="Start a new conversation"
                  title="Start a new conversation"
                >
                  <FaPen size={hasAnswer ? 14 : 18} />
                </button>
                {/* Follow-up button removed - using main search icon */}
              </div>
            )}

            {(query.trim() || uploadedFiles.length > 0) && (
            <button
              type="button"
              className="btn-ghost glass-button btn-shadow aspect-square max-md:!w-[34px] max-md:!h-[34px] max-md:!min-w-[34px] max-md:!min-h-[34px] max-md:!p-[6px] flex items-center justify-center max-md:![&>svg]:!w-[16px] max-md:![&>svg]:!h-[16px]"
              onClick={triggerSearchWithScroll}
              disabled={isLoading || !canSubmitSearch}
              aria-label={queryLimitReached ? "Upgrade to continue" : "Send message"}
              title={
                queryLimitReached
                  ? "Daily limit reached — upgrade to continue"
                  : query.trim()
                    ? "Send"
                    : uploadedFiles.length > 0
                      ? "Analyze attached files"
                      : "Type a message to send"
              }
              style={{
                padding: hasAnswer ? 6 : 8,
                color:
                  queryLimitReached && canSubmitSearch ? "var(--accent)" : "",
                opacity: isLoading || !canSubmitSearch ? 0.45 : 1,
                cursor: isLoading || !canSubmitSearch ? "not-allowed" : "pointer",
                marginRight: 4,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                flexShrink: 0,
              }}
            >
              {isLoading ? "…" : <IoIosSend size={hasAnswer ? 18 : 22} />}
            </button>
            )}

            {!query.trim() && uploadedFiles.length === 0 && speechSupported ? (
              <button
                className="btn-ghost glass-button btn-shadow aspect-square max-md:!w-[34px] max-md:!h-[34px] max-md:!min-w-[34px] max-md:!min-h-[34px] max-md:!p-[6px] flex items-center justify-center max-md:![&>svg]:!w-[18px] max-md:![&>svg]:!h-[18px]"
                onClick={() => {
                  try {
                    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
                  } catch { }
                  setIsSpeaking(false);
                  resetVoiceSession();
                  localStorage.setItem("syntraiq-voice-session-active", "1");
                  setShowVoiceOverlay(true);
                }}
                disabled={isListening || isLoading}
                style={{
                  padding: hasAnswer ? 6 : 8,
                  color: "",
                  opacity: isListening || isLoading ? 0.5 : 1,
                  cursor: isListening || isLoading ? "not-allowed" : "pointer",
                }}
              >
                <HeadsetWaveIcon size={hasAnswer ? 22 : 27} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={
            toolMode
              ? "image/jpeg,image/png,image/gif,image/webp"
              : "image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          }
          onChange={(e) => {
            const input = e.target;
            const selected = input.files ? Array.from(input.files) : [];
            void handleFileUpload(selected).finally(() => {
              input.value = "";
            });
          }}
          style={{ display: "none" }}
        />


        {/* Search History Dropdown */}
        {/* {showHistory && searchHistory.length > 0 && (
        <div
          className="card"
          style={{
            // position: 'absolute',
            // top: '100%',
            // left: 0,
            // right: 0,
            marginTop: 8,
            padding: 8,
            zIndex: 1000,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          <div
            className="sub text-sm"
            style={{ marginBottom: 8, padding: "0 8px" }}
          >
            Recent searches
          </div>
          {searchHistory.slice(0, 5).map((item, index) => (
            <button
              key={index}
              className="btn-ghost glass-button btn-shadow"
              onClick={() => onQuerySelect(item)}
              style={{
                width: "100%",
                justifyContent: "flex-start",
                padding: "8px 12px",
                marginBottom: 4,
                textAlign: "left",
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )} */}

        {/* Quick Actions */}
        {/* {isFocused && query.length > 0 && (
        <div
          className="row"
          style={{
            marginTop: 12,
            flexWrap: "wrap",
            gap: 8,
            opacity: 0.7,
          }}
        >
          {[
            "Explain in simple terms",
            "Compare with alternatives",
            "What are the risks?",
            "Show recent examples",
          ].map((action) => (
            <button
              key={action}
              className="chip"
              onClick={() => {
                setQuery(`${query} ${action.toLowerCase()}`);
              }}
              style={{ fontSize: "var(--font-sm)" }}
            >
              {action}
            </button>
          ))}
        </div>
      )} */}
      </div>

      {showAttachModal === "menu" &&
        createPortal(
          <>
            <div
              ref={attachBackdropRef}
              onMouseDown={(e) => {
                if (e.target === attachBackdropRef.current) {
                  closeAttachModal();
                }
              }}
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.45)",
                zIndex: 100001,
              }}
            />
            <div
              role="dialog"
              aria-label="Attach to message"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 100002,
                background: "var(--bg)",
                color: "var(--text)",
                borderTop: "1px solid var(--border)",
                borderRadius: "16px 16px 0 0",
                padding: "12px 16px",
                paddingBottom: "max(20px, env(safe-area-inset-bottom))",
                boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "var(--font-sm)" }}>
                  Attach to message
                </div>
                <button
                  type="button"
                  className="btn-ghost glass-button"
                  onClick={closeAttachModal}
                  aria-label="Close attach menu"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FaTimes size={14} />
                </button>
              </div>

              <button
                type="button"
                className="btn-ghost glass-button w-full mb-2 flex items-center justify-start gap-3"
                style={{ padding: "12px 14px", minHeight: 48 }}
                onClick={() => pickAttachment("files")}
                disabled={isListening}
              >
                <FaFolderOpen size={18} />
                <span>Upload from files</span>
              </button>
              <button
                type="button"
                className="btn-ghost glass-button w-full mb-2 flex items-center justify-start gap-3"
                style={{ padding: "12px 14px", minHeight: 48 }}
                onClick={() => pickAttachment("image")}
                disabled={isListening}
              >
                <FaImage size={18} />
                <span>Choose image</span>
              </button>
              <button
                type="button"
                className="btn-ghost glass-button w-full flex items-center justify-start gap-3"
                style={{ padding: "12px 14px", minHeight: 48 }}
                onClick={() => pickAttachment("camera")}
                disabled={isListening}
              >
                <FaCamera size={18} />
                <span>Take photo</span>
              </button>
            </div>
          </>,
          document.body
        )}

      {(isCapturing || showAttachModal === "camera") &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.92)",
              zIndex: 100003,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: "var(--font-lg)",
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              Take a photo
            </div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                maxWidth: 480,
                maxHeight: "65vh",
                borderRadius: 16,
                objectFit: "cover",
                background: "#000",
              }}
            />
            <div
              style={{
                marginTop: 24,
                display: "flex",
                gap: 16,
                width: "100%",
                maxWidth: 480,
              }}
            >
              <button
                type="button"
                className="btn flex-1"
                onClick={capturePhoto}
                style={{
                  padding: "14px 24px",
                  background: "var(--accent)",
                  color: "#111",
                }}
              >
                Capture
              </button>
              <button
                type="button"
                className="btn-ghost glass-button flex-1"
                onClick={stopCameraCapture}
                style={{
                  padding: "14px 24px",
                  color: "white",
                  borderColor: "rgba(255,255,255,0.3)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
