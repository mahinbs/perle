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
} from "react-icons/fa";
import { useToast } from "../contexts/ToastContext";
import { getUserData, getAuthHeaders } from "../utils/auth";
import { LLMModelSelector } from "../components/LLMModelSelector";
import type { LLMModel } from "../types";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

export default function AIFriendPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  // Get user data for avatar
  const userData = getUserData();
  const userName = userData?.name || 'You';
  
  // Generate avatars using UI Avatars service
  const aiProfile = {
    name: "Nani",
    handle: "@syntraIQ companion",
    avatar: `https://ui-avatars.com/api/?name=Perle+AI&background=C7A869&color=111&size=120&bold=true&font-size=0.5`,
  };
  const userProfile = {
    name: userName,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=C7A869&color=111&size=120&bold=true&font-size=0.5`,
  };
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content:
        "Hey! I'm your AI Friend. How can I help you today? Feel free to ask me anything or just chat! 😊",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel>('gemini-lite');
  const [newConversation, setNewConversation] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    "I'll heat up the dal if you promise to share how your day's been going.",
    "Maybe we can cook together sometime—what's your favorite comfort meal?",
    "Want me to send you a quick recipe to make that dinner extra special?",
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
      const savedModel = localStorage.getItem('perle-ai-friend-model') as LLMModel | null;
      if (savedModel && premium) {
        setSelectedModel(savedModel);
      } else if (premium) {
        setSelectedModel('auto');
      } else {
        setSelectedModel('gemini-lite');
      }
    } else {
      setIsPremium(false);
      setSelectedModel('gemini-lite');
    }
  }, []);

  // Load conversation history on mount (for both free and premium users)
  useEffect(() => {
    const loadHistory = async () => {
      const API_URL = import.meta.env.VITE_API_URL;
      if (!API_URL) return;

      try {
        const response = await fetch(`${API_URL}/api/chat/history`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Convert to Message format
            const historyMessages: Message[] = data.messages.map((msg: any, index: number) => ({
              id: `history-${index}`,
              role: msg.role === 'user' ? 'user' : 'ai',
              content: msg.content,
              timestamp: new Date(msg.timestamp)
            }));
            
            // Replace initial greeting with history
            setMessages([
              {
                id: "1",
                role: "ai",
                content: "Hey! I'm your AI Friend. How can I help you today? Feel free to ask me anything or just chat! 😊",
                timestamp: new Date(),
              },
              ...historyMessages
            ]);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
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

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: messageText,
          model: selectedModel,
          newConversation: newConversation
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      const data = await response.json();
      
      // Check if response is empty or invalid
      if (!data.message || data.message.trim().length === 0) {
        throw new Error('AI returned an empty response. Please try again.');
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
      console.error('Chat API error:', error);
      showToast({
        message: error.message || 'Failed to get response from AI',
        type: "error",
        duration: 3000,
      });
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: `Sorry, I encountered an error: ${error.message || 'Failed to connect to the server'}. Please try again.`,
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
    <div
      className="container"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--card)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px",
          }}
        >
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            <button
              className="btn-ghost"
              onClick={() => navigateTo("/")}
              style={{ padding: 8, fontSize: "var(--font-md)" }}
              aria-label="Back"
            >
              ←
            </button>
            <div className="row" style={{ alignItems: "center", gap: 12 }}>
              <img
                src={aiProfile.avatar}
                alt={`${aiProfile.name} avatar`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid var(--accent)",
                }}
              />
              <div>
                <div className="h3" style={{ marginBottom: 2 }}>
                  {aiProfile.name}
                </div>
                <div
                  className="sub text-sm"
                  style={{ fontSize: "var(--font-sm)", opacity: 0.8 }}
                >
                  {aiProfile.handle}
                </div>
              </div>
            </div>
          </div>
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#10A37F",
                boxShadow: "0 0 8px rgba(16, 163, 127, 0.5)",
              }}
            />
            <button
              className="btn-ghost"
              aria-label="Favorite conversation"
              style={{ padding: 8 }}
            >
              <FaStar size={18} color="var(--accent)" />
            </button>
          </div>
        </div>
        
      </div>

      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 16px",
          background: "var(--bg)",
        }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: "flex",
              flexDirection: message.role === "user" ? "row-reverse" : "row",
              alignItems: "flex-end",
              gap: 12,
              marginBottom: 16,
            }}
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
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                objectFit: "cover",
                border:
                  message.role === "user"
                    ? "2px solid var(--accent)"
                    : "2px solid rgba(16, 163, 127, 0.5)",
              }}
            />
            <div
              style={{
                maxWidth: "72%",
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                background:
                  message.role === "user" ? "var(--accent)" : "var(--card)",
                color: message.role === "user" ? "#111" : "var(--text)",
                border:
                  message.role === "ai" ? "1px solid var(--border)" : "none",
                boxShadow: "var(--shadow)",
                lineHeight: 1.5,
                wordWrap: "break-word",
              }}
            >
              <div
                style={{ fontSize: "var(--font-md)", whiteSpace: "pre-wrap" }}
              >
                {message.content}
              </div>
              <div
                style={{
                  fontSize: "var(--font-xs)",
                  opacity: 0.6,
                  marginTop: 6,
                  textAlign: message.role === "user" ? "right" : "left",
                }}
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
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <img
              src={aiProfile.avatar}
              alt={`${aiProfile.name} avatar`}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid rgba(16, 163, 127, 0.5)",
              }}
            />
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                background: "var(--card)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--sub)",
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--sub)",
                    animation: "pulse 1.4s ease-in-out infinite 0.2s",
                  }}
                />
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--sub)",
                    animation: "pulse 1.4s ease-in-out infinite 0.4s",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--card)",
          position: "sticky",
          bottom: 0,
        }}
      >
        {/* Model Selector and New Chat Button (Premium Users) - Moved to bottom */}
        {isPremium && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              gap: 8,
            }}
          >
            <div style={{ flex: 1 }}>
              <LLMModelSelector
                selectedModel={selectedModel}
                onModelChange={(model) => {
                  setSelectedModel(model);
                  localStorage.setItem('perle-ai-friend-model', model);
                }}
                isPremium={isPremium}
              />
            </div>
            <button
              className="btn-ghost"
              onClick={() => {
                setNewConversation(true);
                setMessages([
                  {
                    id: "1",
                    role: "ai",
                    content: "Hey! I'm your AI Friend. How can I help you today? Feel free to ask me anything or just chat! 😊",
                    timestamp: new Date(),
                  },
                ]);
              }}
              style={{
                padding: "6px 12px",
                fontSize: "var(--font-xs)",
                whiteSpace: "nowrap"
              }}
              title="Start a new conversation"
            >
              New Chat
            </button>
          </div>
        )}
        
        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "nowrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileSelected}
            aria-hidden
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: "var(--input-bg)",
              borderRadius: "var(--radius-lg)",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              minHeight: 44,
              maxHeight: 120,
            }}
          >
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
              placeholder="Type your message..."
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                resize: "none",
                padding: "4px 0",
                fontSize: "var(--font-md)",
                color: "var(--text)",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: 1.5,
                minHeight: 24,
                maxHeight: 100,
                overflowY: "auto",
              }}
              rows={1}
              disabled={isLoading}
            />
          </div>

          {isListening ? (
            <button
              className="btn"
              onClick={stopVoiceInput}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#EF4444",
              }}
              aria-label="Stop recording"
            >
              <FaStop size={16} />
            </button>
          ) : (
            <button
              className="btn-ghost"
              onClick={startVoiceInput}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Voice input"
              disabled={isLoading}
            >
              <MicWaveIcon size={20} active={false} />
            </button>
          )}

          <button
            className="btn-ghost"
            onClick={handleAttachClick}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
              background: attachedFileName ? "rgba(199, 168, 105, 0.15)" : "transparent",
              color: attachedFileName ? "var(--accent)" : "inherit",
              transition: "background 0.2s ease, color 0.2s ease",
            }}
            aria-label="Attach file"
            disabled={isLoading}
          >
            <FaPaperclip size={18} />
          </button>
          

          <button
            className="btn-ghost"
            onClick={() => setShowSuggestions((prev) => !prev)}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: showSuggestions
                ? "rgba(199, 168, 105, 0.2)"
                : "transparent",
              color: showSuggestions ? "var(--accent)" : "inherit",
              transition: "background 0.2s ease, transform 0.2s ease",
            }}
            aria-label="Toggle inspiration replies"
            aria-expanded={showSuggestions}
          >
            <FaLightbulb size={18} />
          </button>

          <button
            className="btn"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || isUploading}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity:
                inputValue.trim() && !isLoading && !isUploading ? 1 : 0.5,
              cursor:
                inputValue.trim() && !isLoading && !isUploading
                  ? "pointer"
                  : "not-allowed",
            }}
            aria-label="Send message"
          >
            <span style={{ fontSize: "var(--font-lg)", fontWeight: 600 }}>
              →
            </span>
          </button>
        </div>

        <div
          className="sub text-sm"
          style={{
            marginTop: 8,
            fontSize: "var(--font-xs)",
            textAlign: "center",
          }}
        >
          Press Enter to send, Shift+Enter for new line
        </div>

        {attachedFileName && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: "var(--font-sm)",
                color: "var(--text)",
                flex: 1,
                minWidth: 0,
              }}
            >
              <FaPaperclip size={14} color="var(--accent)" />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {attachedFileName}
              </span>
              {isUploading && (
                <span
                  style={{
                    fontSize: "var(--font-xs)",
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  Uploading…
                </span>
              )}
            </div>
            <button
              className="btn-ghost"
              onClick={() => {
                setAttachedFileName(null);
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "var(--font-xs)",
              }}
              aria-label="Remove attached file"
            >
              <FaTimes size={12} />
              Remove
            </button>
          </div>
        )}

        {showSuggestions && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: "var(--radius-sm)",
              background: "rgba(199, 168, 105, 0.08)",
              border: "1px solid rgba(199, 168, 105, 0.2)",
            }}
          >
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "rgba(199, 168, 105, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent)",
                  }}
                >
                  <FaLightbulb size={14} />
                </span>
                <div>
                  <div
                    className="sub"
                    style={{ fontSize: "var(--font-sm)", fontWeight: 600 }}
                  >
                    Inspiration Reply
                  </div>
                  <div
                    className="sub text-sm"
                    style={{ fontSize: "var(--font-xs)", opacity: 0.7 }}
                  >
                    Free: {Math.max(0, 10 - dailySuggestionUses)}/10 today
                  </div>
                </div>
              </div>
              <button
                className="btn-ghost"
                onClick={refreshSuggestions}
                style={{
                  width: 32,
                  minWidth: 32,
                  height: 32,
                  borderRadius: "10%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
                aria-label="Refresh inspiration replies"
              >
                <FaSyncAlt size={14} />
              </button>
            </div>

            <div className="col" style={{ gap: 10 }}>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleUseSuggestion(suggestion)}
                  style={{
                    textAlign: "left",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 14px",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    cursor: "pointer",
                    transition: "transform 0.15s ease, box-shadow 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 8px 20px rgba(0,0,0,0.12)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <span
                    style={{
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 2,
                    }}
                  >
                    <FaPen size={12} />
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-sm)",
                      color: "var(--text)",
                      lineHeight: 1.5,
                    }}
                  >
                    {suggestion}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
        `}
      </style>
    </div>
  );
}
