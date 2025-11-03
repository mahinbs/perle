import React, { useState, useRef, useEffect } from "react";
import { copyToClipboard } from "../utils/helpers";
import { useToast } from "../contexts/ToastContext";
import type { LLMModel } from "../types";
import {
  FaCopy,
  FaPaperclip,
  FaFolderOpen,
  FaImage,
  FaCamera,
} from "react-icons/fa";
import MicWaveIcon from "./MicWaveIcon";
import HeadsetWaveIcon from "./HeadsetWaveIcon";
import VoiceOverlay from "./VoiceOverlay";

interface UploadedFile {
  id: string;
  file: File;
  type: "image" | "document" | "other";
  preview?: string;
}

interface SearchBarProps {
  query: string;
  setQuery: (query: string) => void;
  onSearch: (searchQuery?: string) => void;
  isLoading: boolean;
  showHistory: boolean;
  searchHistory: string[];
  onQuerySelect: (query: string) => void;
  selectedModel: LLMModel;
  onModelChange: (model: LLMModel) => void;
  uploadedFiles?: UploadedFile[];
  onFilesChange?: (files: UploadedFile[]) => void;
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSearch();
    }
  };

  const handleCopyQuery = async () => {
    try {
      await copyToClipboard(query);
      showToast({
        message: "Query copied to clipboard!",
        type: "success",
        duration: 2000,
      });
    } catch (error) {
      showToast({
        message: "Failed to copy query",
        type: "error",
        duration: 2000,
      });
    }
  };

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
    } catch {}

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
        setQuery(finalTranscript);
        // Pass the transcript directly to onSearch to avoid state timing issues
        onSearch(finalTranscript);
        // tell AnswerCard to speak the next answer
        localStorage.setItem("perle-speak-next-answer", "1");
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") {
        alert(
          "Microphone access denied. Please allow microphone access and try again."
        );
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
      file.type.includes("document")
    )
      return "document";
    return "other";
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

    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = getFileType(file);
      const preview = await createFilePreview(file);

      newFiles.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        type,
        preview,
      });
    }

    onFilesChange([...uploadedFiles, ...newFiles]);
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
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            background: "var(--accent)",
            flexShrink: 0,
          }}
        />

        <textarea
          ref={inputRef}
          className="input"
          aria-label="Search"
          placeholder="Ask anything — we'll cite every answer"
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
            fontSize: 18,
            resize: "none",
            minHeight: 44,
            maxHeight: 120,
            lineHeight: 1.5,
            overflowY: "auto",
            fontFamily: "inherit",
            borderRadius: ".5rem",
          }}
          rows={1}
        />

        <div className="row" style={{ gap: 8, flexShrink: 0 }}>
          {/* <LLMModelSelector
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            disabled={isLoading}
          /> */}

          {query && (
            <button
              className="btn-ghost"
              onClick={handleCopyQuery}
              aria-label="Copy query"
              style={{ padding: 8 }}
            >
              <FaCopy size={18} />
            </button>
          )}

          <div style={{ position: "relative" }} data-upload-menu>
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
                  minWidth: 200,
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  border: "1px solid var(--border, #e0e0e0)",
                  background: "var(--background, #252525)",
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
          </div>

          {/* Voice Search (no overlay): start/stop dictation, auto-search on end */}
          {speechSupported && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
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
                  fontSize: 12,
                  background: isListening ? "var(--accent)" : "transparent",
                  color: isListening ? "white" : "inherit",
                }}
              >
                <MicWaveIcon size={25} active={isListening} />
              </button>
            </div>
          )}

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
              <HeadsetWaveIcon size={22} />
            </button>
          )}

          <button
            className="btn"
            onClick={() => onSearch()}
            disabled={isLoading || !query.trim() || isListening}
            style={{
              minWidth: 80,
              opacity: isListening ? 0.5 : 1,
              cursor: isListening ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? (
              "…"
            ) : isListening ? (
              <MicWaveIcon size={18} active={true} />
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
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
                      fontSize: 16,
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
      {showHistory && searchHistory.length > 0 && (
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
      )}

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
              style={{ fontSize: 11 }}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
