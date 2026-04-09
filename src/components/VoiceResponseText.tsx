import React, { useEffect, useRef, useState } from "react";

interface VoiceResponseTextProps {
  text?: string;
  speaking: boolean;
}

const VoiceResponseTextComponent: React.FC<VoiceResponseTextProps> = ({
  text: providedText,
  speaking,
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const typewriterTimerRef = useRef<number | null>(null);

  // Typewriter rendering for voice response text shown under the globe.
  useEffect(() => {
    const cleaned = (providedText || "")
      .replace(/\bundefined\b/gi, "")
      .replace(/\r\n/g, "\n")
      .trim();

    if (typewriterTimerRef.current) {
      window.clearTimeout(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }

    if (!cleaned) {
      setDisplayedText("");
      return;
    }

    // If stream resets/changes drastically, snap to latest to avoid odd backspacing.
    if (!cleaned.startsWith(displayedText)) {
      setDisplayedText(cleaned);
      return;
    }

    const typeNext = () => {
      setDisplayedText((prev) => {
        if (prev.length >= cleaned.length) return prev;
        return cleaned.slice(0, prev.length + 1);
      });
      typewriterTimerRef.current = window.setTimeout(typeNext, 12);
    };

    if (displayedText.length < cleaned.length) {
      typewriterTimerRef.current = window.setTimeout(typeNext, 12);
    }

    return () => {
      if (typewriterTimerRef.current) {
        window.clearTimeout(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    };
  }, [providedText]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedText]);

  const hasText = displayedText.length > 0;

  // Same text structuring logic used by AnswerCard.
  const formatText = (text: string, appendDot?: boolean): React.ReactNode => {
    if (!text) return null;

    const renderWithMath = (value: string): React.ReactNode[] => [value];

    // Process the text line by line to detect structure
    const lines = text.split("\n");
    const result: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let currentList: Array<{ bullet: string; content: string }> = [];
    let inList = false;

    const flushParagraph = (isLast = false) => {
      if (currentParagraph.length > 0) {
        const paraText = currentParagraph.join(" ").trim();
        if (paraText) {
          const mathRendered = renderWithMath(paraText);
          result.push(
            <p
              key={`para-${result.length}`}
              style={{
                marginTop: result.length > 0 ? 12 : 0,
                marginBottom: 12,
                lineHeight: 1.7,
              }}
            >
              {mathRendered}
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
              paddingLeft: 5,
              listStyle: "none",
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
                    display: "flex",
                    gap: 5,
                  }}
                >
                  <span style={{ flexShrink: 0, color: "var(--accent)", fontWeight: 600 }}>
                    {item.bullet}
                  </span>
                  <span style={{ flex: 1 }}>
                    {renderWithMath(item.content)}
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

    lines.forEach((line) => {
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
      if (
        trimmed.endsWith(":") &&
        trimmed.length < 150 &&
        !trimmed.includes("•") &&
        !trimmed.match(/^[-•\d]/)
      ) {
        flushParagraph(false);
        flushList(false);
        result.push(
          <h3
            key={`heading-${result.length}`}
            style={{
              fontSize: "var(--font-lg)",
              fontWeight: 600,
              marginTop: result.length > 0 ? 24 : 0,
              marginBottom: 12,
              color: "var(--text)",
            }}
          >
            {trimmed}
          </h3>
        );
        return;
      }

      // Check if it's a bullet point
      if (
        trimmed.startsWith("•") ||
        trimmed.startsWith("-") ||
        trimmed.match(/^\d+\./)
      ) {
        flushParagraph(false);
        inList = true;

        let bullet = "•";
        let content = trimmed;

        if (trimmed.startsWith("•")) {
          content = trimmed.substring(1).trim();
        } else if (trimmed.startsWith("-")) {
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

  return (
    <div
      ref={containerRef}
      className={`
        w-full text-center text-(--text)
        text-[clamp(1rem,3vh,1.5rem)] leading-[1.6]
        max-w-[800px]
        min-h-[60px] max-h-[25vh]
        p-[2vh_2vw]
        
        flex items-center justify-center overflow-x-hidden overflow-y-auto
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        [-webkit-overflow-scrolling:touch]
        transition-[max-height,opacity,padding] duration-300 ease-in-out
        ${hasText ? (speaking ? 'opacity-95' : 'opacity-70') : 'opacity-0'}
      `}
    >
      {hasText && (
        <div className="w-full break-after-auto text-left whitespace-pre-wrap">
          {formatText(displayedText)}
        </div>
      )}
    </div>
  );
};

export default React.memo(VoiceResponseTextComponent);


