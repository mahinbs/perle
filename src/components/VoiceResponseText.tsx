import React, { useEffect, useRef } from "react";
import { formatVoiceAnswerText } from "../utils/voiceAnswerFormatting";

interface VoiceResponseTextProps {
  text?: string;
  speaking: boolean;
}

const VoiceResponseTextComponent: React.FC<VoiceResponseTextProps> = ({
  text: providedText,
  speaking,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const cleaned = (providedText || "")
    .replace(/\bundefined\b/gi, "")
    .replace(/\r\n/g, "\n")
    .trim();

  // Auto-scroll as text grows during speech
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [cleaned]);

  const hasText = cleaned.length > 0;

  return (
    <div
      ref={containerRef}
      className={`
        w-full text-left text-(--text)
        text-[clamp(1rem,2.8vh,1.35rem)] leading-[1.7]
        max-w-[min(720px,94vw)]
        flex-1 min-h-0
        px-[clamp(12px,4vw,28px)] py-2
        overflow-x-hidden overflow-y-auto
        [scrollbar-width:thin]
        [-webkit-overflow-scrolling:touch]
        transition-opacity duration-300 ease-in-out
        ${hasText ? (speaking ? "opacity-100" : "opacity-95") : "opacity-0"}
      `}
      style={{ maxHeight: "100%" }}
    >
      {hasText && (
        <div className="w-full">
          {formatVoiceAnswerText(cleaned)}
          {speaking && (
            <span
              style={{
                display: "inline-block",
                width: 3,
                height: 3,
                borderRadius: "50%",
                backgroundColor: "var(--accent)",
                marginLeft: 4,
                verticalAlign: "middle",
                animation: "blink 1s infinite",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(VoiceResponseTextComponent);
