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

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

export default function AIFriendPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const aiProfile = {
    name: "Nani",
    handle: "@syntraIQ companion",
    avatar:
      "https://images.unsplash.com/photo-1523289333742-be1143f6b766?auto=format&fit=crop&w=120&q=80",
  };
  const userProfile = {
    name: "You",
    avatar:
      "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=120&q=80",
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

  const simulateAIResponse = (userMessage: string): string => {
    // Simulate AI responses - in a real app, this would call an API
    const lowerMessage = userMessage.toLowerCase();

    if (
      lowerMessage.includes("hello") ||
      lowerMessage.includes("hi") ||
      lowerMessage.includes("hey")
    ) {
      return "Hello! Great to talk with you! What's on your mind today?";
    }

    if (lowerMessage.includes("how are you")) {
      return "I'm doing great, thanks for asking! I'm here and ready to chat. How are you doing?";
    }

    if (lowerMessage.includes("help")) {
      return "I'm here to help! You can ask me questions, have a conversation, or just chat about anything. What would you like to talk about?";
    }

    if (lowerMessage.includes("thank")) {
      return "You're very welcome! Happy to help anytime. 😊";
    }

    if (lowerMessage.includes("bye") || lowerMessage.includes("goodbye")) {
      return "Goodbye! It was great chatting with you. Feel free to come back anytime! 👋";
    }

    // Default response
    const responses = [
      "That's interesting! Tell me more about that.",
      "I see what you mean. How does that make you feel?",
      "Thanks for sharing that with me. What else is on your mind?",
      "I'd love to hear more about your thoughts on that.",
      "That's a great point! Can you elaborate?",
    ];

    return responses[Math.floor(Math.random() * responses.length)];
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
    setInputValue("");
    if (attachedFileName) {
      setAttachedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    setIsLoading(true);

    // Simulate API delay
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: simulateAIResponse(userMessage.content),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsLoading(false);
    }, 800 + Math.random() * 1200); // Random delay between 800-2000ms
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
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--card)",
          position: "sticky",
          top: 0,
          zIndex: 100,
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
        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileSelected}
            aria-hidden
          />
          <div
          className="w-full min-w-[calc(100vw-2rem)]"
            style={{
              flex: 1,
              position: "relative",
              background: "var(--bg)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              padding: "10px 12px",
              minHeight: 44,
              maxHeight: 120,
              display: "flex",
              alignItems: "center",
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
                  120
                )}px`;
              }}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                color: "var(--text)",
                fontSize: "var(--font-md)",
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: 1.5,
                minHeight: 24,
                maxHeight: 100,
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
