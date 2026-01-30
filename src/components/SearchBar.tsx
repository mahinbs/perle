import React, { useState, useRef, useEffect } from "react";
import { useToast } from "../contexts/ToastContext";
import type { LLMModel } from "../types";
import {
  FaPaperclip,
  FaFolderOpen,
  FaImage,
  FaCamera,
  FaSearch,
  FaPen,
  FaVideo,
  FaTools,
  FaPlus,
  FaTimes,
  FaSpinner,
  FaDownload,
  FaImages,
} from "react-icons/fa";
import MicWaveIcon from "./MicWaveIcon";
import HeadsetWaveIcon from "./HeadsetWaveIcon";
import VoiceOverlay from "./VoiceOverlay";
import { LLMModelSelector } from "./LLMModelSelector";
import { getAuthHeaders, getAuthToken, isAuthenticated } from "../utils/auth";
import { useRouterNavigation } from "../contexts/RouterNavigationContext";

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
}) => {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
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
  const { showToast } = useToast();
  const { navigateTo } = useRouterNavigation();
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Only search if there's input in the search box
      if (query.trim()) {
        onSearch();
        // Always clear the query immediately after triggering search
        setQuery("");
        // Scroll to bottom of page when search is triggered
        // Use multiple attempts to ensure it works even if page is still loading
        const scrollToBottom = () => {
          const scrollHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight,
            document.body.clientHeight,
            document.documentElement.clientHeight
          );
          window.scrollTo({
            top: scrollHeight,
            behavior: "smooth",
          });
        };

        // Try immediately and after delays to catch different render states
        requestAnimationFrame(() => {
          scrollToBottom();
          setTimeout(scrollToBottom, 300);
          setTimeout(scrollToBottom, 600);
        });
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
        // Always clear the query immediately after triggering search
        setTimeout(() => {
          setQuery("");
        }, 100);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") {
        showToast({
          message:
            "Microphone access denied. Please allow microphone access in your browser settings and try again.",
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
    referenceImage?: File
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

    // Use FormData if reference image is provided
    if (referenceImage) {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("aspectRatio", aspectRatio);
      formData.append("referenceImage", referenceImage);

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
    referenceImage?: File
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

    // Use FormData if reference image is provided
    if (referenceImage) {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("duration", duration.toString());
      formData.append("aspectRatio", aspectRatio);
      formData.append("referenceImage", referenceImage);

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
    
    // Check if this is an edit request and use last generated media as reference
    let referenceImage: File | undefined = toolAttachedImages.length > 0 ? toolAttachedImages[0].file : undefined;
    
    // If no reference image attached but prompt is an edit request and we have last media
    if (!referenceImage && isEditRequest(promptToUse) && lastToolsMedia) {
      console.log('🔍 Edit request detected in Tools - using previous media as reference');
      console.log(`📸 Previous media: ${lastToolsMedia.type} - "${lastToolsMedia.prompt}"`);
      
      // Download the last media and convert to File for reference
      try {
        const response = await fetch(lastToolsMedia.url);
        const blob = await response.blob();
        const file = new File([blob], `reference.${lastToolsMedia.type === 'image' ? 'png' : 'mp4'}`, { 
          type: lastToolsMedia.type === 'image' ? 'image/png' : 'video/mp4' 
        });
        referenceImage = file;
        console.log('✅ Using last generated media as reference for editing');
      } catch (error) {
        console.error('Failed to load previous media as reference:', error);
      }
    }

    setIsGenerating(true);
    setGeneratingPrompt(promptToUse);
    setGeneratingImages(referenceImage ? [{ id: 'ref', file: referenceImage, preview: URL.createObjectURL(referenceImage), type: 'image' as const }] : []); // Store for display
    setGeneratedMedia(null);
    setToolDescription(""); // Clear the input immediately
    setToolAttachedImages([]); // Clear attachments immediately

    try {
      if (toolMode === "image") {
        // Generate image with optional reference image
        const result = await generateImage(promptToUse, "1:1", referenceImage);
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
          message: referenceImage
            ? "Image generated using reference image!"
            : "Image generated successfully!",
          type: "success",
          duration: 3000,
        });
      } else if (toolMode === "video") {
        // Generate video with optional reference image
        const result = await generateVideo(promptToUse, 5, "16:9", referenceImage);
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
          message: referenceImage
            ? "Video generated using reference image!"
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

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;

    // Handle tool mode file uploads (for image generation reference)
    if (toolMode) {
      const maxFiles = 1; // Only allow 1 image for tool mode
      const currentFileCount = toolAttachedImages.length;

      if (currentFileCount >= maxFiles) {
        showToast({
          message: `Only ${maxFiles} image allowed for ${toolMode === "image" ? "image" : "video"
            } generation.`,
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
          id: `${Date.now()}-${Math.random()}`,
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
        setToolAttachedImages([...toolAttachedImages, ...newFiles]);
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
        id: `${Date.now()}-${Math.random()}`,
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

  return (
    <div
      className="card font-ubuntu"
      style={{
        padding: 16,
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
          <div className="card" style={{ padding: 12, position: "relative" }}>
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
          <div className="card" style={{ padding: 12, position: "relative" }}>
            {generatedMedia.type === "image" ? (
              <img
                src={generatedMedia.url}
                alt={generatedMedia.prompt}
                style={{
                  width: "100%",
                  maxHeight: "300px",
                  objectFit: "contain",
                  borderRadius: "8px",
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
                style={{
                  width: "100%",
                  maxHeight: "500px",
                  borderRadius: "8px",
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
              className="btn-ghost btn-shadow"
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
              className="btn-ghost btn-shadow"
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
        {/* Tools Dropdown */}

        <div style={{ position: "relative" }} data-tools-menu>
          {/* Attached Images Display - Above textarea */}
          {toolAttachedImages.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 4,
              }}
            >
              {toolAttachedImages.map((img) => (
                <div
                  key={img.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
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
                  {/* <span
                      style={{
                        color: "var(--text)",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {img.file.name.length > 20
                        ? img.file.name.substring(0, 20) + "..."
                        : img.file.name}
                    </span> */}
                  <button
                    className="btn-ghost btn-shadow"
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
          <button
            className={`btn-ghost btn-shadow !border-[#dfb768] !font-normal ${toolMode ? "!text-black" : ""
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

          {showToolsMenu && (
            <div
              className="card !font-normal"
              data-tools-menu
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 8,
                padding: 8,
                zIndex: 9999,
                minWidth: 200,
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
                className="btn-ghost btn-shadow"
                onClick={() => {
                  setToolMode("image");
                  setShowToolsMenu(false);
                  setToolDescription("");
                  setToolAttachedImages([]);
                  setGeneratedMedia(null);
                  setLastToolsMedia(null); // Reset for new session
                  // Start a new conversation for image generation
                  if (onNewConversation) {
                    onNewConversation();
                  }
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
                className="btn-ghost btn-shadow"
                onClick={() => {
                  setToolMode("video");
                  setShowToolsMenu(false);
                  setToolDescription("");
                  setToolAttachedImages([]);
                  setGeneratedMedia(null);
                  setLastToolsMedia(null); // Reset for new session
                  // Start a new conversation for video generation
                  if (onNewConversation) {
                    onNewConversation();
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
                  <FaVideo size={16} /> Generate Video
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
                className="btn-ghost btn-shadow"
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
            </div>
          )}
        </div>

        {toolMode ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              position: "relative",
            }}
          >
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
                  handleGenerateMedia();
                }
              }}
              disabled={isGenerating}
              style={{
                fontSize: "var(--font-lg)",
                resize: "none",
                minHeight: 44,
                maxHeight: 120,
                lineHeight: 1.5,
                overflowY: "auto",
                fontFamily: "inherit",
                borderRadius: ".5rem",
                paddingRight: 8,
                paddingLeft: 44, // Make room for buttons on the left
                paddingBottom: 8,
                paddingTop: 8,
                opacity: isGenerating ? 0.6 : 1,
              }}
              rows={1}
            />

            {/* Action Buttons - Left side of textarea */}
            {toolAttachedImages.length === 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  transform: "translateY(-50%)",
                  left: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  pointerEvents: "none",
                }}
              >
                <button
                  className="btn-ghost btn-shadow"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={
                    isListening ||
                    isGenerating ||
                    toolAttachedImages.length >= 1
                  }
                  style={{
                    padding: 6,
                    opacity:
                      isListening ||
                        isGenerating ||
                        toolAttachedImages.length >= 1
                        ? 0.5
                        : 1,
                    cursor:
                      isListening ||
                        isGenerating ||
                        toolAttachedImages.length >= 1
                        ? "not-allowed"
                        : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "auto",
                    background: "rgba(0, 0, 0, 0.05)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    minWidth: "28px",
                    height: "28px",
                  }}
                  aria-label="Add reference image"
                  title={
                    toolAttachedImages.length >= 1
                      ? "Only one image allowed"
                      : "Add reference image (optional)"
                  }
                >
                  <FaPlus size={14} style={{ color: "var(--text)" }} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <textarea
            ref={inputRef}
            className="input search-input-scrollbar"
            aria-label="Search"
            placeholder={
              hasAnswer
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

        <div className="row" style={{ gap: 5, flexShrink: 0 }}>


          {/* Attach File - Hide when tool mode is active */}
          {!toolMode && (
            <div
              style={{ position: "relative" }}
              className="flex gap-0"
              data-upload-menu
            >
              <button
                className="btn-ghost btn-shadow aspect-square !border-[#dfb768]"
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
                    className="btn-ghost btn-shadow"
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
                    className="btn-ghost btn-shadow"
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
                    className="btn-ghost btn-shadow"
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
          )}

          {/* Model Selector - Only show for premium users, disabled during tool mode */}
          {!toolMode && (
            <div>
              <LLMModelSelector
                selectedModel={selectedModel}
                onModelChange={(model) => {
                  // Support either prop to avoid breaking older call sites/tests
                  (setSelectedModel ?? onModelChange)(model);
                  // Save to localStorage immediately for premium users
                  if (isPremium) {
                    localStorage.setItem("perle-selected-model", model);
                  }
                }}
                isPremium={isPremium}
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
                className="btn !border-[#dfb768] !text-black"
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
                className="btn-ghost btn-shadow aspect-square !border-[#dfb768]"
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

          {query.trim() ? (
            <button
              className="btn-ghost btn-shadow aspect-square !border-[#dfb768]"
              onClick={() => {
                if (query.trim()) {
                  onSearch();
                  // Always clear the query immediately after triggering search
                  setQuery("");
                }
              }}
              disabled={isLoading}
              aria-label="Search"
              style={{
                padding: 8,
                color: "",
                opacity: isLoading ? 0.5 : 1,
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              {isLoading ? "…" : <FaSearch size={20} />}
            </button>
          ) : speechSupported ? (
            <button
              className="btn-ghost btn-shadow aspect-square !border-[#dfb768]"
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
          ) : null}

          {/* Show conversation options for premium users with existing answers */}
          {isPremium && hasAnswer && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginRight: 8,
                alignItems: "center",
              }}
            >
              <button
                className="btn-ghost btn-shadow aspect-square !border-[#dfb768]"
                onClick={() => {
                  if (onNewConversation) {
                    onNewConversation();
                    setQuery("");
                  }
                }}
                disabled={isLoading}
                style={{
                  padding: 8,
                  fontSize: "var(--font-md)",
                }}
                aria-label="Start a new conversation"
                title="Start a new conversation"
              >
                <FaPen size={18} />
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
        multiple={!toolMode}
        accept={
          toolMode
            ? "image/png,image/jpeg,image/jpg,image/webp,image/bmp,image/svg+xml"
            : "image/png,image/jpeg,image/jpg,image/webp,image/bmp,image/svg+xml,.pdf,.doc,.docx,.txt,.csv,.odt,.xls,.xlsx"
        }
        onChange={(e) => {
          handleFileUpload(e.target.files);
          // Reset input so same file can be selected again
          if (e.target) {
            e.target.value = "";
          }
        }}
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
              className="btn-ghost btn-shadow"
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
                  className="btn-ghost btn-shadow"
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
              className="btn-ghost btn-shadow"
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
  );
};
