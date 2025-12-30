import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { AnswerChunk, Source, Mode } from "../types";
import { SourceChip } from "./SourceChip";
import { copyToClipboard, shareContent } from "../utils/helpers";
import { useToast } from "../contexts/ToastContext";
import {
  FaVolumeUp,
  FaStop,
  FaBookmark,
  FaShare,
  FaClipboard,
  FaCheck,
  FaChevronDown,
} from "react-icons/fa";
import loadingGif from "../assets/gif/loading-video.gif";
import loadingVideo from "../assets/loading.mp4";

interface AnswerCardProps {
  chunks: AnswerChunk[];
  sources: Source[];
  isLoading: boolean;
  mode?: Mode;
  query?: string;
  onQueryEdit?: (editedQuery: string) => void;
  onSearch?: (query: string, mode?: Mode) => void;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({
  chunks,
  sources,
  isLoading,
  mode: _mode,
  query,
  onQueryEdit,
  onSearch,
}) => {
  const [expandedSources, setExpandedSources] = useState(false);
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedQuery, setEditedQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [displayedTexts, setDisplayedTexts] = useState<Record<number, string>>(
    {}
  );
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const offcanvasRef = useRef<HTMLDivElement>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const typewriterTimeoutRef = useRef<number | null>(null);
  const answerContentRef = useRef<HTMLDivElement>(null);
  const loadingVideoRef = useRef<HTMLVideoElement>(null);
  const [showVideoFallback, setShowVideoFallback] = useState(true); // Start with gif, switch to video when ready
  const [videoReady, setVideoReady] = useState(false);
  const { showToast } = useToast();

  // Check for speech synthesis support
  useEffect(() => {
    setSpeechSupported("speechSynthesis" in window);
  }, []);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (synthesisRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Initialize edited query when opening modal
  useEffect(() => {
    if (showEditModal && query) {
      setEditedQuery(query);
      setIsClosing(false);
      setDragCurrentY(0);
      // Focus the input after a brief delay to ensure offcanvas is rendered
      setTimeout(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      }, 300);
    }
  }, [showEditModal, query]);

  // Handle swipe gestures for closing
  useEffect(() => {
    if (!showEditModal || !offcanvasRef.current) return;

    const offcanvas = offcanvasRef.current;
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startY = touch.clientY;
      currentY = startY;

      // Always prepare for potential drag, but only activate if downward swipe
      isDragging = false; // Start as false, will be set true on move if downward
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      currentY = touch.clientY;
      const deltaY = currentY - startY;

      // Check if user is swiping down (not scrolling up)
      if (deltaY > 10) {
        // User is swiping down - activate drag
        if (!isDragging) {
          isDragging = true;
          setIsDragging(true);
        }

        // Only prevent default if we're actually dragging (not scrolling content)
        const target = e.target as HTMLElement;
        const isHandle = target.closest("[data-offcanvas-handle]");

        // If content is scrolled and not at top, allow normal scrolling
        if (offcanvas.scrollTop > 0 && !isHandle) {
          // Allow scrolling if content is scrollable and not at top
          return;
        }

        // Otherwise, handle as drag gesture
        setDragCurrentY(deltaY);
        e.preventDefault();
      } else if (deltaY < -10 && offcanvas.scrollTop > 0) {
        // User is swiping up and content is scrollable - allow normal scroll
        isDragging = false;
        setIsDragging(false);
        return;
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;

      const deltaY = currentY - startY;
      const threshold = 100; // Minimum swipe distance to close

      if (deltaY > threshold) {
        // Close the offcanvas
        setIsClosing(true);
        setTimeout(() => {
          handleCloseModal();
        }, 200);
      } else {
        // Reset position
        setDragCurrentY(0);
      }

      isDragging = false;
      setIsDragging(false);
    };

    offcanvas.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    offcanvas.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    offcanvas.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      offcanvas.removeEventListener("touchstart", handleTouchStart);
      offcanvas.removeEventListener("touchmove", handleTouchMove);
      offcanvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [showEditModal]);

  // Handle modal close
  const handleCloseModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowEditModal(false);
      setEditedQuery("");
      setIsClosing(false);
      setDragCurrentY(0);
    }, 200);
  };

  // Handle query edit submission
  const handleEditSubmit = () => {
    if (!editedQuery.trim()) {
      showToast({
        message: "Query cannot be empty",
        type: "error",
        duration: 2000,
      });
      return;
    }

    if (onQueryEdit) {
      onQueryEdit(editedQuery.trim());
    }
    handleCloseModal();
  };

  // Handle keyboard in modal
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      handleCloseModal();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleEditSubmit();
    }
  };

  // Typewriter effect for answer chunks
  useEffect(() => {
    if (isLoading || chunks.length === 0) {
      setDisplayedTexts({});
      setIsTypingComplete(false);
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
        typewriterTimeoutRef.current = null;
      }
      return;
    }

    // Reset state when chunks change
    setDisplayedTexts({});
    setIsTypingComplete(false);
    if (typewriterTimeoutRef.current) {
      clearTimeout(typewriterTimeoutRef.current);
      typewriterTimeoutRef.current = null;
    }

    // Type out each chunk sequentially
    let currentChunkIndex = 0;
    let currentCharIndex = 0;
    const typingSpeed = 1; // milliseconds per character

    const typeNextChar = () => {
      if (currentChunkIndex >= chunks.length) {
        // All chunks are complete
        setIsTypingComplete(true);
        return;
      }

      const currentChunk = chunks[currentChunkIndex];
      const currentText = currentChunk.text;

      if (currentCharIndex < currentText.length) {
        // Type next character
        setDisplayedTexts((prev) => ({
          ...prev,
          [currentChunkIndex]: currentText.substring(0, currentCharIndex + 1),
        }));
        currentCharIndex++;
        typewriterTimeoutRef.current = setTimeout(typeNextChar, typingSpeed);
      } else {
        // Move to next chunk
        currentChunkIndex++;
        currentCharIndex = 0;
        typewriterTimeoutRef.current = setTimeout(typeNextChar, typingSpeed);
      }
    };

    // Start typing after a brief delay
    typewriterTimeoutRef.current = setTimeout(typeNextChar, 100);

    return () => {
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
        typewriterTimeoutRef.current = null;
      }
    };
  }, [chunks, isLoading]);

  // Auto-scroll to follow typewriter effect
  useEffect(() => {
    if (!answerContentRef.current || isLoading || chunks.length === 0) return;
    
    // Find the last chunk that has displayed text
    const getLastChunkWithText = (): HTMLElement | null => {
      if (!answerContentRef.current) return null;
      
      const chunkElements = answerContentRef.current.querySelectorAll('[data-chunk]');
      if (chunkElements.length === 0) return null;
      
      // Find the last chunk that has text
      for (let i = chunkElements.length - 1; i >= 0; i--) {
        const chunk = chunkElements[i] as HTMLElement;
        const chunkIndex = parseInt(chunk.getAttribute('data-chunk-index') || '-1');
        if (chunkIndex >= 0 && displayedTexts[chunkIndex] && displayedTexts[chunkIndex].length > 0) {
          return chunk;
        }
      }
      
      // Fallback: return the last chunk element
      return chunkElements[chunkElements.length - 1] as HTMLElement;
    };

    // Scroll to the last chunk being typed
    const scrollToLastChunk = () => {
      const lastChunk = getLastChunkWithText();
      if (!lastChunk) return;
      
      // Use scrollIntoView for reliable scrolling
      // During typing, use instant scroll (block: 'end' to show bottom of element)
      // After completion, use smooth scroll
      lastChunk.scrollIntoView({
        behavior: isTypingComplete ? 'smooth' : 'auto',
        block: 'end',
        inline: 'nearest'
      });
    };

    // During typing, scroll immediately using requestAnimationFrame
    // After completion, scroll to bottom of page
    if (isTypingComplete) {
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
          behavior: 'smooth'
        });
      };
      
      // Use multiple attempts to ensure it works even if page is still rendering
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          scrollToBottom();
          // Try again after a delay to catch any late DOM updates
          setTimeout(scrollToBottom, 300);
          setTimeout(scrollToBottom, 600);
        });
      }, 200);
      return () => clearTimeout(timeoutId);
    } else {
      // During typing, scroll immediately every time displayedTexts changes
      requestAnimationFrame(() => {
        scrollToLastChunk();
      });
      return;
    }
  }, [displayedTexts, isLoading, chunks.length, isTypingComplete]);

  // Auto-speak the next answer when triggered from voice overlay
  useEffect(() => {
    const shouldSpeak = localStorage.getItem("perle-speak-next-answer");
    if (!shouldSpeak) return;
    if (chunks.length === 0 || isLoading) return;
    // consume the flag
    localStorage.removeItem("perle-speak-next-answer");
    startVoiceOutput();
  }, [chunks, isLoading]);

  // Format text with markdown-like formatting
  const formatText = (text: string, appendDot?: boolean): React.ReactNode => {
    if (!text) return null;

    // Process the text line by line to detect structure
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let currentList: Array<{ bullet: string; content: string }> = [];
    let inList = false;

    const flushParagraph = (isLast = false) => {
      if (currentParagraph.length > 0) {
        const paraText = currentParagraph.join(' ').trim();
        if (paraText) {
          result.push(
            <p
              key={`para-${result.length}`}
              style={{
                marginTop: result.length > 0 ? 12 : 0,
                marginBottom: 12,
                lineHeight: 1.7,
              }}
            >
              {paraText}
              {isLast && appendDot && (
                <span
                  style={{
                    display: "inline-block",
                    width: "3px",
                    height: "3px",
                    borderRadius: "50%",
                    backgroundColor: "var(--text)",
                    marginLeft: "4px",
                    verticalAlign: "middle",
                    animation: "blink 1s infinite",
                  }}
                />
              )}
            </p>
          );
        }
        currentParagraph = [];
      }
    };

    const flushList = (isLast = false) => {
      if (currentList.length > 0) {
        result.push(
          <ul
            key={`list-${result.length}`}
            style={{
              marginTop: result.length > 0 ? 12 : 0,
              marginBottom: 12,
              paddingLeft: 20,
              listStyle: 'none',
            }}
          >
            {currentList.map((item, idx) => {
              const isLastItem = isLast && appendDot && idx === currentList.length - 1;
              return (
                <li
                  key={`li-${idx}`}
                  style={{
                    marginBottom: 8,
                    lineHeight: 1.7,
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <span style={{ flexShrink: 0, color: 'var(--accent)', fontWeight: 600 }}>
                    {item.bullet}
                  </span>
                  <span style={{ flex: 1 }}>
                    {item.content}
                    {isLastItem && (
                      <span
                        style={{
                          display: "inline-block",
                          width: "3px",
                          height: "3px",
                          borderRadius: "50%",
                          backgroundColor: "var(--text)",
                          marginLeft: "4px",
                          verticalAlign: "middle",
                          animation: "blink 1s infinite",
                        }}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        );
        currentList = [];
        inList = false;
      }
    };

    lines.forEach((line, _index) => {
      const trimmed = line.trim();
      
      // Empty line - flush current context
      if (!trimmed) {
        if (inList) {
          flushList(false);
        } else {
          flushParagraph(false);
        }
        return;
      }

      // Check if it's a heading (ends with colon, single line, reasonable length)
      if (trimmed.endsWith(':') && trimmed.length < 150 && !trimmed.includes('•') && !trimmed.match(/^[-•\d]/)) {
        flushParagraph(false);
        flushList(false);
        result.push(
          <h3
            key={`heading-${result.length}`}
            style={{
              fontSize: 'var(--font-lg)',
              fontWeight: 600,
              marginTop: result.length > 0 ? 24 : 0,
              marginBottom: 12,
              color: 'var(--text)',
            }}
          >
            {trimmed}
          </h3>
        );
        return;
      }

      // Check if it's a bullet point
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.match(/^\d+\./)) {
        flushParagraph(false);
        inList = true;
        
        let bullet = '•';
        let content = trimmed;
        
        if (trimmed.startsWith('•')) {
          content = trimmed.substring(1).trim();
        } else if (trimmed.startsWith('-')) {
          content = trimmed.substring(1).trim();
        } else if (trimmed.match(/^\d+\./)) {
          const match = trimmed.match(/^(\d+\.)\s*(.*)/);
          if (match) {
            bullet = match[1];
            content = match[2];
          }
        }

        if (content) {
          currentList.push({ bullet, content });
        }
        return;
      }

      // Regular text line
      if (inList) {
        flushList(false);
      }
      currentParagraph.push(trimmed);
    });

    // Flush any remaining content (these are the last elements)
    if (inList && currentList.length > 0) {
      // We're in a list, so the list is the last element
      flushList(true);
    } else if (currentParagraph.length > 0) {
      // Paragraph is the last element
      flushParagraph(true);
    } else if (currentList.length > 0) {
      // List is the last element (shouldn't normally happen, but handle it)
      flushList(true);
    }

    return result.length > 0 ? <>{result}</> : text;
  };

  const handleCopyChunk = async (chunk: AnswerChunk, index: number) => {
    try {
      await copyToClipboard(chunk.text);
      setCopiedChunk(index);
      setTimeout(() => setCopiedChunk(null), 2000);
      showToast({
        message: "Copied to clipboard!",
        type: "success",
        duration: 2000,
      });
    } catch (error) {
      showToast({
        message: "Failed to copy",
        type: "error",
        duration: 2000,
      });
    }
  };

  const handleShareAnswer = async () => {
    const answerText = chunks.map((c) => c.text).join(" ");
    const sourceText = sources
      .map((s) => `${s.title} (${s.domain})`)
      .join("\n");

    await shareContent({
      title: "Answer from SyntraIQ",
      text: `${answerText}\n\nSources:\n${sourceText}`,
      url: window.location.href,
    });
  };

  const handleBookmarkAnswer = () => {
    // Save to localStorage for now
    const bookmarks = JSON.parse(
      localStorage.getItem("perle-bookmarks") || "[]"
    );
    const bookmark = {
      id: Date.now().toString(),
      chunks,
      sources,
      timestamp: Date.now(),
    };

    bookmarks.unshift(bookmark);
    localStorage.setItem(
      "perle-bookmarks",
      JSON.stringify(bookmarks.slice(0, 50))
    );

    showToast({
      message: "Answer bookmarked!",
      type: "success",
      duration: 2000,
    });
  };

  const startVoiceOutput = () => {
    if (!speechSupported) {
      // Silently fail if text-to-speech is not supported
      // This allows voice input to work even without voice output support
      console.log("Text-to-speech is not supported in this browser");
      return;
    }

    if (isSpeaking) {
      stopVoiceOutput();
      return;
    }

    // Stop any existing speech
    window.speechSynthesis.cancel();

    const answerText = chunks.map((c) => c.text).join(" ");

    // Split text into words for progressive display (preserve spaces)
    const words = answerText.split(/(\s+)/).filter((w) => w.length > 0);
    let currentWordIndex = 0;
    let speechStartTime = 0;
    let fallbackInterval: number | null = null;
    let lastBoundaryUpdate = 0;

    // Initialize with empty text
    localStorage.setItem("perle-current-answer-text", "");
    localStorage.setItem("perle-current-word-index", "0");
    localStorage.setItem("perle-speech-rate", "0.9");

    const utterance = new SpeechSynthesisUtterance(answerText);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;

    utterance.onstart = () => {
      setIsSpeaking(true);
      currentWordIndex = 0;
      speechStartTime = Date.now();
      lastBoundaryUpdate = Date.now();

      // Show first word immediately
      if (words.length > 0) {
        const displayedText = words[0];
        localStorage.setItem("perle-current-answer-text", displayedText);
        localStorage.setItem("perle-current-word-index", "0");
      }

      // Fallback timer for mobile devices where onboundary may not fire reliably
      // Estimate words per second: average English is ~150 words/min = 2.5 words/sec
      // With rate 0.9, that's ~2.25 words/sec, so ~444ms per word
      const estimatedMsPerWord = 450 / utterance.rate;

      fallbackInterval = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
          return;
        }

        const elapsed = Date.now() - speechStartTime;
        const timeSinceLastUpdate = Date.now() - lastBoundaryUpdate;

        // Calculate estimated progress based on elapsed time
        const estimatedWordIndex = Math.min(
          Math.floor(elapsed / estimatedMsPerWord + 1),
          words.length - 1
        );

        // Use fallback if onboundary hasn't updated recently (mobile fallback)
        // This ensures mobile devices get updates even if boundary events are delayed or missing
        const shouldUseFallback =
          timeSinceLastUpdate > estimatedMsPerWord * 0.8;

        // Always update if we've progressed and either:
        // 1. Boundary events haven't updated recently (fallback mode), OR
        // 2. We're significantly ahead of the last boundary update (catch-up mode)
        if (estimatedWordIndex > currentWordIndex && shouldUseFallback) {
          currentWordIndex = estimatedWordIndex;
          const displayedText = words.slice(0, estimatedWordIndex + 1).join("");
          localStorage.setItem("perle-current-answer-text", displayedText);
          localStorage.setItem(
            "perle-current-word-index",
            estimatedWordIndex.toString()
          );
          // Update lastBoundaryUpdate to prevent double-updates when boundary catches up
          lastBoundaryUpdate = Date.now();
        }
      }, 150); // Check every 150ms for smoother updates
    };

    // Track word boundaries for progressive text display
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name === "word" && event.charIndex !== undefined) {
        // Calculate which word we're currently on based on character index
        let charCount = 0;
        let wordIndex = 0;

        for (let i = 0; i < words.length; i++) {
          const wordLength = words[i].length;
          if (charCount + wordLength > event.charIndex) {
            wordIndex = i;
            break;
          }
          charCount += wordLength;
        }

        // Update if we've moved to a new word
        if (wordIndex > currentWordIndex) {
          currentWordIndex = wordIndex;
          lastBoundaryUpdate = Date.now();
          // Update displayed text up to and including current word
          const displayedText = words.slice(0, wordIndex + 1).join("");
          localStorage.setItem("perle-current-answer-text", displayedText);
          localStorage.setItem(
            "perle-current-word-index",
            wordIndex.toString()
          );
        }
      }
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      // Clear fallback interval
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      // Show full text when speech ends
      localStorage.setItem("perle-current-answer-text", answerText);
      // Clear the stored text after a delay
      setTimeout(() => {
        localStorage.removeItem("perle-current-answer-text");
        localStorage.removeItem("perle-current-word-index");
      }, 2000);
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event.error);
      setIsSpeaking(false);
      // Clear fallback interval
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      // Show full text on error
      localStorage.setItem("perle-current-answer-text", answerText);
    };

    synthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopVoiceOutput = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    // Clear the stored text when speech is stopped
    localStorage.removeItem("perle-current-answer-text");
    localStorage.removeItem("perle-current-word-index");
    // Note: fallbackInterval will be cleared in onend/onerror handlers
  };

  // Reset video state when loading starts
  useEffect(() => {
    if (isLoading) {
      setShowVideoFallback(true); // Show gif initially
      setVideoReady(false);
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="sub text-sm" style={{ marginBottom: 10 }}>
          Syntra<span className="text-[var(--accent)]">IQ</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10" style={{ position: 'relative' }}>
            {showVideoFallback ? (
              <img
                src={loadingGif}
                loading="eager"
                alt="loading"
                className="rounded-full w-full h-full object-cover"
                style={{ display: 'block' }}
              />
            ) : (
              <video
                ref={loadingVideoRef}
                src={loadingVideo}
                autoPlay
                loop
                muted
                playsInline
                className="rounded-full w-full h-full object-cover"
                onError={() => setShowVideoFallback(true)}
                onCanPlay={() => {
                  if (loadingVideoRef.current) {
                    loadingVideoRef.current.playbackRate = 4.0;
                    setVideoReady(true);
                    setShowVideoFallback(false);
                  }
                }}
                onLoadedData={() => {
                  if (loadingVideoRef.current && !videoReady) {
                    loadingVideoRef.current.playbackRate = 4.0;
                    setVideoReady(true);
                    setShowVideoFallback(false);
                  }
                }}
                style={{ display: 'block' }}
              />
            )}
          </div>
          <p className="text-base">
            IQ is thinking
            <span className="dot-blink" style={{ animationDelay: "0s" }}>
              .
            </span>
            <span className="dot-blink" style={{ animationDelay: "0.2s" }}>
              .
            </span>
            <span className="dot-blink" style={{ animationDelay: "0.4s" }}>
              .
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <></>
      // <div className="card" style={{ padding: 18 }}>
      //   <div className="sub text-sm" style={{ marginBottom: 10 }}>Answer</div>
      //   <div className="sub">
      //     Ask a question to get a sourced, concise answer.
      //   </div>
      //   <div className="spacer-14" />
      //   <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      //     {[
      //       'What is machine learning?',
      //       'How does AI work?',
      //       'Compare React vs Vue',
      //       'Explain quantum computing'
      //     ].map(suggestion => (
      //       <span
      //         key={suggestion}
      //         className="chip"
      //         role="button"
      //         tabIndex={0}
      //         onClick={() => onSearch?.(suggestion, mode)}
      //         style={{ cursor: 'pointer' }}
      //       >
      //         {suggestion}
      //       </span>
      //     ))}
      //   </div>
      // </div>
    );
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      {/* Display the searched query prominently */}
      {query && (
        <div
          style={{
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            onClick={() => {
              if (onQueryEdit) {
                setShowEditModal(true);
              }
            }}
            style={{
              fontSize: "var(--font-xl)",
              fontWeight: 600,
              lineHeight: "32px",
              color: "var(--text)",
              wordBreak: "break-word",
              cursor: onQueryEdit ? "pointer" : "default",
              padding: "8px 12px",
              borderRadius: "8px",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (onQueryEdit) {
                e.currentTarget.style.backgroundColor = "var(--border)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title={onQueryEdit ? "Click to edit query" : undefined}
          >
            {query}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: "var(--font-sm)",
              fontWeight: 500,
              color: "var(--sub)",
            }}
          >
            {/* Answer */}
            Syntra<span className="text-[var(--accent)]">IQ</span>
          </div>
          {/* {mode && (
            <span className="chip" style={{
              fontSize: 'var(--font-sm)',
              padding: '4px 8px',
              background: 'var(--accent)',
              color: '#111',
              fontWeight: 600
            }}>
              {mode}
            </span>
          )} */}
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
          }}
        >
          {speechSupported && (
            <>
              <button
                className="btn-ghost"
                onClick={startVoiceOutput}
                aria-label={isSpeaking ? "Stop speaking" : "Speak answer"}
                style={{
                  padding: 8,
                  fontSize: "var(--font-md)",
                  background: isSpeaking ? "var(--accent)" : "transparent",
                  color: isSpeaking ? "white" : "inherit",
                }}
              >
                <FaVolumeUp size={18} />
              </button>
              {isSpeaking && (
                <button
                  className="btn-ghost"
                  onClick={stopVoiceOutput}
                  aria-label="Stop speaking"
                  style={{
                    padding: 8,
                    fontSize: "var(--font-md)",
                    color: "var(--accent)",
                  }}
                >
                  <FaStop size={18} />
                </button>
              )}
            </>
          )}
          <button
            className="btn-ghost"
            onClick={handleBookmarkAnswer}
            aria-label="Bookmark answer"
            style={{
              padding: 8,
              fontSize: "var(--font-md)",
            }}
          >
            <FaBookmark size={18} />
          </button>
          <button
            className="btn-ghost"
            onClick={handleShareAnswer}
            aria-label="Share answer"
            style={{
              padding: 8,
              fontSize: "var(--font-md)",
            }}
          >
            <FaShare size={18} />
          </button>
        </div>
      </div>

      <div 
        ref={answerContentRef}
        style={{ display: "flex", flexDirection: "column", gap: 20 }}
      >
        {chunks.map((chunk, index) => (
          <div key={index} style={{ position: "relative" }} data-chunk data-chunk-index={index}>
            <div
              className="text-[1.26rem] leading-relaxed"
              style={{
                // fontSize: 'var(--font-lg)',
                marginBottom: 12,
                color: "var(--text)",
              }}
            >
              {formatText(displayedTexts[index] || "", isTypingComplete && index === chunks.length - 1)}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  flex: 1,
                }}
              >
                {chunk.citationIds.map((id) => {
                  const source = sources.find((s) => s.id === id);
                  return source ? (
                    <SourceChip key={`${id}-${index}`} source={source} />
                  ) : null;
                })}
              </div>

              <button
                className="btn-ghost"
                onClick={() => handleCopyChunk(chunk, index)}
                aria-label="Copy chunk"
                style={{
                  padding: 6,
                  opacity: copiedChunk === index ? 1 : 0.6,
                  flexShrink: 0,
                  alignSelf: "flex-start",
                }}
              >
                {copiedChunk === index ? (
                  <FaCheck size={16} />
                ) : (
                  <FaClipboard size={16} />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="spacer-16" />

      {/* Sources Section */}
      <div>
        <button
          className="btn-ghost"
          onClick={() => setExpandedSources(!expandedSources)}
          style={{
            width: "100%",
            justifyContent: "space-between",
            padding: "12px 0",
            borderBottom: "1px solid var(--border)",
            marginBottom: 16,
            fontSize: "var(--font-md)",
            fontWeight: 500,
          }}
        >
          <span>Sources ({sources.length})</span>
          <span
            style={{
              transform: expandedSources ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              fontSize: "var(--font-sm)",
            }}
          >
            <FaChevronDown size={14} />
          </span>
        </button>

        {expandedSources && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sources.map((source) => (
              <div key={source.id} className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {source.title}
                </div>
                <div className="sub text-sm" style={{ marginBottom: 6 }}>
                  {source.domain} • {source.year}
                </div>
                {source.snippet && (
                  <div className="sub text-sm" style={{ lineHeight: "18px" }}>
                    {source.snippet}
                  </div>
                )}
                <button
                  className="btn-ghost"
                  onClick={() => window.open(source.url, "_blank")}
                  style={{
                    marginTop: 8,
                    padding: "4px 8px",
                    fontSize: "var(--font-sm)",
                  }}
                >
                  Visit Source →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="spacer-16" />

      {/* Follow-up Actions */}
      {/* <div>
        <div
          style={{
            fontSize: "var(--font-md)",
            fontWeight: 500,
            marginBottom: 12,
            color: "var(--text)",
          }}
        >
          Follow-up Actions
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {[
            { text: "Show recent studies only", mode: "Research" as Mode },
            { text: "Compare viewpoints", mode: "Compare" as Mode },
            { text: "Summarize in 5 bullets", mode: "Summarize" as Mode },
            { text: "What are the risks?", mode: "Ask" as Mode },
            { text: "Find similar topics", mode: "Research" as Mode },
            { text: "Explain like I'm 5", mode: "Ask" as Mode },
          ].map((action) => (
            <span
              key={action.text}
              className="chip"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (query) {
                  onSearch?.(`${query} ${action.text}`, action.mode);
                } else {
                  onSearch?.(action.text, action.mode);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              {action.text}
            </span>
          ))}
        </div>
      </div> */}

      {/* Edit Query Offcanvas */}
      {showEditModal &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: isClosing
                  ? "rgba(0, 0, 0, 0)"
                  : "rgba(0, 0, 0, 0.5)",
                zIndex: 9999,
                transition: "background-color 0.2s ease",
              }}
              onClick={handleCloseModal}
            />

            {/* Offcanvas */}
            <div
              ref={offcanvasRef}
              className="card"
              data-offcanvas-handle
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                bottom: isClosing ? "-100%" : `${Math.max(0, dragCurrentY)}px`,
                left: 0,
                right: 0,
                maxHeight: "90vh",
                borderTopLeftRadius: "20px",
                borderTopRightRadius: "20px",
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                padding: 0,
                zIndex: 10000,
                transform: isDragging ? "none" : undefined,
                transition: isDragging
                  ? "none"
                  : "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.15)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Drag Handle */}
              <div
                data-offcanvas-handle
                style={{
                  width: "100%",
                  padding: "12px 0",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  cursor: "grab",
                  userSelect: "none",
                  touchAction: "none",
                }}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <div
                  data-offcanvas-handle
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: "var(--border)",
                    cursor: "grab",
                  }}
                />
              </div>

              {/* Content */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "0 24px 24px 24px",
                }}
              >
                <div
                  style={{
                    marginBottom: 16,
                    fontSize: "var(--font-xl)",
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  Edit Query
                </div>

                <textarea
                  ref={editInputRef}
                  className="input"
                  value={editedQuery}
                  onChange={(e) => {
                    setEditedQuery(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(
                      e.target.scrollHeight,
                      200
                    )}px`;
                  }}
                  onKeyDown={handleModalKeyDown}
                  placeholder="Enter your query..."
                  style={{
                    width: "100%",
                    minHeight: 100,
                    maxHeight: 200,
                    fontSize: "var(--font-md)",
                    lineHeight: 1.5,
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--text)",
                    resize: "vertical",
                    fontFamily: "inherit",
                    marginBottom: 16,
                  }}
                  rows={3}
                />

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="btn-ghost"
                    onClick={handleCloseModal}
                    style={{ padding: "10px 20px" }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn"
                    onClick={handleEditSubmit}
                    disabled={!editedQuery.trim()}
                    style={{ padding: "10px 20px" }}
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};
