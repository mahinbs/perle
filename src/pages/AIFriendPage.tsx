import { useState, useRef, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import MicWaveIcon from "../components/MicWaveIcon";
import {
  FaPen,
  FaStop,
  FaLightbulb,
  FaSyncAlt,
  FaPaperclip,
  FaTimes,
  FaComments,
  FaPlus,
  FaEdit,
  FaTrash,
  FaChevronDown,
} from "react-icons/fa";
import { useToast } from "../contexts/ToastContext";
import {
  getUserData,
  getAuthHeaders,
  getAuthToken,
  isAuthenticated,
  removeAuthToken,
} from "../utils/auth";
import { LLMModelSelector } from "../components/LLMModelSelector";
import type { LLMModel } from "../types";
import { IoIosArrowBack, IoIosSend } from "react-icons/io";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  friendId?: string; // For group chat: which friend sent this
  friendName?: string; // For group chat: friend's name
}

interface AIFriend {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  custom_greeting: string | null;
  created_at: string;
  updated_at: string;
}

export default function AIFriendPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  // Get user data for avatar
  const userData = getUserData();
  const userName = userData?.name || "You";
  const isLoggedIn = isAuthenticated();

  // AI Friends state
  const [aiFriends, setAiFriends] = useState<AIFriend[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [isGroupChat, setIsGroupChat] = useState(false); // Toggle between individual and group chat
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

  // Use selected friend's info or default
  const aiProfile = selectedFriend
    ? {
        name: selectedFriend.name,
        handle: `@${selectedFriend.name.toLowerCase().replace(/\s+/g, "")}`,
        avatar: selectedFriend.logo_url || defaultAiProfile.avatar,
      }
    : defaultAiProfile;
  const userProfile = {
    name: userName,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
      userName
    )}&background=C7A869&color=111&size=120&bold=true&font-size=0.5`,
  };
  // Generate greeting based on selected friend or default
  const getGreeting = (): string => {
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
  const [selectedModel, setSelectedModel] = useState<LLMModel>("gemini-lite");
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
  const friendSelectorRef = useRef<HTMLDivElement>(null);
  const friendSelectorContainerRef = useRef<HTMLDivElement>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // Close friend selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showFriendSelector &&
        friendSelectorContainerRef.current &&
        !friendSelectorContainerRef.current.contains(event.target as Node)
      ) {
        setShowFriendSelector(false);
      }
    };

    if (showFriendSelector) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFriendSelector]);

  // Load default logos
  const loadDefaultLogos = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    try {
      const response = await fetch(`${API_URL}/api/ai-friends/default-logos`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setDefaultLogos(data.logos || []);
      }
    } catch (error) {
      console.error("Failed to load default logos:", error);
    }
  };

  // Load user premium status and model preference
  useEffect(() => {
    const user = getUserData();
    if (user) {
      const premium = user.isPremium ?? false;
      setIsPremium(premium);

      // Load saved model preference
      const savedModel = localStorage.getItem(
        "perle-ai-friend-model"
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

  // Load AI friends from API
  const loadAIFriends = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    setIsLoadingFriends(true);
    try {
      const response = await fetch(`${API_URL}/api/ai-friends`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setAiFriends(data.friends || []);
        // Auto-select first friend if available and none selected
        if (data.friends && data.friends.length > 0 && !selectedFriendId) {
          setSelectedFriendId(data.friends[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load AI friends:", error);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  // Handle greeting and history loading when chat mode or friend selection changes
  useEffect(() => {
    const greeting = getGreeting();

    // Update greeting immediately (synchronously) for instant feedback
    // For group chat: always show only the greeting
    if (isGroupChat) {
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
        // Load history for specific friend if selected, otherwise load default
        const historyUrl = selectedFriendId
          ? `${API_URL}/api/chat/history?chatMode=ai_friend&aiFriendId=${selectedFriendId}`
          : `${API_URL}/api/chat/history?chatMode=ai_friend`;

        const response = await fetch(historyUrl, {
          method: "GET",
          headers: getAuthHeaders(),
        });

        // Handle 401 - user logged out
        if (response.status === 401) {
          removeAuthToken();
          return;
        }

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

            // Append history to existing greeting
            setMessages((prev) => {
              // Keep the greeting and append history
              if (prev.length > 0 && prev[0]?.id === "1" && prev[0]?.role === "ai") {
                return [prev[0], ...historyMessages];
              }
              return [
                {
                  id: "1",
                  role: "ai",
                  content: greeting,
                  timestamp: new Date(),
                },
                ...historyMessages,
              ];
            });
          }
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
        // Keep the greeting even if history fails to load
      }
    };

    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroupChat, selectedFriendId, selectedFriend, aiFriends]);

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

  // Parse @ mentions from message text
  const parseMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const matches = text.match(mentionRegex);
    if (!matches) return [];

    // Extract friend names (remove @)
    const mentionedNames = matches.map((m) => m.substring(1).toLowerCase());

    // Find friend IDs by matching names
    const mentionedIds: string[] = [];
    aiFriends.forEach((friend) => {
      const friendNameLower = friend.name.toLowerCase().replace(/\s+/g, "");
      if (mentionedNames.includes(friendNameLower)) {
        mentionedIds.push(friend.id);
      }
    });

    return mentionedIds;
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

        // Send message to each friend in parallel
        const responses = await Promise.allSettled(
          friendsToMessage.map(async (friend) => {
            const response = await fetch(`${API_URL}/api/chat`, {
              method: "POST",
              headers: getAuthHeaders(),
              body: JSON.stringify({
                message: messageText,
                model: selectedModel,
                newConversation: false, // Group chat maintains history
                chatMode: "ai_friend",
                aiFriendId: friend.id, // Individual friend ID for context
              }),
            });

            // Handle 401 - user logged out, continue as free user
            if (response.status === 401) {
              removeAuthToken();
              // Skip this friend's response, continue with others
              throw new Error("Session expired");
            }

            if (!response.ok) {
              const errorData = await response
                .json()
                .catch(() => ({ error: "Unknown error" }));
              throw new Error(
                errorData.error || `Failed to get response from ${friend.name}`
              );
            }

            const data = await response.json();
            return {
              friendId: friend.id,
              friendName: friend.name,
              friendAvatar: friend.logo_url || defaultAiProfile.avatar,
              message: data.message || "No response",
            };
          })
        );

        // Add all responses to messages
        // Check if any error is a 401 (session expired)
        const has401Error = responses.some(
          (result) =>
            result.status === "rejected" &&
            result.reason?.message?.includes("Session expired")
        );

        if (has401Error) {
          removeAuthToken();
          // Continue as free user - show remaining responses if any
        }

        responses.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const aiResponse: Message = {
              id: `${Date.now()}-${index}`,
              role: "ai",
              content: result.value.message,
              timestamp: new Date(),
              friendId: result.value.friendId,
              friendName: result.value.friendName,
            };
            setMessages((prev) => [...prev, aiResponse]);
          } else {
            // Error response
            const friendName = friendsToMessage[index]?.name || "Unknown";
            const errorResponse: Message = {
              id: `${Date.now()}-error-${index}`,
              role: "ai",
              content: `Sorry, ${friendName} encountered an error: ${
                result.reason?.message || "Failed to connect"
              }.`,
              timestamp: new Date(),
              friendId: friendsToMessage[index]?.id,
              friendName: friendName,
            };
            setMessages((prev) => [...prev, errorResponse]);
          }
        });
      } else {
        // Individual chat: send to selected friend or default
        const response = await fetch(`${API_URL}/api/chat`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            message: messageText,
            model: selectedModel,
            newConversation: newConversation,
            chatMode: "ai_friend",
            aiFriendId: selectedFriendId || undefined, // Include friend ID if selected
          }),
        });

        // Handle 401 - user logged out, continue as free user
        if (response.status === 401) {
          removeAuthToken();
          // Continue with free user experience - don't redirect
          return;
        }

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          throw new Error(
            errorData.error ||
              `API request failed with status ${response.status}`
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
        content: `Sorry, I encountered an error: ${
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

  // Friend management functions
  const handleLogoFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast({
        message: "Logo file must be less than 2MB",
        type: "error",
        duration: 3000,
      });
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast({
        message: "Please select an image file",
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
        const error = await response.json();
        showToast({
          message: error.error || "Failed to upload logo",
          type: "error",
          duration: 3000,
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
      const response = await fetch(`${API_URL}/api/ai-friends`, {
        method: "POST",
        headers: getAuthHeaders(),
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
          message: "AI Friend created successfully!",
          type: "success",
          duration: 2000,
        });
      } else {
        const error = await response.json();
        showToast({
          message: error.error || "Failed to create AI friend",
          type: "error",
          duration: 3000,
        });
      }
    } catch (error: any) {
      showToast({
        message: error.message || "Failed to create AI friend",
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
      const response = await fetch(
        `${API_URL}/api/ai-friends/${editingFriend.id}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: friendName.trim(),
            description: friendDescription.trim(),
            logoUrl: friendLogoUrl || undefined,
            defaultLogo: selectedDefaultLogo || undefined,
            customGreeting: friendCustomGreeting.trim() || undefined,
          }),
        }
      );

      if (response.ok) {
        await loadAIFriends();
        setShowFriendModal(false);
        resetFriendForm();
        showToast({
          message: "AI Friend updated successfully!",
          type: "success",
          duration: 2000,
        });
      } else {
        const error = await response.json();
        showToast({
          message: error.error || "Failed to update AI friend",
          type: "error",
          duration: 3000,
        });
      }
    } catch (error: any) {
      showToast({
        message: error.message || "Failed to update AI friend",
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleDeleteFriend = async (friendId: string) => {
    if (!confirm("Are you sure you want to delete this AI friend?")) {
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    try {
      const response = await fetch(`${API_URL}/api/ai-friends/${friendId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        await loadAIFriends();
        if (selectedFriendId === friendId) {
          setSelectedFriendId(null);
        }
        showToast({
          message: "AI Friend deleted successfully!",
          type: "success",
          duration: 2000,
        });
      } else {
        const error = await response.json();
        showToast({
          message: error.error || "Failed to delete AI friend",
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
              {isLoggedIn && (
                <div ref={friendSelectorContainerRef} className="relative">
                  <button
                    onClick={() => setShowFriendSelector(!showFriendSelector)}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[var(--input-bg)] transition-colors"
                  >
                    <div className="relative">
                      <img
                        src={aiProfile.avatar}
                        alt={`${aiProfile.name} avatar`}
                        className="w-11 h-11 rounded-full object-cover border-2 border-[var(--accent)]"
                      />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#10A37F] shadow-[0_0_8px_rgba(16,163,127,0.5)] absolute bottom-0 right-0 animate-pulse" />
                    </div>
                    <div className="text-left">
                      <div className="h3 mb-0.5">{aiProfile.name}</div>
                      <div className="sub text-sm text-[length:var(--font-sm)] opacity-80">
                        {aiProfile.handle}
                      </div>
                    </div>
                    <FaChevronDown
                      size={14}
                      className={`transition-transform ${
                        showFriendSelector ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {showFriendSelector && !showFriendModal && (
                    <div
                      ref={friendSelectorRef}
                      className="absolute top-full left-0 mt-2 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg z-50 min-w-[280px] max-h-[400px] overflow-y-auto"
                    >
                      <div className="p-2">
                        <button
                          onClick={openCreateFriendModal}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--input-bg)] transition-colors text-left mb-2"
                        >
                          <FaPlus size={14} />
                          <span className="text-sm font-semibold">
                            {aiFriends.length >= 4
                              ? "Maximum 4 friends reached"
                              : "Create New Friend"}
                          </span>
                        </button>
                        {aiFriends.map((friend) => (
                          <div
                            key={friend.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--input-bg)] transition-colors cursor-pointer mb-1 ${
                              selectedFriendId === friend.id
                                ? "bg-[rgba(199,168,105,0.15)]"
                                : ""
                            }`}
                            onClick={() => {
                              setSelectedFriendId(friend.id);
                              setIsGroupChat(false); // Switch to individual chat when friend is selected
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
                              className="w-10 h-10 rounded-full object-cover border border-[var(--border)]"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold truncate">
                                {friend.name}
                              </div>
                              <div className="text-xs opacity-70 truncate">
                                {friend.description.substring(0, 40)}...
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditFriendModal(friend);
                                }}
                                className="p-1.5 rounded hover:bg-[var(--input-bg)]"
                              >
                                <FaEdit size={12} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFriend(friend.id);
                                }}
                                className="p-1.5 rounded hover:bg-[var(--input-bg)] text-red-500"
                              >
                                <FaTrash size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
          <div className="row flex items-center gap-2.5">
            {isLoggedIn && aiFriends.length > 0 && (
              <button
                className={`btn-ghost !p-2 flex gap-2 rounded-lg transition-colors ${
                  isGroupChat ? "bg-[rgba(199,168,105,0.15)]" : ""
                }`}
                onClick={() => {
                  setIsGroupChat(!isGroupChat);
                  setSelectedFriendId(null); // Clear selection when switching modes
                  setNewConversation(true); // Start fresh when switching
                }}
                aria-label={
                  isGroupChat
                    ? "Switch to individual chat"
                    : "Switch to group chat"
                }
                title={isGroupChat ? "Individual Chat" : "Group Chat"}
              >
                {/* <FaComments
                  size={18}
                  color={isGroupChat ? "var(--accent)" : "var(--text)"}
                />{" "} */}
                <span className={`text-sm ${isGroupChat ? "var(--accent)" : "var(--text)"}`}>Group Chat</span>
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
      <div className="flex-1 overflow-y-auto px-4 py-5 bg-[var(--bg)]">
        {messages.map((message) => {
          // For group chat AI messages, get friend avatar and name
          let messageAvatar =
            message.role === "user" ? userProfile.avatar : aiProfile.avatar;
          let messageName =
            message.role === "user" ? userProfile.name : aiProfile.name;

          if (message.role === "ai" && message.friendId && isGroupChat) {
            const friend = aiFriends.find((f) => f.id === message.friendId);
            if (friend) {
              messageAvatar = friend.logo_url || defaultAiProfile.avatar;
              messageName = friend.name;
            }
          }

          return (
            <div
              key={message.id}
              className={`flex items-end gap-3 mb-4 ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <img
                src={messageAvatar}
                alt={`${messageName} avatar`}
                className={`w-9 h-9 rounded-full object-cover border-2 ${
                  message.role === "user"
                    ? "border-[var(--accent)]"
                    : "border-[rgba(16,163,127,0.5)]"
                }`}
              />
              <div
                className={`max-w-[72%] px-4 py-3 rounded-[var(--radius-sm)] shadow-[var(--shadow)] leading-relaxed break-words ${
                  message.role === "user"
                    ? "bg-[var(--accent)] text-[#111]"
                    : "bg-[var(--card)] text-[var(--text)] border border-[var(--border)]"
                }`}
              >
                {/* Show friend name in group chat */}
                {message.role === "ai" && message.friendName && isGroupChat && (
                  <div className="text-[length:var(--font-xs)] font-semibold mb-1 opacity-80">
                    {message.friendName}
                  </div>
                )}
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
          );
        })}

        {isLoading && (
          <div className="flex items-end gap-3 mb-4">
            <img
              src={aiProfile.avatar}
              alt={`${aiProfile.name} avatar`}
              className="w-9 h-9 rounded-full object-cover border-2 border-[rgba(16,163,127,0.5)]"
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
        {/* Model Selector and New Chat Button (Premium Users) - Moved to bottom */}
        {/* <div className="flex-1">
          <LLMModelSelector
            selectedModel={selectedModel}
            onModelChange={(model) => {
              setSelectedModel(model);
              localStorage.setItem("perle-ai-friend-model", model);
            }}
            isPremium={isPremium}
            size="large"
          />
        </div> */}
        {/* {isPremium && (
          <div className="flex justify-between items-center mb-2 gap-2">
            <button
              className="btn-ghost px-3 py-1.5 text-[length:var(--font-xs)] whitespace-nowrap"
              onClick={() => {
                setNewConversation(true);
                setMessages([
                  {
                    id: "1",
                    role: "ai",
                    content:
                      "Hey! I'm your AI Friend. How can I help you today? Feel free to ask me anything or just chat! 😊",
                    timestamp: new Date(),
                  },
                ]);
              }}
              title="Start a new conversation"
            >
              New Chat
            </button>
          </div>
        )} */}

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
              placeholder="Type your message..."
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
                aria-label="Toggle inspiration replies"
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
                  localStorage.setItem("perle-ai-friend-model", model);
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
                className="btn-ghost w-8 min-w-[32px] h-8 rounded-[10%] flex items-center justify-center p-0"
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
                  className="text-left bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-sm)] px-3.5 py-3 flex gap-3 items-start cursor-pointer transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.12)] hover:-translate-y-px"
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
          <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingFriend ? "Edit AI Friend" : "Create AI Friend"}
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
                    Description (10-500 characters)
                  </label>
                  <textarea
                    value={friendDescription}
                    onChange={(e) => setFriendDescription(e.target.value)}
                    maxLength={500}
                    rows={4}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--text)] resize-none"
                    placeholder="Describe how this friend should behave, their personality, interests, etc."
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
                    placeholder={`Leave empty to use default: "Hi! I'm ${
                      friendName || "[Name]"
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
                          className={`p-2 rounded-lg border-2 transition-all ${
                            selectedDefaultLogo === logo.id
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
                      Or upload your own (Max 2MB):
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileChange}
                      disabled={isUploadingLogo}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--text)] disabled:opacity-50"
                    />
                    {isUploadingLogo && (
                      <div className="text-xs text-[var(--accent)] mt-1">
                        Uploading...
                      </div>
                    )}
                    {friendLogoUrl && !selectedDefaultLogo && (
                      <div className="mt-2">
                        <img
                          src={friendLogoUrl}
                          alt="Logo preview"
                          className="w-20 h-20 rounded-full object-cover border border-[var(--border)]"
                        />
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
                  className="flex-1 px-4 py-2 bg-[var(--input-bg)] rounded-lg hover:bg-[var(--border)] transition-colors"
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
    </div>
  );
}
