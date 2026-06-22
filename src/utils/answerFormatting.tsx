import React from "react";
import type { Source } from "../types";

export function normalizeCitationText(text: string): string {
  return text.replace(/source\s*\((\d+)\)/gi, "[$1]");
}

/** Keep heading text intact, including the leading topic emoji (intended formatting). */
export function stripHeadingEmojis(text: string): string {
  // Keep the leading topic emoji (part of the intended formatting); only trim
  // whitespace and any dangling trailing emoji.
  return text.replace(/[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/u, "").trim();
}

export function parseMarkdownHeading(
  line: string
): { level: 1 | 2 | 3; text: string } | null {
  const trimmed = line.trim();
  const h3 = trimmed.match(/^###\s+(.+)$/);
  if (h3) return { level: 3, text: stripHeadingEmojis(h3[1].trim()) };
  const h2 = trimmed.match(/^##\s+(.+)$/);
  if (h2) return { level: 2, text: stripHeadingEmojis(h2[1].trim()) };
  const h1 = trimmed.match(/^#\s+(.+)$/);
  if (h1) return { level: 1, text: stripHeadingEmojis(h1[1].trim()) };
  return null;
}

export function isSectionDivider(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
}

/** Match a leading emoji at the very start of a line (any pictographic glyph + optional VS-16 + optional ZWJ sequence). */
const LEADING_EMOJI_RE = /^[\p{Extended_Pictographic}](️|‍[\p{Extended_Pictographic}])*\s+/u;

export function isColonHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 150) return false;
  if (trimmed.includes("•")) return false;
  if (trimmed.match(/^[-•\d]/)) return false;
  if (trimmed.startsWith("#")) return false;
  // Normal colon-terminated heading: "Section Heading:"
  if (trimmed.endsWith(":")) return true;
  // Emoji-prefixed short title — treat as a heading regardless of terminal
  // punctuation. Models frequently write rhetorical-question headings like
  // "🎯 Which One Should You Pick?" or exclamatory ones like "🚀 The Future!".
  // Only exclude lines ending in "." (those look like sentences, not titles).
  if (LEADING_EMOJI_RE.test(trimmed) && trimmed.length <= 80 && !trimmed.endsWith(".")) {
    return true;
  }
  return false;
}

type RenderMathFn = (text: string) => React.ReactNode[];

export function renderInlineFormatted(
  text: string,
  _sources: Source[],
  renderMath: RenderMathFn,
  renderCitation: (number: number) => React.ReactNode
): React.ReactNode {
  const normalized = normalizeCitationText(text);
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[(\d+)\]/g;
  const tokens: Array<
    | { type: "text"; value: string }
    | { type: "bold"; value: string }
    | { type: "italic"; value: string }
    | { type: "cite"; value: number }
  > = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: normalized.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      tokens.push({ type: "bold", value: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ type: "italic", value: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: "cite", value: parseInt(match[3], 10) });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    tokens.push({ type: "text", value: normalized.slice(lastIndex) });
  }

  if (tokens.length === 0) {
    return <>{renderMath(normalized)}</>;
  }

  return (
    <>
      {tokens.map((token, index) => {
        if (token.type === "text") {
          return (
            <React.Fragment key={`txt-${index}`}>
              {renderMath(token.value)}
            </React.Fragment>
          );
        }
        if (token.type === "bold") {
          return (
            <strong
              key={`bold-${index}`}
              style={{ fontWeight: 700, color: "var(--text)" }}
            >
              {renderMath(token.value)}
            </strong>
          );
        }
        if (token.type === "italic") {
          return (
            <em key={`italic-${index}`} style={{ fontStyle: "italic" }}>
              {renderMath(token.value)}
            </em>
          );
        }
        return (
          <React.Fragment key={`cite-${index}`}>
            {renderCitation(token.value)}
          </React.Fragment>
        );
      })}
    </>
  );
}

export function renderAnswerHeading(
  level: 1 | 2 | 3,
  text: string,
  key: string,
  content: React.ReactNode
): React.ReactNode {
  const cleanText = stripHeadingEmojis(text.replace(/:+$/, "").trim());
  const styles: Record<1 | 2 | 3, React.CSSProperties> = {
    1: {
      fontSize: "1.35rem",
      fontWeight: 700,
      marginTop: 0,
      marginBottom: 16,
      lineHeight: 1.3,
      color: "var(--text)",
      letterSpacing: "-0.02em",
      paddingBottom: 10,
      borderBottom: "2px solid var(--border)",
    },
    2: {
      fontSize: "1.12rem",
      fontWeight: 800,
      marginTop: 28,
      marginBottom: 12,
      lineHeight: 1.35,
      color: "var(--text)",
      paddingBottom: 6,
      borderBottom: "1px solid var(--border)",
      letterSpacing: "-0.01em",
    },
    3: {
      fontSize: "1.02rem",
      fontWeight: 800,
      marginTop: 20,
      marginBottom: 8,
      lineHeight: 1.4,
      color: "var(--text)",
      fontStyle: "normal",
      letterSpacing: "-0.01em",
    },
  };

  const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";

  return (
    <Tag key={key} style={styles[level]}>
      {content ?? cleanText}
    </Tag>
  );
}

export function AnswerBulletDot() {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "var(--accent)",
        marginTop: 9,
        flexShrink: 0,
      }}
    />
  );
}

/** Bold the leading term in list items (IEEE-style: "Term: detail" or "Term — detail"). */
export function renderLeadBoldContent(
  content: string,
  renderRest: (text: string) => React.ReactNode
): React.ReactNode {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (/\*\*[^*]+\*\*/.test(trimmed)) {
    return renderRest(trimmed);
  }

  const colonMatch = trimmed.match(/^([^:]{2,80}):\s+([\s\S]+)$/);
  if (colonMatch && !colonMatch[1].includes("\n")) {
    return (
      <>
        <strong style={{ fontWeight: 700, color: "var(--text)" }}>
          {colonMatch[1].trim()}
        </strong>
        {": "}
        {renderRest(colonMatch[2].trim())}
      </>
    );
  }

  const dashMatch = trimmed.match(/^([^–—-]{2,60}?)\s[-–—]\s+([\s\S]+)$/);
  if (dashMatch) {
    return (
      <>
        <strong style={{ fontWeight: 700, color: "var(--text)" }}>
          {dashMatch[1].trim()}
        </strong>
        {" — "}
        {renderRest(dashMatch[2].trim())}
      </>
    );
  }

  return renderRest(trimmed);
}

/** Normalize spacing and section breaks for document-style answers. */
export function enhanceDocumentStructure(text: string): string {
  if (!text) return text;

  let result = text.replace(/\r\n/g, "\n");

  // Promote short ALL-CAPS lines (3–60 chars) to level-2 headings
  result = result
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (
        t.length >= 3 &&
        t.length <= 60 &&
        t === t.toUpperCase() &&
        /[A-Z]/.test(t) &&
        !t.startsWith("#") &&
        !/^[\d•\-*]/.test(t)
      ) {
        return `## ${t.charAt(0) + t.slice(1).toLowerCase()}`;
      }
      return line;
    })
    .join("\n");

  // Ensure blank line before markdown headings
  result = result.replace(/([^\n])\n(#{1,3}\s)/g, "$1\n\n$2");

  return result;
}
