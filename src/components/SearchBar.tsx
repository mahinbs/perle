import React, { useState, useRef, useEffect } from "react";
import { useToast } from "../contexts/ToastContext";
import type { LLMModel } from "../types";
import {
  FaCopy,
  FaPaperclip,
  FaFolderOpen,
  FaImage,
  FaCamera,
  FaPaperPlane,
  FaSearch,
} from "react-icons/fa";
import MicWaveIcon from "./MicWaveIcon";
import HeadsetWaveIcon from "./HeadsetWaveIcon";
import VoiceOverlay from "./VoiceOverlay";
import { LLMModelSelector } from "./LLMModelSelector";

interface UploadedFile {
  id: string;
  file: File;
  type: "image" | "document" | "other";
  preview?: string;
}

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
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  setQuery,
  onSearch,
  isLoading,
  showHistory,
  searchHistory,
  onQuerySelect,
  uploadedFiles = [],
  onFilesChange,
  hasAnswer = false,
  searchedQuery = '',
  isPremium = false,
  onNewConversation,
  selectedModel,
  setSelectedModel,
  onModelChange,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const { showToast } = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const hasClearedForAnswerRef = useRef<boolean>(false);

  // Check for speech support
  useEffect(() => {
    const hasSpeechRecognition =
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    const hasSpeechSynthesis = "speechSynthesis" in window;
    setSpeechSupported(hasSpeechRecognition && hasSpeechSynthesis);
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
      setQuery('');
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Only search if there's input in the search box
      if (query.trim()) {
        onSearch();
        // In follow-up mode, keep the query for editing; otherwise clear it
        if (!hasAnswer) {
          setQuery("");
        }
      }
    }
  };

  // NOTE: query copy UX is currently disabled in the UI (button commented out).

  const startVoiceInput = () => {
    if (!speechSupported) {
      alert("Voice input is not supported in this browser");
      return;
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

    recognition.onstart = () => {
      setIsListening(true);
      setShowUploadMenu(false); // Close upload menu when recording starts
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      finalTranscript = transcript; // Store the latest transcript
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-trigger search when voice recording stops using the final transcript
      if (finalTranscript.trim()) {
        // Show the transcript briefly before clearing
        setQuery(finalTranscript);
        // Pass the transcript directly to onSearch to avoid state timing issues
        onSearch(finalTranscript);
        // tell AnswerCard to speak the next answer
        localStorage.setItem("perle-speak-next-answer", "1");
        // In follow-up mode, keep the query for editing; otherwise clear it
        if (!hasAnswer) {
          setTimeout(() => {
            setQuery("");
          }, 100);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") {
        showToast({
          message: "Microphone access denied. Please allow microphone access in your browser settings and try again.",
          type: "error",
          duration: 4000
        });
      } else if (event.error === "no-speech") {
        showToast({
          message: "No speech detected. Please try again.",
          type: "error",
          duration: 3000
        });
      } else {
        showToast({
          message: `Speech recognition error: ${event.error}. Please try again.`,
          type: "error",
          duration: 3000
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

  // Voice output helper (currently unused here; AnswerCard handles TTS)

  const stopVoiceOutput = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

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
    return file.type.startsWith("video/") ||
      file.name.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/i) !== null;
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

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !onFilesChange) return;

    const maxFiles = isPremium ? 5 : 2;
    const currentFileCount = uploadedFiles.length;

    // Check total file limit
    if (currentFileCount >= maxFiles) {
      showToast({
        message: `Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} allowed. ${isPremium ? 'Premium' : 'Free'} users can upload up to ${maxFiles} files.`,
        type: 'error',
        duration: 4000
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

      // Check if adding this file would exceed limit
      if (currentFileCount + newFiles.length >= maxFiles) {
        showToast({
          message: `Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} allowed. Some files were not added.`,
          type: 'error',
          duration: 4000
        });
        break;
      }

      const type = getFileType(file);
      const preview = await createFilePreview(file);

      newFiles.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        type,
        preview,
      });
    }

    if (rejectedFiles.length > 0) {
      showToast({
        message: `Video files are not supported. ${rejectedFiles.length} file${rejectedFiles.length > 1 ? 's' : ''} rejected.`,
        type: 'error',
        duration: 4000
      });
    }

    if (newFiles.length > 0) {
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
    }
  };

  const stopCameraCapture = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
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

  return (
    <div
      className="card"
      style={{
        padding: 16,
        position: "relative",
        overflow: "visible",
        zIndex: 1,
      }}
    >
      {/* Voice Overlay */}
      <VoiceOverlay
        isOpen={showVoiceOverlay}
        isListening={isListening}
        onToggleListening={() => {
          if (isListening) {
            stopVoiceInput();
          } else {
            startVoiceInput();
          }
        }}
        onClose={() => setShowVoiceOverlay(false)}
      />
      <div className="row search-container">
        {/* <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            background: "var(--accent)",
            flexShrink: 0,
          }}
        /> */}

        <textarea
          ref={inputRef}
          className="input"
          aria-label="Search"
          placeholder={hasAnswer ? "Ask follow-up..." : "Ask anything — we'll cite every answer"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            // Delay to allow clicks
          }}
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

        <div className="row" style={{ gap: 8, flexShrink: 0 }}>
          {/* <LLMModelSelector
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            disabled={isLoading}
          /> */}

          {/* {query && (
            <button
              className="btn-ghost"
              onClick={handleCopyQuery}
              aria-label="Copy query"
              style={{ padding: 8 }}
            >
              <FaCopy size={18} />
            </button>
          )} */}

          <div style={{ position: "relative" }} className="flex gap-2" data-upload-menu>
            <button
              className="btn-ghost"
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              aria-label="Upload files"
              disabled={isListening}
              style={{
                padding: 8,
                opacity: isListening ? 0.5 : 1,
                cursor: isListening ? "not-allowed" : "pointer",
              }}
            >
              <FaPaperclip size={18} />
            </button>

            {showUploadMenu && (
              <div
                className="card"
                data-upload-menu
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 8,
                  padding: 8,
                  zIndex: 9999,
                  minWidth: 220,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  backdropFilter: "blur(6px)",
                  transition: "background 0.2s ease, border 0.2s ease",
                }}
              >
                <button
                  className="btn-ghost"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setShowUploadMenu(false);
                  }}
                  disabled={isListening}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    marginBottom: 4,
                    opacity: isListening ? 0.5 : 1,
                    cursor: isListening ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <FaFolderOpen size={16} /> Upload Files
                  </span>
                </button>

                <button
                  className="btn-ghost"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setShowUploadMenu(false);
                  }}
                  disabled={isListening}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    marginBottom: 4,
                    opacity: isListening ? 0.5 : 1,
                    cursor: isListening ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <FaImage size={16} /> Upload Images
                  </span>
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    startCameraCapture();
                    setShowUploadMenu(false);
                  }}
                  disabled={isListening}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    opacity: isListening ? 0.5 : 1,
                    cursor: isListening ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <FaCamera size={16} /> Take Photo
                  </span>
                </button>
              </div>
            )}
            {/* Model Selector - Only show for premium users */}
            {isPremium && (
              <div>
                <LLMModelSelector
                  selectedModel={selectedModel}
                  onModelChange={(model) => {
                    // Support either prop to avoid breaking older call sites/tests
                    (setSelectedModel ?? onModelChange)(model);
                    // Save to localStorage immediately for premium users
                    if (isPremium) {
                      localStorage.setItem('perle-selected-model', model);
                    }
                  }}
                  isPremium={isPremium}
                />
              </div>
            )}
          </div>

          {/* Voice Search (no overlay): start/stop dictation, auto-search on end */}
          {/* Voice/Search Button Toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {query.trim() ? (
              <button
                className="btn-ghost"
                onClick={() => {
                  if (query.trim()) {
                    onSearch();
                    // In follow-up mode, keep the query for editing; otherwise clear it
                    if (!hasAnswer) {
                      setQuery("");
                    }
                  }
                }}
                disabled={isLoading}
                aria-label="Search"
                style={{
                  padding: "4px 8px",
                  fontSize: "var(--font-md)",
                  color: "inherit",
                }}
              >
                {isLoading ? "…" : <FaSearch size={20} />}
              </button>
            ) : speechSupported ? (
              <button
                className="btn-ghost"
                onClick={() => {
                  if (isListening) {
                    stopVoiceInput();
                  } else {
                    startVoiceInput();
                  }
                }}
                aria-label={
                  isListening ? "Stop voice input" : "Start voice input"
                }
                style={{
                  padding: "4px 8px",
                  fontSize: "var(--font-md)",
                  background: isListening ? "var(--accent)" : "transparent",
                  color: isListening ? "white" : "inherit",
                }}
              >
                <MicWaveIcon size={25} active={isListening} />
              </button>
            ) : null}
          </div>

          {speechSupported && (
            <button
              className="btn-ghost"
              onClick={() => setShowVoiceOverlay(true)}
              disabled={isListening}
              style={{
                padding: 8,
                color: "",
                opacity: isListening ? 0.5 : 1,
                cursor: isListening ? "not-allowed" : "pointer",
              }}
            >
              <HeadsetWaveIcon size={27} />
            </button>
          )}

          {/* Show conversation options for premium users with existing answers */}
          {isPremium && hasAnswer && (
            <div style={{
              display: 'flex',
              gap: 8,
              marginRight: 8,
              alignItems: 'center'
            }}>
              <button
                className="btn-ghost"
                onClick={() => {
                  if (onNewConversation) {
                    onNewConversation();
                    setQuery("");
                  }
                }}
                disabled={isLoading}
                style={{
                  padding: '8px 12px',
                  fontSize: 'var(--font-xs)',
                  whiteSpace: 'nowrap'
                }}
                title="Start a new conversation"
              >
                New
              </button>
              {/* Follow-up button removed - using main search icon */}
            </div>
          )}

          {/* Old Search Button Removed */}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.csv,.odt,.xls,.xlsx"
        onChange={(e) => handleFileUpload(e.target.files)}
        style={{ display: "none" }}
      />

      {/* Camera Modal */}
      {isCapturing && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 10000,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{
              maxWidth: "90vw",
              maxHeight: "60vh",
              borderRadius: 8,
            }}
          />
          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <button
              className="btn"
              onClick={capturePhoto}
              style={{ padding: "12px 24px" }}
            >
              📸 Capture
            </button>
            <button
              className="btn-ghost"
              onClick={stopCameraCapture}
              style={{ padding: "12px 24px" }}
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Uploaded Files Preview */}
      {uploadedFiles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="sub text-sm" style={{ marginBottom: 8 }}>
            Attached files ({uploadedFiles.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="card"
                style={{
                  padding: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  maxWidth: 200,
                }}
              >
                {file.preview ? (
                  <img
                    src={file.preview}
                    alt={file.file.name}
                    style={{
                      width: 40,
                      height: 40,
                      objectFit: "cover",
                      borderRadius: 4,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      background: "var(--accent)",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--font-md)",
                    }}
                  >
                    {file.type === "document" ? "📄" : "📁"}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="text-sm"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.file.name}
                  </div>
                  <div className="sub text-xs">
                    {(file.file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  className="btn-ghost"
                  onClick={() => removeFile(file.id)}
                  style={{ padding: 4 }}
                  aria-label="Remove file"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
              className="btn-ghost"
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
      {isFocused && query.length > 0 && (
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
      )}
    </div>
  );
};
