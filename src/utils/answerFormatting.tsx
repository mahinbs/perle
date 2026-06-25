import React from "react";
import type { Source } from "../types";
import { normalizeInlineAnswerStructure } from "./normalizeAnswerStructure";

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
// Walk consecutive pipe-row runs (separated only by blank/whitespace lines)
// and rebuild each as ONE table with a single separator row. Models
// (Perplexity in particular) routinely emit each {header,sep,row} triplet
// as a separate mini-table — this merges them into the single logical
// table the user expects.
function mergePerRowMiniTables(text: string): string {
  const isPipeRow = (s: string) =>
    /^\s*\|.*\|\s*$/.test(s) && s.trim().length > 1;
  const isSepRow = (s: string) =>
    /^\s*\|[\s\-:|]+\|\s*$/.test(s) && /-/.test(s);
  const isBlank = (s: string) => s.trim().length === 0;

  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isPipeRow(lines[i])) {
      out.push(lines[i]);
      i++;
      continue;
    }
    // Collect a "run": consecutive pipe rows, optionally separated by
    // blank lines (which we discard).
    const run: string[] = [];
    while (i < lines.length) {
      if (isPipeRow(lines[i])) {
        run.push(lines[i]);
        i++;
        continue;
      }
      // Allow blank lines to bridge two pipe-row clusters. Peek ahead
      // to see if the next non-blank line is another pipe row.
      if (isBlank(lines[i])) {
        let k = i + 1;
        while (k < lines.length && isBlank(lines[k])) k++;
        if (k < lines.length && isPipeRow(lines[k])) {
          i = k;
          continue;
        }
      }
      break;
    }
    // Identify header (first non-separator row), drop all separators,
    // keep every other row as a data row.
    let headerIdx = 0;
    while (headerIdx < run.length && isSepRow(run[headerIdx])) headerIdx++;
    const header = run[headerIdx];
    if (!header) continue;
    const dataRows: string[] = [];
    for (let j = 0; j < run.length; j++) {
      if (j === headerIdx) continue;
      if (isSepRow(run[j])) continue;
      dataRows.push(run[j]);
    }
    const colCount = (header.match(/\|/g)?.length ?? 1) - 1;
    const sep =
      colCount >= 1 ? "|" + " --- |".repeat(colCount) : "|---|";
    out.push(header);
    out.push(sep);
    for (const d of dataRows) out.push(d);
  }
  return out.join("\n");
}

export function enhanceDocumentStructure(text: string): string {
  if (!text) return text;

  // Run table merge FIRST so the downstream regexes see one cohesive
  // table rather than a stream of mini-tables.
  let result = mergePerRowMiniTables(text);

  // Split "Emoji Heading•first bullet content" where the model glued the
  // first bullet to the heading with no newline. Pattern: emoji + 3–80
  // chars of heading text + `•` + bullet content → heading on its own
  // line, blank line, then `• ` bullet on its own line. Bullet char is
  // intentionally NOT included in the captured heading so we don't pull
  // legitimate bullet runs apart mid-list.
  result = result.replace(
    /([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][^\n•]{3,80}?)[ \t]*•[ \t]*/gu,
    "$1\n\n• ",
  );

  result = normalizeInlineAnswerStructure(result);

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

  // CRITICAL: ensure a blank line before the FIRST markdown table row of
  // a table (i.e. a pipe row that follows a NON-pipe, NON-blank line).
  // Models sometimes emit:
  //     🔬 Best Medicines for Impetigo (June 2026):
  //     | Name | Manufacturer | ...
  // with no blank line, which makes the heading get absorbed as the first
  // cell of the header row. Inserting a blank line teaches the parser those
  // are two separate blocks.
  //
  // CRUCIAL — we exclude `|` from the preceding-char class so we DON'T
  // insert a blank line BETWEEN consecutive pipe rows. Inserting blanks
  // mid-table fragments one table into many tiny ones (the bug the user
  // kept seeing as "table not together"). Tables stay as one cohesive
  // block; only the FIRST row gets the blank-line gap before it.
  result = result.replace(/([^\n|])\n(\|[^\n]*\|)/g, "$1\n\n$2");

  return result;
}
