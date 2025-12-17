import React, { useEffect, useRef, useState } from "react";

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

  return (
    <div
      ref={containerRef}
      className={`
        w-full text-center text-[var(--text)] text-[length:var(--font-lg)] leading-[1.6]
        max-w-[600px] min-h-[80px] max-h-[80px] p-[12px_16px]
        
        max-md:max-w-full 
        max-md:min-h-[20px] max-md:max-h-[20px]

        max-[480px]:min-h-[40px] 
        max-[480px]:max-h-[calc(100vh-380px)]
        max-[480px]:p-[10px_12px]
        max-[480px]:leading-normal

        flex items-center justify-center overflow-x-hidden overflow-y-auto
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        [-webkit-overflow-scrolling:touch]
        transition-[min-height,max-height,opacity,padding] duration-300 ease-in-out
        ${hasText ? (speaking ? 'opacity-95' : 'opacity-70') : 'opacity-0'}
      `}
    >
      {hasText && (
        <div className="w-full break-all">
          {displayText}
        </div>
      )}
    </div>
  );
};

export default React.memo(VoiceResponseTextComponent);


