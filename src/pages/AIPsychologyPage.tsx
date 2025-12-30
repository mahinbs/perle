import { useState, useRef, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import MicWaveIcon from "../components/MicWaveIcon";
import {
  FaPen,
  FaStar,
  FaStop,
  FaLightbulb,
  FaSyncAlt,
  FaPaperclip,
  FaTimes,
  FaComments,
} from "react-icons/fa";
import { useToast } from "../contexts/ToastContext";
import { getUserData, getAuthHeaders } from "../utils/auth";
import { LLMModelSelector } from "../components/LLMModelSelector";
import type { LLMModel } from "../types";
import { IoIosArrowBack, IoIosSend } from "react-icons/io";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

export default function AIPsychologyPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  // Get user data for avatar
  const userData = getUserData();
  const userName = userData?.name || "You";

  // Generate avatars using UI Avatars service
  const aiProfile = {
    name: "Dr. Maya",
    handle: "@syntraIQ psychologist",
    avatar: `https://ui-avatars.com/api/?name=Dr+Maya&background=9B59B6&color=fff&size=120&bold=true&font-size=0.5`,
  };
  const userProfile = {
    name: userName,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
      userName
    )}&background=C7A869&color=111&size=120&bold=true&font-size=0.5`,
  };
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content:
        "Hello, I'm Dr. Maya, your AI psychologist. I'm here to provide a safe, supportive space for you to explore your thoughts and feelings. How are you doing today?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel>("gemini-lite");
  const [newConversation, setNewConversation] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    "I've been feeling stressed lately and could use some guidance.",
    "Can you help me understand my emotions better?",
    "I'd like to talk about coping strategies for anxiety.",
  ]);
  const [dailySuggestionUses, setDailySuggestionUses] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load user premium status and model preference
  useEffect(() => {
    const user = getUserData();
    if (user) {
      const premium = user.isPremium ?? false;
      setIsPremium(premium);

      // Load saved model preference
      const savedModel = localStorage.getItem(
        "perle-ai-psychologist-model"
      ) as LLMModel | null;
      if (savedModel && premium) {
        setSelectedModel(savedModel);
      } else if (premium) {
        setSelectedModel("auto");
      } else {
        setSelectedModel("gemini-lite");
      }
    } else {
      setIsPremium(false);
      setSelectedModel("gemini-lite");
    }
  }, []);

  // Load conversation history on mount (for both free and premium users)
  useEffect(() => {
    const loadHistory = async () => {
      const API_URL = import.meta.env.VITE_API_URL;
      if (!API_URL) return;

      try {
        const response = await fetch(`${API_URL}/api/chat/history?chatMode=ai_psychologist`, {
          method: "GET",
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Convert to Message format
            const historyMessages: Message[] = data.messages.map(
              (msg: any, index: number) => ({
                id: `history-${index}`,
                role: msg.role === "user" ? "user" : "ai",
                content: msg.content,
                timestamp: new Date(msg.timestamp),
              })
            );

            // Replace initial greeting with history
            setMessages([
              {
                id: "1",
                role: "ai",
                content:
                  "Hello, I'm Dr. Maya, your AI psychologist. I'm here to provide a safe, supportive space for you to explore your thoughts and feelings. How are you doing today?",
                timestamp: new Date(),
              },
              ...historyMessages,
            ]);
          }
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    };

    loadHistory();
  }, [isPremium]);

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
        showToast({
          message: "Microphone access denied. Please allow microphone access.",
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

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = inputValue.trim();
    setInputValue("");
    if (attachedFileName) {
      setAttachedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    setIsLoading(true);

    // Call real API with ai_psychologist mode
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

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: messageText,
          model: selectedModel,
          newConversation: newConversation,
          chatMode: "ai_psychologist", // Use AI psychologist mode
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `API request failed with status ${response.status}`
        );
      }

      const data = await response.json();

      // Check if response is empty or invalid
      if (!data.message || data.message.trim().length === 0) {
        throw new Error("AI returned an empty response. Please try again.");
      }

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: data.message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);

      // Reset newConversation flag after first message
      if (newConversation) {
        setNewConversation(false);
      }
    } catch (error: any) {
      console.error("Chat API error:", error);
      showToast({
        message: error.message || "Failed to get response from AI",
        type: "error",
        duration: 3000,
      });
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: `I apologize, but I encountered an error: ${
          error.message || "Failed to connect to the server"
        }. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const inspirationPool = [
    "I'm feeling anxious and need some coping strategies.",
    "Can you help me understand why I feel this way?",
    "I'd like to talk about managing stress at work.",
    "How can I improve my emotional well-being?",
    "I'm struggling with negative thoughts lately.",
    "Can you guide me through a difficult situation?",
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

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setAttachedFileName(file.name);

    // simulate upload
    setTimeout(() => {
      setIsUploading(false);
    }, 1000);
  };

  return (
    <div className="container h-screen flex flex-col !p-0">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-[100]">
        <div className="row flex-nowrap! flex justify-between items-center p-4">
          <div className="row flex items-center gap-3">
            <button
              className="btn-ghost p-2! text-[length:var(--font-md)]"
              onClick={() => navigateTo("/")}
              aria-label="Back"
            >
              <IoIosArrowBack size={24} />
            </button>
            <div className="row flex items-center gap-3">
              <div className="relative">
                <img
                  src={aiProfile.avatar}
                  alt={`${aiProfile.name} avatar`}
                  className="w-11 h-11 rounded-full object-cover border-2 border-[#9B59B6]"
                />
                <div className="w-2.5 h-2.5 rounded-full bg-[#9B59B6] shadow-[0_0_8px_rgba(155,89,182,0.5)] absolute bottom-0 right-0 animate-pulse" />
              </div>
              <div>
                <div className="h3 mb-0.5">{aiProfile.name}</div>
                <div className="sub text-sm text-[length:var(--font-sm)] opacity-80">
                  {aiProfile.handle}
                </div>
              </div>
            </div>
          </div>
          <div className="row flex items-center gap-2.5">
            <button
              className="btn-ghost p-2"
              aria-label="Favorite conversation"
            >
              <FaStar size={18} color="var(--accent)" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 bg-[var(--bg)]">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-end gap-3 mb-4 ${
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <img
              src={
                message.role === "user" ? userProfile.avatar : aiProfile.avatar
              }
              alt={
                message.role === "user"
                  ? `${userProfile.name} avatar`
                  : `${aiProfile.name} avatar`
              }
              className={`w-9 h-9 rounded-full object-cover border-2 ${
                message.role === "user"
                  ? "border-[var(--accent)]"
                  : "border-[rgba(155,89,182,0.5)]"
              }`}
            />
            <div
              className={`max-w-[72%] px-4 py-3 rounded-[var(--radius-sm)] shadow-[var(--shadow)] leading-relaxed break-words ${
                message.role === "user"
                  ? "bg-[var(--accent)] text-[#111]"
                  : "bg-[var(--card)] text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              <div className="text-[length:var(--font-md)] whitespace-pre-wrap">
                {message.content}
              </div>
              <div
                className={`text-[length:var(--font-xs)] opacity-60 mt-1.5 ${
                  message.role === "user" ? "text-right" : "text-left"
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-end gap-3 mb-4">
            <img
              src={aiProfile.avatar}
              alt={`${aiProfile.name} avatar`}
              className="w-9 h-9 rounded-full object-cover border-2 border-[rgba(155,89,182,0.5)]"
            />
            <div className="px-4 py-3 rounded-[var(--radius-sm)] bg-[var(--card)] border border-[var(--border)]">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-[var(--sub)] animate-[pulse_1.4s_ease-in-out_infinite]" />
                <span className="w-2 h-2 rounded-full bg-[var(--sub)] animate-[pulse_1.4s_ease-in-out_infinite_0.2s]" />
                <span className="w-2 h-2 rounded-full bg-[var(--sub)] animate-[pulse_1.4s_ease-in-out_infinite_0.4s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 px-4 border-none border-[var(--border)] bg-[var(--card)] sticky bottom-0">
        {attachedFileName && (
          <div className="mt-2.5 p-2.5 px-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] flex justify-between items-center gap-3">
            <div className="flex items-center gap-2.5 text-[length:var(--font-sm)] text-[var(--text)] flex-1 min-w-0">
              <FaPaperclip size={14} color="var(--accent)" />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {attachedFileName}
              </span>
              {isUploading && (
                <span className="text-[length:var(--font-xs)] text-[var(--accent)] font-semibold">
                  Uploading…
                </span>
              )}
            </div>
            <button
              className="btn-ghost flex items-center gap-1.5 text-[length:var(--font-xs)]"
              onClick={() => {
                setAttachedFileName(null);
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              aria-label="Remove attached file"
            >
              <FaTimes size={12} />
              Remove
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end flex-wrap bg-[var(--input-bg)] sm:bg-none p-3 rounded-xl border border-[var(--border)]">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelected}
            aria-hidden
          />
          <div className="flex-1 flex items-center bg-[var(--input-bg)] rounded-[var(--radius-lg)] px-3 py-1 sm:border border-[var(--border)] min-h-[34px] max-h-[120px]">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(
                  e.target.scrollHeight,
                  100
                )}px`;
              }}
              onKeyDown={handleKeyPress}
              placeholder="Share what's on your mind..."
              className="flex-1 border-none bg-transparent resize-none py-1 text-[length:var(--font-md)] text-[var(--text)] outline-none font-inherit leading-relaxed min-h-[24px] max-h-[100px] overflow-y-auto h-auto"
              rows={1}
              disabled={isLoading}
            />
          </div>

          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex gap-2">
              {isListening ? (
                <button
                  className="btn w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center bg-[#EF4444]"
                  onClick={stopVoiceInput}
                  aria-label="Stop recording"
                >
                  <FaStop size={16} />
                </button>
              ) : (
                <button
                  className="btn-ghost min-w-6 w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center"
                  onClick={startVoiceInput}
                  aria-label="Voice input"
                  disabled={isLoading}
                >
                  <MicWaveIcon size={19} active={false} />
                </button>
              )}

              <button
                className={`btn-ghost w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center transition-colors duration-200 ${
                  isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                } ${
                  attachedFileName
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
                className={`btn-ghost w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center transition-all duration-200 ${
                  showSuggestions
                    ? "bg-[rgba(199,168,105,0.2)] text-[var(--accent)]"
                    : "bg-transparent text-inherit"
                }`}
                onClick={() => setShowSuggestions((prev) => !prev)}
                aria-label="Toggle topic suggestions"
                aria-expanded={showSuggestions}
              >
                <FaLightbulb size={16} />
              </button>

              <button
                className="btn-ghost w-7 h-7 min-h-fit! border-none! rounded-full !p-0 flex items-center justify-center transition-all duration-200 bg-transparent text-inherit"
                onClick={() => {
                  // Start new chat - clear messages and reset
                  setMessages([
                    {
                      id: "1",
                      role: "ai",
                      content:
                        "Hello, I'm Dr. Maya, your AI psychologist. I'm here to provide a safe, supportive space for you to explore your thoughts and feelings. How are you doing today?",
                      timestamp: new Date(),
                    },
                  ]);
                  showToast({
                    message: "New session started",
                    type: "success",
                    duration: 2000,
                  });
                }}
                aria-label="Start new session"
              >
                <FaComments size={16} />
              </button>

              <button
                className={`btn bg-transparent! text-[#C7A869]! w-7 h-7 min-h-fit! border! rounded-full !p-0 flex items-center justify-center ${
                  inputValue.trim() && !isLoading && !isUploading
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
            <div className="w-fit">
              <LLMModelSelector
                selectedModel={selectedModel}
                onModelChange={(model) => {
                  setSelectedModel(model);
                  localStorage.setItem("perle-ai-psychologist-model", model);
                }}
                isPremium={isPremium}
                size="small"
              />
            </div>
          </div>
        </div>

        <div className="sub text-sm mt-2 text-[length:var(--font-xs)] text-center">
          Press Enter to send, Shift+Enter for new line
        </div>

        {showSuggestions && (
          <div className="mt-4 p-3 rounded-[var(--radius-sm)] bg-[rgba(155,89,182,0.08)] border border-[rgba(155,89,182,0.2)]">
            <div className="row flex justify-between items-center mb-2.5">
              <div className="row flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[rgba(155,89,182,0.2)] flex items-center justify-center text-[#9B59B6]">
                  <FaLightbulb size={14} />
                </span>
                <div>
                  <div className="sub text-[length:var(--font-sm)] font-semibold">
                    Topic Suggestions
                  </div>
                  <div className="sub text-sm text-[length:var(--font-xs)] opacity-70">
                    Free: {Math.max(0, 10 - dailySuggestionUses)}/10 today
                  </div>
                </div>
              </div>
              <button
                className="btn-ghost w-8 min-w-[32px] h-8 rounded-[10%] flex items-center justify-center p-0"
                onClick={refreshSuggestions}
                aria-label="Refresh topic suggestions"
              >
                <FaSyncAlt size={14} />
              </button>
            </div>

            <div className="col flex flex-col gap-2.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleUseSuggestion(suggestion)}
                  className="text-left bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3.5 py-3 flex gap-3 items-start cursor-pointer transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] hover:-translate-y-px"
                >
                  <span className="text-[#9B59B6] flex items-center justify-center mt-0.5">
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
    </div>
  );
}

