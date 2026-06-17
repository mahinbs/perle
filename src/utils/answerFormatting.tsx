import React from "react";
import type { Source } from "../types";

export function normalizeCitationText(text: string): string {
  return text.replace(/source\s*\((\d+)\)/gi, "[$1]");
}

/** Strip decorative emojis from headings — answers should stay clean and text-only. */
export function stripHeadingEmojis(text: string): string {
  return text
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "")
    .replace(/[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/u, "")
    .trim();
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

export function isColonHeading(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.endsWith(":") &&
    trimmed.length < 150 &&
    !trimmed.includes("•") &&
    !trimmed.match(/^[-•\d]/) &&
    !trimmed.startsWith("#")
  );
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
      fontSize: "1.42rem",
      fontWeight: 700,
      marginTop: 0,
      marginBottom: 14,
      lineHeight: 1.35,
      color: "var(--text)",
      letterSpacing: "-0.01em",
    },
    2: {
      fontSize: "1.15rem",
      fontWeight: 700,
      marginTop: 28,
      marginBottom: 12,
      lineHeight: 1.4,
      color: "var(--text)",
      paddingBottom: 8,
      borderBottom: "1px solid var(--border)",
    },
    3: {
      fontSize: "1.02rem",
      fontWeight: 600,
      marginTop: 20,
      marginBottom: 8,
      lineHeight: 1.4,
      color: "var(--text)",
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
