import React, { useEffect, useRef } from "react";

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

  const formatText = (text: string): React.ReactNode => {
    if (!text) return null;

    const lines = text.split("\n");
    const result: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let currentList: Array<{ bullet: string; content: string }> = [];
    let inList = false;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paraText = currentParagraph.join(" ").trim();
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
            </p>
          );
        }
        currentParagraph = [];
      }
    };

    const flushList = () => {
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
            {currentList.map((item, idx) => (
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
                <span style={{ flex: 1 }}>{item.content}</span>
              </li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) flushList();
        else flushParagraph();
        return;
      }

      if (
        trimmed.endsWith(":") &&
        trimmed.length < 150 &&
        !trimmed.includes("•") &&
        !trimmed.match(/^[-•\d]/)
      ) {
        flushParagraph();
        flushList();
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

      if (
        trimmed.startsWith("•") ||
        trimmed.startsWith("-") ||
        trimmed.match(/^\d+\./)
      ) {
        flushParagraph();
        inList = true;
        let bullet = "•";
        let content = trimmed;
        if (trimmed.startsWith("•")) content = trimmed.substring(1).trim();
        else if (trimmed.startsWith("-")) content = trimmed.substring(1).trim();
        else if (trimmed.match(/^\d+\./)) {
          const match = trimmed.match(/^(\d+\.)\s*(.*)/);
          if (match) {
            bullet = match[1];
            content = match[2];
          }
        }
        if (content) currentList.push({ bullet, content });
        return;
      }

      if (inList) flushList();
      currentParagraph.push(trimmed);
    });

    if (inList) flushList();
    else flushParagraph();

    return result.length > 0 ? <>{result}</> : text;
  };

  return (
    <div
      ref={containerRef}
      className={`
        w-full text-left text-(--text)
        text-[clamp(0.95rem,2.5vh,1.25rem)] leading-[1.65]
        max-w-[min(800px,92vw)]
        flex-1 min-h-[80px]
        p-[1vh_2vw]
        overflow-x-hidden overflow-y-auto
        [scrollbar-width:thin]
        [-webkit-overflow-scrolling:touch]
        transition-opacity duration-300 ease-in-out
        ${hasText ? (speaking ? "opacity-100" : "opacity-90") : "opacity-0"}
      `}
      style={{ maxHeight: "min(52vh, 480px)" }}
    >
      {hasText && (
        <div className="w-full whitespace-pre-wrap">
          {formatText(cleaned)}
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
