import React, { useEffect, useMemo, useRef, useState } from "react";

interface VoiceResponseTextProps {
  text?: string;
  speaking: boolean;
}

const VoiceResponseTextComponent: React.FC<VoiceResponseTextProps> = ({
  text: providedText,
  speaking,
}) => {
  const [localText, setLocalText] = useState<string>("");
  const storageTextRef = useRef<string | null>(null);
  const timeoutRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Clear any pending timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Cancel any previous polling loop when dependency changes
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    const syncFromStorage = () => {
      const stored = localStorage.getItem("perle-current-answer-text");

      if (stored !== storageTextRef.current) {
        storageTextRef.current = stored;
        setLocalText(stored ?? "");
      }

      // When storage entry is cleared while speech still finishing, delay clearing text slightly
      if (!stored) {
        window.setTimeout(() => {
          if (!window.speechSynthesis.speaking) {
            setLocalText("");
            storageTextRef.current = null;
          }
        }, 1200);
      }
    };

    if (typeof providedText === "string") {
      storageTextRef.current = providedText;
      setLocalText(providedText);
      return () => {
        // Nothing to clean up in this branch
      };
    }

    syncFromStorage();

    const schedule = () => {
      syncFromStorage();
      timeoutRef.current = window.setTimeout(schedule, 150);
    };

    schedule();
    window.addEventListener("storage", syncFromStorage);

    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [providedText]);

  const displayText =
    typeof providedText === "string" ? providedText : localText;
  const hasText = displayText.trim().length > 0;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [displayText]);

  const containerStyle = useMemo(
    () => ({
      maxWidth: 600,
      width: "100%",
      minHeight: "80px",
      maxHeight: "80px",
      padding: "12px 16px",
      textAlign: "center" as const,
      color: "var(--text)",
      fontSize: "var(--font-lg)",
      lineHeight: 1.6,
      opacity: hasText ? (speaking ? 0.95 : 0.7) : 0,
      transition:
        "min-height 0.3s ease-in-out, max-height 0.3s ease-in-out, opacity 0.3s ease-in-out, padding 0.3s ease-in-out",
      overflowY: "auto" as const,
      overflowX: "hidden" as const,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      WebkitOverflowScrolling: "touch" as const,
    }),
    [hasText, speaking]
  );

  return (
    <>
      <div
        ref={containerRef}
        className="voice-overlay-text-container"
        style={containerStyle}
      >
        {hasText && (
          <div
            style={{
              width: "100%",
              overflowWrap: "anywhere",
            }}
          >
            {displayText}
          </div>
        )}
      </div>

      <style>
        {`
          .voice-overlay-text-container {
            scrollbar-width: none;
          }
          .voice-overlay-text-container::-webkit-scrollbar {
            width: 0;
            height: 0;
          }
          .voice-overlay-text-container::-webkit-scrollbar-thumb {
            background: transparent;
          }
          
          @media (max-width: 768px) {
            .voice-overlay-text-container {
              max-width: 100% !important;
              padding: 12px 16px !important;
              max-height: 20px !important;
              min-height: 20px !important;
              font-size: var(--font-md) !important;
            }
          }

          @media (max-width: 480px) {
            .voice-overlay-text-container {
              padding: 10px 12px !important;
              max-height: calc(100vh - 380px) !important;
              min-height: 40px !important;
              font-size: var(--font-sm) !important;
              line-height: 1.5 !important;
            }
          }
        `}
      </style>
    </>
  );
};

export default React.memo(VoiceResponseTextComponent);


