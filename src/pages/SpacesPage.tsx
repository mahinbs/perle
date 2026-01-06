import { useState, useRef, useEffect } from "react";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaLock,
  FaGlobe,
  FaTimes,
} from "react-icons/fa";
import { useToast } from "../contexts/ToastContext";
import { getUserData, getAuthHeaders, getAuthToken, isAuthenticated } from "../utils/auth";
import { LLMModelSelector } from "../components/LLMModelSelector";
import type { LLMModel } from "../types";
import { IoIosArrowBack, IoIosSend } from "react-icons/io";

interface Space {
  id: string;
  title: string;
  description: string;
  logo_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  user_id?: string;
}

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

export default function SpacesPage() {
  const { navigateTo } = useRouterNavigation();
  const { showToast } = useToast();
  const userData = getUserData();
  const isLoggedIn = isAuthenticated();

  // Spaces state
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [publicSpaces, setPublicSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [spaceTitle, setSpaceTitle] = useState("");
  const [spaceDescription, setSpaceDescription] = useState("");
  const [spaceLogoUrl, setSpaceLogoUrl] = useState("");
  const [selectedDefaultLogo, setSelectedDefaultLogo] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [defaultLogos, setDefaultLogos] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [showCommunity, setShowCommunity] = useState(false);

  // Chat state (when viewing a space)
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel>("gemini-lite");
  const [newConversation, setNewConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load spaces on mount
  useEffect(() => {
    if (isLoggedIn) {
      loadSpaces();
      loadDefaultLogos();
    }
    loadPublicSpaces();
  }, [isLoggedIn]);

  // Load user premium status
  useEffect(() => {
    const user = getUserData();
    if (user) {
      setIsPremium(user.isPremium ?? false);
      const savedModel = localStorage.getItem("perle-space-model") as LLMModel | null;
      if (savedModel && user.isPremium) {
        setSelectedModel(savedModel);
      } else if (user.isPremium) {
        setSelectedModel("auto");
      }
    }
  }, []);

  // Load conversation history when space is selected
  useEffect(() => {
    if (selectedSpace && isLoggedIn) {
      loadConversationHistory();
    }
  }, [selectedSpace, isLoggedIn]);

  const loadDefaultLogos = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    try {
      const response = await fetch(`${API_URL}/api/spaces/default-logos`, {
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

  const loadSpaces = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    try {
      const response = await fetch(`${API_URL}/api/spaces`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setSpaces(data.spaces || []);
      }
    } catch (error) {
      console.error("Failed to load spaces:", error);
    }
  };

  const loadPublicSpaces = async () => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    try {
      const response = await fetch(`${API_URL}/api/spaces/public?limit=20`);

      if (response.ok) {
        const data = await response.json();
        setPublicSpaces(data.spaces || []);
      }
    } catch (error) {
      console.error("Failed to load public spaces:", error);
    }
  };

  const loadConversationHistory = async () => {
    if (!selectedSpace) return;
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    try {
      const response = await fetch(
        `${API_URL}/api/chat/history?chatMode=space&spaceId=${selectedSpace.id}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          const historyMessages: Message[] = data.messages.map((msg: any, index: number) => ({
            id: `history-${index}`,
            role: msg.role === "user" ? "user" : "ai",
            content: msg.content,
            timestamp: new Date(msg.timestamp),
          }));

          setMessages([
            {
              id: "1",
              role: "ai",
              content: `Welcome to "${selectedSpace.title}"! ${selectedSpace.description}\n\nHow can I help you in this space?`,
              timestamp: new Date(),
            },
            ...historyMessages,
          ]);
        } else {
          setMessages([
            {
              id: "1",
              role: "ai",
              content: `Welcome to "${selectedSpace.title}"! ${selectedSpace.description}\n\nHow can I help you in this space?`,
              timestamp: new Date(),
            },
          ]);
        }
      }
    } catch (error) {
      console.error("Failed to load conversation history:", error);
    }
  };

  const handleCreateSpace = () => {
    setEditingSpace(null);
    setSpaceTitle("");
    setSpaceDescription("");
    setSpaceLogoUrl("");
    setSelectedDefaultLogo(null);
    setIsPublic(false);
    setShowSpaceModal(true);
  };

  const handleEditSpace = (space: Space) => {
    setEditingSpace(space);
    setSpaceTitle(space.title);
    setSpaceDescription(space.description);
    setSpaceLogoUrl(space.logo_url || "");
    setSelectedDefaultLogo(null);
    setIsPublic(space.is_public);
    setShowSpaceModal(true);
  };

  const handleDeleteSpace = async (spaceId: string) => {
    if (!confirm("Are you sure you want to delete this space? This action cannot be undone.")) {
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api/spaces/${spaceId}`, {
        method: "DELETE",
        headers: {
          ...getAuthHeaders(),
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      if (response.ok) {
        showToast({ message: "Space deleted successfully", type: "success" });
        loadSpaces();
        if (selectedSpace?.id === spaceId) {
          setSelectedSpace(null);
          setMessages([]);
        }
      } else {
        showToast({ message: "Failed to delete space", type: "error" });
      }
    } catch (error) {
      console.error("Failed to delete space:", error);
      showToast({ message: "Failed to delete space", type: "error" });
    }
  };

  const handleUploadLogo = async (file: File) => {
    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api/spaces/upload-logo`, {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setSpaceLogoUrl(data.url);
        showToast({ message: "Logo uploaded successfully", type: "success" });
      } else {
        showToast({ message: "Failed to upload logo", type: "error" });
      }
    } catch (error) {
      console.error("Failed to upload logo:", error);
      showToast({ message: "Failed to upload logo", type: "error" });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSaveSpace = async () => {
    if (!spaceTitle.trim() || !spaceDescription.trim()) {
      showToast({ message: "Please fill in all required fields", type: "error" });
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL || !isLoggedIn) return;

    try {
      const token = getAuthToken();
      const payload: any = {
        title: spaceTitle.trim(),
        description: spaceDescription.trim(),
        isPublic: isPublic,
      };

      if (selectedDefaultLogo) {
        payload.defaultLogo = selectedDefaultLogo;
      } else if (spaceLogoUrl) {
        payload.logoUrl = spaceLogoUrl;
      }

      const url = editingSpace
        ? `${API_URL}/api/spaces/${editingSpace.id}`
        : `${API_URL}/api/spaces`;
      const method = editingSpace ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showToast({
          message: editingSpace ? "Space updated successfully" : "Space created successfully",
          type: "success",
        });
        setShowSpaceModal(false);
        loadSpaces();
        loadPublicSpaces();
      } else {
        const error = await response.json();
        showToast({ message: error.error || "Failed to save space", type: "error" });
      }
    } catch (error) {
      console.error("Failed to save space:", error);
      showToast({ message: "Failed to save space", type: "error" });
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedSpace || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    const API_URL = import.meta.env.VITE_API_URL;
    if (!API_URL) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          message: userMessage.content,
          model: selectedModel,
          chatMode: "space",
          spaceId: selectedSpace.id,
          newConversation: newConversation,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: data.message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
        setNewConversation(false);
      } else {
        const error = await response.json();
        showToast({ message: error.error || "Failed to send message", type: "error" });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      showToast({ message: "Failed to send message", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // If space is selected, show chat interface
  if (selectedSpace) {
  return (
      <div className="container" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        {/* Header */}
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button
            className="btn-ghost"
            onClick={() => setSelectedSpace(null)}
            style={{ fontSize: "var(--font-md)" }}
          >
            <IoIosArrowBack size={24} /> Back
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {selectedSpace.logo_url && (
              <img
                src={selectedSpace.logo_url}
                alt={selectedSpace.title}
                style={{ width: 32, height: 32, borderRadius: "50%" }}
              />
            )}
            <div>
              <div className="h3" style={{ margin: 0 }}>
                {selectedSpace.title}
              </div>
              {selectedSpace.is_public && (
                <div className="sub text-sm" style={{ opacity: 0.7 }}>
                  <FaGlobe size={12} /> Public
                </div>
              )}
            </div>
          </div>
          <div style={{ width: 100, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {isLoggedIn && selectedSpace.user_id === userData?.id && (
              <>
                <button
                  className="btn-ghost"
                  onClick={() => handleEditSpace(selectedSpace)}
                  style={{ padding: "8px" }}
                >
                  <FaEdit size={16} />
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => handleDeleteSpace(selectedSpace.id)}
                  style={{ padding: "8px" }}
                >
                  <FaTrash size={16} />
                </button>
              </>
            )}
            {isPremium && (
              <LLMModelSelector
                selectedModel={selectedModel}
                onModelChange={(model) => {
                  setSelectedModel(model);
                  localStorage.setItem("perle-space-model", model);
                }}
              />
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
      style={{
        display: "flex",
        flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 4,
              }}
            >
              <div
                className="card"
                style={{
                  maxWidth: "80%",
                  padding: "12px 16px",
                  background: msg.role === "user" ? "var(--accent)" : "var(--bg-secondary)",
                }}
              >
                <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div className="card" style={{ padding: "12px 16px", background: "var(--bg-secondary)" }}>
                <div>Thinking...</div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type your message..."
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "inherit",
              fontSize: "var(--font-md)",
              resize: "none",
            }}
            disabled={isLoading}
          />
          <button
            className="btn btn-strong"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            style={{ padding: "12px 20px" }}
          >
            <IoIosSend size={20} />
          </button>
        </div>
      </div>
    );
  }

  // Main spaces list view
  return (
    <div className="container" style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: "100vh" }}>
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button
          className="btn-ghost"
          onClick={() => navigateTo("/profile")}
          aria-label="Back to profile"
          style={{ fontSize: "var(--font-md)" }}
        >
          <IoIosArrowBack size={24} /> Back
        </button>
        <div className="h1" style={{ margin: 0 }}>
          Spaces
        </div>
        <div style={{ width: 52 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)" }}>
        <button
          className={!showCommunity ? "btn" : "btn-ghost"}
          onClick={() => setShowCommunity(false)}
          style={{ borderBottom: !showCommunity ? "2px solid var(--accent)" : "none" }}
        >
          My Spaces
        </button>
        <button
          className={showCommunity ? "btn" : "btn-ghost"}
          onClick={() => setShowCommunity(true)}
          style={{ borderBottom: showCommunity ? "2px solid var(--accent)" : "none" }}
        >
          <FaGlobe size={14} /> Community
        </button>
        </div>

      {/* Spaces List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {showCommunity ? (
          // Community spaces
          publicSpaces.length > 0 ? (
            publicSpaces.map((space) => (
              <div
                key={space.id}
                className="card"
                style={{
                  padding: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedSpace(space)}
              >
                {space.logo_url && (
                  <img
                    src={space.logo_url}
                    alt={space.title}
                    style={{ width: 48, height: 48, borderRadius: "8px", objectFit: "cover" }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div className="h3" style={{ margin: 0, marginBottom: 4 }}>
                    {space.title}
                  </div>
                  <div className="sub text-sm" style={{ marginBottom: 4 }}>
                    {space.description}
              </div>
                  <div className="sub text-xs" style={{ opacity: 0.7 }}>
                    <FaGlobe size={10} /> Public Space
                </div>
                </div>
              </div>
            ))
          ) : (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <div className="sub">No public spaces available yet</div>
            </div>
          )
        ) : (
          // User's spaces
          isLoggedIn ? (
            <>
              {spaces.length > 0 ? (
                spaces.map((space) => (
                  <div
                    key={space.id}
                    className="card"
                    style={{
                      padding: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    {space.logo_url && (
                      <img
                        src={space.logo_url}
                        alt={space.title}
                        style={{ width: 48, height: 48, borderRadius: "8px", objectFit: "cover" }}
                      />
                    )}
                    <div
                      style={{ flex: 1, cursor: "pointer" }}
                      onClick={() => setSelectedSpace(space)}
                    >
                      <div className="h3" style={{ margin: 0, marginBottom: 4 }}>
                        {space.title}
                      </div>
                      <div className="sub text-sm" style={{ marginBottom: 4 }}>
                        {space.description}
                      </div>
                      <div className="sub text-xs" style={{ opacity: 0.7, display: "flex", alignItems: "center", gap: 4 }}>
                        {space.is_public ? (
                          <>
                            <FaGlobe size={10} /> Public
                          </>
                        ) : (
                          <>
                            <FaLock size={10} /> Private
                          </>
                        )}
                      </div>
        </div>
                    <div style={{ display: "flex", gap: 8 }}>
          <button
                        className="btn-ghost"
                        onClick={() => handleEditSpace(space)}
                        style={{ padding: "8px" }}
                      >
                        <FaEdit size={16} />
          </button>
          <button
            className="btn-ghost"
                        onClick={() => handleDeleteSpace(space.id)}
                        style={{ padding: "8px" }}
                      >
                        <FaTrash size={16} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card" style={{ padding: 24, textAlign: "center" }}>
                  <div className="sub" style={{ marginBottom: 16 }}>
                    You haven't created any spaces yet
                  </div>
                  <button className="btn btn-strong" onClick={handleCreateSpace}>
                    <FaPlus size={16} /> Create Your First Space
                  </button>
                </div>
              )}
              {spaces.length > 0 && (
                <button className="btn btn-strong" onClick={handleCreateSpace}>
                  <FaPlus size={16} /> Create New Space
                </button>
              )}
            </>
          ) : (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <div className="sub" style={{ marginBottom: 16 }}>
                Please log in to create and manage your spaces
              </div>
              <button className="btn btn-strong" onClick={() => navigateTo("/profile")}>
                Log In
          </button>
        </div>
          )
        )}
      </div>

      {/* Create/Edit Space Modal */}
      {showSpaceModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSpaceModal(false);
          }}
        >
      <div
        className="card"
        style={{
              maxWidth: 500,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div className="h2">{editingSpace ? "Edit Space" : "Create Space"}</div>
              <button className="btn-ghost" onClick={() => setShowSpaceModal(false)}>
                <FaTimes size={20} />
              </button>
        </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="sub" style={{ marginBottom: 8, display: "block" }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={spaceTitle}
                  onChange={(e) => setSpaceTitle(e.target.value)}
                  placeholder="Enter space title"
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
        </div>

              <div>
                <label className="sub" style={{ marginBottom: 8, display: "block" }}>
                  Description *
                </label>
                <textarea
                  value={spaceDescription}
                  onChange={(e) => setSpaceDescription(e.target.value)}
                  placeholder="Describe the purpose of this space..."
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
      </div>

              <div>
                <label className="sub" style={{ marginBottom: 8, display: "block" }}>
                  Logo
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {defaultLogos.map((logo) => (
                    <button
                      key={logo.id}
                      className={selectedDefaultLogo === logo.id ? "btn" : "btn-ghost"}
                      onClick={() => {
                        setSelectedDefaultLogo(logo.id);
                        setSpaceLogoUrl("");
                      }}
                      style={{ padding: 8 }}
                    >
                      <img src={logo.url} alt={logo.name} style={{ width: 40, height: 40, borderRadius: "50%" }} />
                    </button>
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUploadLogo(file);
                      setSelectedDefaultLogo(null);
                    }
                  }}
                  style={{ display: "none" }}
                  ref={fileInputRef}
                />
        <button
          className="btn-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  style={{ width: "100%", padding: "12px", border: "1px dashed var(--border)" }}
                >
                  {isUploadingLogo ? "Uploading..." : "Upload Custom Logo"}
                </button>
                {spaceLogoUrl && !selectedDefaultLogo && (
                  <img
                    src={spaceLogoUrl}
                    alt="Custom logo"
                    style={{ width: 80, height: 80, borderRadius: "8px", marginTop: 8, objectFit: "cover" }}
                  />
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <label htmlFor="isPublic" className="sub" style={{ cursor: "pointer" }}>
                  <FaGlobe size={14} /> Share with community (make public)
                </label>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn btn-strong" onClick={handleSaveSpace} style={{ flex: 1 }}>
                  {editingSpace ? "Update" : "Create"} Space
        </button>
                <button className="btn-ghost" onClick={() => setShowSpaceModal(false)}>
                  Cancel
        </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
