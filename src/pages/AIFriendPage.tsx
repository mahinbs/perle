import { useState, useRef, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import MicWaveIcon from "../components/MicWaveIcon";
import { FaStop } from "react-icons/fa";
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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content: "Hey! I'm your AI Friend. How can I help you today? Feel free to ask me anything or just chat! 😊",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

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
    
    if (lowerMessage.includes("hello") || lowerMessage.includes("hi") || lowerMessage.includes("hey")) {
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

  return (
    <div className="container" style={{ height: "100vh", display: "flex", flexDirection: "column", padding: 0 }}>
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
            style={{ padding: 8, fontSize: 18 }}
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <div className="h3" style={{ marginBottom: 2 }}>AI Friend</div>
            <div className="sub text-sm" style={{ fontSize: 12 }}>
              {messages.length > 1 ? "Online" : "Ready to chat"}
            </div>
          </div>
        </div>
        <div style={{ 
          width: 10, 
          height: 10, 
          borderRadius: "50%", 
          background: "#10A37F",
          boxShadow: "0 0 8px rgba(16, 163, 127, 0.5)"
        }} />
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
              justifyContent: message.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                maxWidth: "75%",
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                background:
                  message.role === "user"
                    ? "var(--accent)"
                    : "var(--card)",
                color: message.role === "user" ? "#111" : "var(--text)",
                border:
                  message.role === "ai"
                    ? "1px solid var(--border)"
                    : "none",
                boxShadow: "var(--shadow)",
                lineHeight: 1.5,
                wordWrap: "break-word",
              }}
            >
              <div style={{ fontSize: 15, whiteSpace: "pre-wrap" }}>
                {message.content}
              </div>
              <div
                style={{
                  fontSize: 11,
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
              justifyContent: "flex-start",
              marginBottom: 16,
            }}
          >
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
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <div
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
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                color: "var(--text)",
                fontSize: 15,
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
            className="btn"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: inputValue.trim() && !isLoading ? 1 : 0.5,
              cursor: inputValue.trim() && !isLoading ? "pointer" : "not-allowed",
            }}
            aria-label="Send message"
          >
            <span style={{ fontSize: 18, fontWeight: 600 }}>→</span>
          </button>
        </div>

        <div className="sub text-sm" style={{ marginTop: 8, fontSize: 11, textAlign: "center" }}>
          Press Enter to send, Shift+Enter for new line
        </div>
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

