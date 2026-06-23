import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AnswerChunk, Source, Mode, UploadedFile } from "../types";
import { SourcesPill } from "./SourcesPill";
import {
  AnswerBulletDot,
  isColonHeading,
  isSectionDivider,
  normalizeCitationText,
  parseMarkdownHeading,
  renderAnswerHeading,
  renderInlineFormatted,
  renderLeadBoldContent,
  enhanceDocumentStructure,
  stripHeadingEmojis,
} from "../utils/answerFormatting";

import { copyToClipboard, shareContent } from "../utils/helpers";
import { sanitizeForSpeech } from "../utils/voiceText";
import { useToast } from "../contexts/ToastContext";

import {
  FaVolumeUp,
  FaStop,
  FaBookmark,
  FaShare,
  FaClipboard,
  FaCheck,
  FaDownload,
} from "react-icons/fa";
import syntraGif from "../assets/gif/syntraiq.gif";

type ModeType = Mode;

function splitTableCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isMarkdownTableRow(line: string): boolean {
  if (!line.includes("|")) return false;
  return splitTableCells(line).filter(Boolean).length >= 2;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  if (cells.length < 2) return false;
  return cells.every(
    (cell) => cell === "" || /^:?-{3,}:?$/.test(cell) || /^-+$/.test(cell)
  );
}

function hasMarkdownTable(text: string): boolean {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!isMarkdownTableRow(lines[i].trim())) continue;
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (isMarkdownTableSeparator(next) || isMarkdownTableRow(next)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Hide raw markdown syntax during streaming so the user never sees half-formed
 * `| Feature | Apple |` rows or a lone `|---|---|` separator while typing.
 *   - A markdown TABLE in progress is replaced with a brief "Building table…"
 *     placeholder until the renderer takes over on completion.
 *   - Section headings keep their emoji + label (no leading "##").
 *   - Loose pipes mid-line get smoothed.
 */
function isStreamTableSeparator(line: string): boolean {
  const t = line.trim();
  return /^\|?\s*[-:|\s]+\|?\s*$/.test(t) && t.includes("|") && /-{2,}/.test(t);
}

function isStreamTableRowComplete(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("|") &&
    t.endsWith("|") &&
    t.split("|").filter((s) => s.trim().length > 0).length >= 1
  );
}

function isStreamTableRowPartial(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && !t.endsWith("|") && t.length > 1;
}

function splitStreamTableCells(line: string): string[] {
  const t = line.trim();
  // Remove leading + trailing pipe, then split
  const inner = t.startsWith("|") ? t.slice(1) : t;
  const trimmed = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  return trimmed.split("|").map((c) => c.trim());
}

/**
 * Render streaming text as a sequence of React nodes:
 *   - Plain text segments are rendered as <span> with pre-wrap whitespace
 *   - Markdown tables are rendered as REAL HTML <table>s that grow live —
 *     complete rows appear immediately, the trailing partial row is hidden
 *     (so the user sees rows fill in smoothly like ChatGPT/Gemini)
 */
function renderStreamingContent(text: string): React.ReactNode[] {
  if (!text) return [];
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  let textBuffer: string[] = [];
  let tableLines: string[] = [];
  let mode: "text" | "table" = "text";

  const flushText = () => {
    if (textBuffer.length === 0) return;
    const txt = textBuffer.join("\n").replace(/^#{1,6}\s+/gm, "");
    if (txt.length > 0) {
      nodes.push(
        <span
          key={`stxt-${nodes.length}`}
          style={{ whiteSpace: "pre-wrap" }}
        >
          {txt}
        </span>
      );
    }
    textBuffer = [];
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    // Parse the buffered table lines: skip separators + partial trailing row
    const completeRows: string[][] = [];
    for (const ln of tableLines) {
      if (isStreamTableSeparator(ln)) continue;
      if (isStreamTableRowComplete(ln)) {
        completeRows.push(splitStreamTableCells(ln));
      }
      // Partial trailing rows are dropped — they'll appear in a later flush.
    }
    if (completeRows.length >= 1) {
      const header = completeRows[0];
      const body = completeRows.slice(1);
      nodes.push(
        <div
          key={`stbl-${nodes.length}`}
          className="answer-table-wrap"
          style={{
            marginTop: 12,
            marginBottom: 12,
            overflowX: "auto",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <table
            className="answer-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--font-sm)",
            }}
          >
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th
                    key={`sth-${ci}`}
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontWeight: 600,
                      borderBottom: "1px solid var(--border)",
                      background: "var(--input-bg)",
                      color: "var(--text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={`str-${ri}`}>
                  {header.map((_, ci) => (
                    <td
                      key={`std-${ri}-${ci}`}
                      style={{
                        padding: "10px 12px",
                        borderBottom:
                          ri < body.length - 1
                            ? "1px solid var(--border)"
                            : undefined,
                        verticalAlign: "top",
                        lineHeight: 1.6,
                      }}
                    >
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    tableLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isAnyTableLine =
      isStreamTableSeparator(line) ||
      isStreamTableRowComplete(line) ||
      isStreamTableRowPartial(line);

    if (isAnyTableLine) {
      if (mode === "text") {
        flushText();
        mode = "table";
      }
      tableLines.push(line);
    } else {
      if (mode === "table") {
        flushTable();
        mode = "text";
      }
      textBuffer.push(line);
    }
  }
  if (mode === "table") flushTable();
  else flushText();

  return nodes;
}

function isComparisonContext(mode?: ModeType, query?: string): boolean {
  if (mode === "Compare") return true;
  const q = (query || "").toLowerCase();
  return /\b(vs\.?|versus|compare|comparison|difference between|differences between|better than|which is better)\b/.test(
    q
  );
}

function extractComparisonSubjects(query?: string): [string, string] | null {
  if (!query) return null;
  const vsMatch = query.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/i);
  if (vsMatch) {
    return [vsMatch[1].trim(), vsMatch[2].trim()];
  }
  const betweenMatch = query.match(
    /(?:compare|comparison|difference between)\s+(.+?)\s+and\s+(.+)/i
  );
  if (betweenMatch) {
    return [betweenMatch[1].trim(), betweenMatch[2].trim()];
  }
  return null;
}

function tryBuildComparisonTableFromText(text: string, query?: string): string {
  if (hasMarkdownTable(text)) return text;

  const subjects = extractComparisonSubjects(query);
  const subjectA = subjects?.[0] ?? "Option 1";
  const subjectB = subjects?.[1] ?? "Option 2";
  const rows: string[][] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const withoutBullet = line.replace(/^[•\-*]\s+/, "").replace(/^\d+\.\s+/, "");

    if (isMarkdownTableRow(withoutBullet)) {
      rows.push(splitTableCells(withoutBullet));
      continue;
    }

    const pipeParts = withoutBullet.includes("|")
      ? splitTableCells(withoutBullet)
      : null;
    if (pipeParts && pipeParts.length >= 3) {
      rows.push(pipeParts);
      continue;
    }

    const colonMatch = withoutBullet.match(/^([^:]{2,80}):\s*(.+)$/);
    if (colonMatch) {
      const aspect = colonMatch[1].trim();
      const value = colonMatch[2].trim();
      const splitBySubjects = value.split(/\s*[;|/]\s*/);
      if (splitBySubjects.length >= 2) {
        rows.push([aspect, splitBySubjects[0], splitBySubjects[1]]);
        continue;
      }
      const aMatch = value.match(
        new RegExp(`${subjectA}[:\\s-]+([^,;|]+)`, "i")
      );
      const bMatch = value.match(
        new RegExp(`${subjectB}[:\\s-]+([^,;|]+)`, "i")
      );
      if (aMatch && bMatch) {
        rows.push([aspect, aMatch[1].trim(), bMatch[1].trim()]);
      }
    }
  }

  if (rows.length < 2) return text;

  const firstRowLooksLikeHeader =
    rows[0].length >= 2 &&
    rows[0].every((cell) => cell.length < 40) &&
    rows[0].some((cell) =>
      /feature|aspect|criteria|category|point/i.test(cell)
    );

  let header: string[];
  let body: string[][];
  if (firstRowLooksLikeHeader && rows[0].length >= 3) {
    header = rows[0];
    body = rows.slice(1);
  } else if (rows[0].length >= 3) {
    header = rows[0];
    body = rows.slice(1);
  } else {
    header = ["Aspect", subjectA, subjectB];
    body = rows.map((row) =>
      row.length >= 3 ? row : [row[0], row[1] ?? "", row[2] ?? ""]
    );
  }

  const tableBlock = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

  const intro = text.split("\n").find((l) => l.trim() && !l.trim().startsWith("•")) ?? "";
  return intro ? `${intro}\n\n${tableBlock}` : tableBlock;
}

function preprocessAnswerText(
  text: string,
  mode?: ModeType,
  query?: string
): string {
  if (!text) return text;
  let processed = enhanceDocumentStructure(text);
  if (isComparisonContext(mode, query) && !hasMarkdownTable(processed)) {
    processed = tryBuildComparisonTableFromText(processed, query);
  }
  return processed;
}

interface AnswerCardProps {
  chunks: AnswerChunk[];
  sources: Source[];
  isLoading: boolean;
  mode?: Mode;
  query?: string;
  onQueryEdit?: (editedQuery: string) => void;
  onSearch?: (query: string, mode?: Mode) => void;
  attachments?: UploadedFile[];
  skipTypewriter?: boolean; // Skip typewriter effect for old conversations
  isStreamingAnswer?: boolean; // Progressive token display while SSE is active
  generatedMedia?: { type: 'image' | 'video'; url: string; prompt: string }; // Generated media to display
  hideSources?: boolean;
  suggestedQuestions?: string[];
}

/** Mobile chat query sizing — aligned with ChatGPT / Perplexity phone UI */
const QUERY_TEXT_STYLE: React.CSSProperties = {
  fontSize: "var(--font-md)",
  fontWeight: 500,
  lineHeight: 1.45,
  color: "var(--text)",
  wordBreak: "break-word",
  borderRadius: "8px",
};

export const AnswerCard: React.FC<AnswerCardProps> = ({
  chunks = [],
  sources,
  isLoading,
  mode,
  query,
  onQueryEdit,
  onSearch: _onSearch,
  attachments,
  skipTypewriter = false,
  isStreamingAnswer = false,
  generatedMedia,
  hideSources = false,
  suggestedQuestions = [],
}) => {
  const isVideoAttachment = (file: UploadedFile) =>
    Boolean(file.file?.type?.startsWith("video/"));
  const attachmentName = (file: UploadedFile) => file.file?.name ?? "attachment";
  const attachmentSizeKb = (file: UploadedFile) =>
    file.file?.size ? (file.file.size / 1024).toFixed(1) : "—";
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedQuery, setEditedQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [displayedTexts, setDisplayedTexts] = useState<Record<number, string>>(
    () => {
      // Pre-populate if skipTypewriter is already true at mount (wasStreamed / restored)
      if (skipTypewriter && chunks.length > 0) {
        const init: Record<number, string> = {};
        chunks.forEach((chunk, i) => { init[i] = chunk.text; });
        return init;
      }
      return {};
    }
  );
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const offcanvasRef = useRef<HTMLDivElement>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const typewriterTimeoutRef = useRef<any>(null);
  const answerContentRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Try to import KaTeX dynamically, but make it optional
  const [katex, setKatex] = useState<any>(null);
  useEffect(() => {
    // Dynamically import KaTeX
    import("katex")
      .then((katexModule) => {
        setKatex(katexModule.default);
        // Import CSS
        import("katex/dist/katex.min.css");
      })
      .catch(() => {
        console.warn("KaTeX not found. Mathematical formulas will be displayed as plain text. Install with: npm install katex");
      });
  }, []);

  // Check for speech synthesis support
  useEffect(() => {
    const hasSupport = "speechSynthesis" in window && typeof window.speechSynthesis !== "undefined";
    console.log('🔊 Speech synthesis support check:', {
      inWindow: "speechSynthesis" in window,
      typeofCheck: typeof window.speechSynthesis,
      hasSupport
    });
    setSpeechSupported(hasSupport);
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

  // Sync visible text before paint (prevents one-frame full-answer flash).
  useLayoutEffect(() => {
    if (isLoading || chunks.length === 0) {
      setDisplayedTexts({});
      setIsTypingComplete(false);
      return;
    }

    if (isStreamingAnswer) {
      setIsTypingComplete(false);
      return;
    }

    if (skipTypewriter) {
      const allTexts: Record<number, string> = {};
      chunks.forEach((chunk, index) => {
        allTexts[index] = chunk.text;
      });
      setDisplayedTexts(allTexts);
      setIsTypingComplete(true);
      return;
    }

    setDisplayedTexts({});
    setIsTypingComplete(false);
  }, [chunks, isLoading, skipTypewriter, isStreamingAnswer]);

  // Typewriter effect for answer chunks (non-streamed responses only).
  useEffect(() => {
    if (isLoading || chunks.length === 0 || skipTypewriter || isStreamingAnswer) {
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
        typewriterTimeoutRef.current = null;
      }
      return;
    }

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
        setIsTypingComplete(true);
        return;
      }

      const currentChunk = chunks[currentChunkIndex];
      const currentText = currentChunk.text;

      if (currentCharIndex < currentText.length) {
        setDisplayedTexts((prev) => ({
          ...prev,
          [currentChunkIndex]: currentText.substring(0, currentCharIndex + 1),
        }));
        currentCharIndex++;
        typewriterTimeoutRef.current = window.setTimeout(typeNextChar, typingSpeed);
      } else {
        currentChunkIndex++;
        currentCharIndex = 0;
        typewriterTimeoutRef.current = window.setTimeout(typeNextChar, typingSpeed);
      }
    };

    typewriterTimeoutRef.current = window.setTimeout(typeNextChar, 100);

    return () => {
      if (typewriterTimeoutRef.current) {
        clearTimeout(typewriterTimeoutRef.current);
        typewriterTimeoutRef.current = null;
      }
    };
  }, [chunks, isLoading, skipTypewriter, isStreamingAnswer]);

  // Auto-scroll to follow typewriter effect — disabled
  // (Previously scrolled to last chunk during typing and to bottom when complete)

  // Auto-speak is now handled by SearchBar directly to avoid multi-card race conditions.
  // AnswerCard no longer consumes syntraiq-speak-next-answer.

  // Helper function to render LaTeX formulas with full mathematical symbol support
  const renderWithMath = (text: string): React.ReactNode[] => {
    if (!katex) {
      // KaTeX not available, return text as-is
      return [text];
    }

    const parts: React.ReactNode[] = [];
    // Match both inline and block LaTeX in multiple formats:
    // \(...\) and $...$ for inline
    // \[...\] and $$...$$ for block
    // Also match formulas in code blocks that look like math
    const mathRegex = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$|```math\s*([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = mathRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        if (beforeText) {
          parts.push(beforeText);
        }
      }

      // match[1] = \(...\) inline
      // match[2] = \[...\] block
      // match[3] = $$...$$ block
      // match[4] = $...$ inline
      // match[5] = ```math...``` block
      const isBlock = !!(match[2] || match[3] || match[5]);
      const formula = match[1] || match[2] || match[3] || match[4] || match[5];

      if (formula) {
        try {
          const html = katex.renderToString(formula.trim(), {
            throwOnError: false,
            displayMode: isBlock,
            strict: false, // Allow more flexible parsing
            trust: true, // Allow certain commands
            macros: {
              // Add common macro definitions for better compatibility
              "\\RR": "\\mathbb{R}",
              "\\NN": "\\mathbb{N}",
              "\\ZZ": "\\mathbb{Z}",
              "\\QQ": "\\mathbb{Q}",
              "\\CC": "\\mathbb{C}",
            }
          });
          if (isBlock) {
            parts.push(
              <div
                key={`math-${key++}`}
                dangerouslySetInnerHTML={{ __html: html }}
                className="katex-display"
                style={{
                  margin: '20px 0',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  textAlign: 'center',
                  fontSize: '1.15em',
                  padding: '12px 0',
                  lineHeight: '1.6'
                }}
              />
            );
          } else {
            parts.push(
              <span
                key={`math-${key++}`}
                dangerouslySetInnerHTML={{ __html: html }}
                className="katex"
                style={{
                  display: 'inline-block',
                  margin: '0 3px',
                  verticalAlign: 'middle',
                  fontSize: '1.05em'
                }}
              />
            );
          }
        } catch (error) {
          // Fallback to plain text if rendering fails
          console.warn('KaTeX rendering error:', error, 'Formula:', formula);
          parts.push(match[0]);
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      if (remainingText) {
        parts.push(remainingText);
      }
    }

    return parts.length > 0 ? parts : [text];
  };

  const renderMarkdownTable = (
    headerCells: string[],
    bodyRows: string[][],
    key: string
  ) => (
    <div
      key={key}
      className="answer-table-wrap"
      style={{
        marginTop: 16,
        marginBottom: 16,
        overflowX: "auto",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
      }}
    >
      <table
        className="answer-table"
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--font-sm)",
        }}
      >
        <thead>
          <tr>
            {headerCells.map((cell, cellIndex) => (
              <th
                key={`th-${cellIndex}`}
                style={{
                  padding: "10px 12px",
                  textAlign: "left",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--border)",
                  background: "var(--input-bg)",
                  color: "var(--text)",
                  whiteSpace: "nowrap",
                }}
              >
                {renderWithMath(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`tr-${rowIndex}`}>
              {headerCells.map((_, cellIndex) => (
                <td
                  key={`td-${rowIndex}-${cellIndex}`}
                  style={{
                    padding: "10px 12px",
                    borderBottom:
                      rowIndex < bodyRows.length - 1
                        ? "1px solid var(--border)"
                        : undefined,
                    verticalAlign: "top",
                    lineHeight: 1.6,
                  }}
                >
                  {renderWithMath(row[cellIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Format text with markdown-like formatting
  const renderTextContent = (text: string): React.ReactNode => {
    // Inline citation markers ([1], [2, 3] …) are removed entirely — sources are
    // shown only as logos at the bottom. Tidy up spacing left behind.
    const normalized = normalizeCitationText(text)
      .replace(/\s*\[\d[\d,\s]*\]/g, "")
      .replace(/\s+([.,;:!?)])/g, "$1")
      .replace(/[ \t]{2,}/g, " ");
    const hasRichInline =
      /\*\*[^*]+\*\*/.test(normalized) ||
      /(?<!\*)\*[^*]+\*(?!\*)/.test(normalized);

    if (!hasRichInline) {
      return <>{renderWithMath(normalized)}</>;
    }

    return renderInlineFormatted(
      normalized,
      sources,
      renderWithMath,
      () => null
    );
  };

  const formatText = (
    text: string,
    appendDot?: boolean,
    streaming?: boolean
  ): React.ReactNode => {
    if (!text) return null;

    const processedText = streaming
      ? text
      : preprocessAnswerText(text, mode, query);
    const lines = processedText.split("\n");
    const result: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let currentList: Array<{ bullet: string; content: string }> = [];
    let inList = false;

    const flushParagraph = (isLast = false) => {
      if (currentParagraph.length > 0) {
        const paraText = currentParagraph.join(' ').trim();
        if (paraText) {
          const mathRendered = renderTextContent(paraText);
          result.push(
            <p
              key={`para-${result.length}`}
              className="answer-paragraph"
              style={{
                marginTop: result.length > 0 ? 14 : 0,
                marginBottom: 14,
                lineHeight: 1.75,
                textAlign: "left",
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
              paddingLeft: 0,
              listStyle: "none",
            }}
          >
            {currentList.map((item, idx) => {
              const isLastItem =
                isLast && appendDot && idx === currentList.length - 1;
              const isNumbered = /^\d+\.$/.test(item.bullet);
              return (
                <li
                  key={`li-${idx}`}
                  style={{
                    marginBottom: 10,
                    lineHeight: 1.7,
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  {isNumbered ? (
                    <span
                      style={{
                        flexShrink: 0,
                        color: "var(--accent)",
                        fontWeight: 700,
                        minWidth: 20,
                      }}
                    >
                      {item.bullet}
                    </span>
                  ) : item.bullet === "sub" ? (
                    <span
                      style={{
                        flexShrink: 0,
                        color: "var(--sub)",
                        marginTop: 2,
                        minWidth: 12,
                      }}
                    >
                      –
                    </span>
                  ) : (
                    <AnswerBulletDot />
                  )}
                  <span style={{ flex: 1 }}>
                    {renderLeadBoldContent(item.content, renderTextContent)}
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

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const rawLine = lines[lineIndex];
      const trimmed = rawLine.trim();

      if (isMarkdownTableRow(trimmed)) {
        flushParagraph(false);
        flushList(false);

        const parsedRows: string[][] = [];
        let scanIndex = lineIndex;
        while (scanIndex < lines.length) {
          const rowLine = lines[scanIndex].trim();
          if (!rowLine) break;
          if (isMarkdownTableSeparator(rowLine)) {
            scanIndex += 1;
            continue;
          }
          if (!isMarkdownTableRow(rowLine)) break;
          parsedRows.push(splitTableCells(rowLine));
          scanIndex += 1;
        }

        if (parsedRows.length >= 1) {
          const headerCells = parsedRows[0];
          const bodyRows = parsedRows.slice(1);
          // Defensive: empty-body tables (model output only headers, or
          // streamed response was truncated mid-table) are hidden entirely.
          // Rendering an empty <table> or stranded header text looks broken;
          // skipping it lets the surrounding answer (intro, headings, related
          // questions) flow naturally.
          if (bodyRows.length === 0) {
            lineIndex = scanIndex - 1;
            continue;
          }
          result.push(
            renderMarkdownTable(
              headerCells,
              bodyRows,
              `table-${result.length}`
            )
          );
          lineIndex = scanIndex - 1;
          continue;
        }
      }

      // Empty line - flush current context
      if (!trimmed) {
        if (inList) {
          flushList(false);
        } else {
          flushParagraph(false);
        }
        continue;
      }

      if (isSectionDivider(trimmed)) {
        flushParagraph(false);
        flushList(false);
        result.push(
          <hr
            key={`divider-${result.length}`}
            style={{
              border: "none",
              borderTop: "1px solid var(--border)",
              margin: "20px 0",
            }}
          />
        );
        continue;
      }

      const markdownHeading = parseMarkdownHeading(trimmed);
      if (markdownHeading) {
        flushParagraph(false);
        flushList(false);
        result.push(
          renderAnswerHeading(
            markdownHeading.level,
            markdownHeading.text,
            `heading-${result.length}`,
            renderTextContent(markdownHeading.text)
          )
        );
        continue;
      }

      // Legacy colon headings (e.g. "Defining AI:")
      if (isColonHeading(trimmed)) {
        flushParagraph(false);
        flushList(false);
        const headingText = stripHeadingEmojis(trimmed.replace(/:+$/, "").trim());
        result.push(
          renderAnswerHeading(
            2,
            headingText,
            `heading-${result.length}`,
            renderTextContent(headingText)
          )
        );
        continue;
      }

      const subBulletMatch = rawLine.match(/^\s{2,}[-•]\s+(.+)$/);
      if (subBulletMatch) {
        flushParagraph(false);
        inList = true;
        currentList.push({ bullet: "sub", content: subBulletMatch[1].trim() });
        continue;
      }

      // Check if it's a bullet point
      if (
        trimmed.startsWith("•") ||
        trimmed.startsWith("-") ||
        trimmed.startsWith("*") ||
        trimmed.match(/^\d+\./)
      ) {
        flushParagraph(false);
        inList = true;

        let bullet = "•";
        let content = trimmed;

        if (trimmed.startsWith("•")) {
          content = trimmed.substring(1).trim();
        } else if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
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
        continue;
      }

      // Regular text line
      if (inList) {
        flushList(false);
      }
      currentParagraph.push(trimmed);
    }

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
      localStorage.getItem("syntraiq-bookmarks") || "[]"
    );
    const bookmark = {
      id: Date.now().toString(),
      chunks,
      sources,
      timestamp: Date.now(),
    };

    bookmarks.unshift(bookmark);
    localStorage.setItem(
      "syntraiq-bookmarks",
      JSON.stringify(bookmarks.slice(0, 50))
    );

    showToast({
      message: "Answer bookmarked!",
      type: "success",
      duration: 2000,
    });
  };

  const startVoiceOutput = useCallback(() => {
    console.log('🎤 startVoiceOutput called, speechSupported:', speechSupported, 'isSpeaking:', isSpeaking, 'chunks:', chunks.length);

    // Clear the trigger flag if it exists
    localStorage.removeItem("syntraiq-trigger-voice-output");

    const rawAnswerText = chunks.map((c) => c.text).join(" ");
    // Strip citation markers [1], markdown noise, URLs, emoji, question marks,
    // table pipes etc. so the synth voice doesn't read them literally.
    const answerText = sanitizeForSpeech(rawAnswerText);
    console.log('🎤 Answer text length:', answerText.length);

    // Even if speech is not supported, show the text
    if (!speechSupported) {
      console.log("⚠️ Text-to-speech is not supported, but showing text anyway");

      // Display full text immediately
      localStorage.setItem("syntraiq-current-answer-text", answerText);

      // Clear after a delay
      setTimeout(() => {
        const voiceSessionActive = localStorage.getItem("syntraiq-voice-session-active") === "1";
        if (!voiceSessionActive) {
          localStorage.removeItem("syntraiq-current-answer-text");
          localStorage.setItem("syntraiq-voice-output-complete", "1");
          setTimeout(() => {
            localStorage.removeItem("syntraiq-voice-output-complete");
          }, 100);
        }
      }, 5000); // Show for 5 seconds

      return;
    }

    if (isSpeaking) {
      stopVoiceOutput();
      return;
    }

    // Stop any existing speech
    window.speechSynthesis.cancel();

    // Split text into words for progressive display (preserve spaces)
    const words = answerText.split(/(\s+)/).filter((w) => w.length > 0);
    let currentWordIndex = 0;
    let speechStartTime = 0;
    let fallbackInterval: any = null;
    let lastBoundaryUpdate = 0;
    let resumeKeepAlive: ReturnType<typeof setInterval> | null = null;

    // Initialize with empty text
    localStorage.setItem("syntraiq-current-answer-text", "");
    localStorage.setItem("syntraiq-current-word-index", "0");
    localStorage.setItem("syntraiq-speech-rate", "0.9");

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
        localStorage.setItem("syntraiq-current-answer-text", displayedText);
        localStorage.setItem("syntraiq-current-word-index", "0");
      }

      // Chrome pauses speechSynthesis silently after ~15s. Resume every 10s to prevent this.
      resumeKeepAlive = setInterval(() => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        } catch { /* ignore */ }
      }, 10000);

      // Fallback timer for mobile devices where onboundary may not fire reliably
      // Estimate words per second: average English is ~150 words/min = 2.5 words/sec
      // With rate 0.9, that's ~2.25 words/sec, so ~444ms per word
      const estimatedMsPerWord = 450 / utterance.rate;

      fallbackInterval = window.setInterval(() => {
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
          localStorage.setItem("syntraiq-current-answer-text", displayedText);
          localStorage.setItem(
            "syntraiq-current-word-index",
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
          localStorage.setItem("syntraiq-current-answer-text", displayedText);
          localStorage.setItem(
            "syntraiq-current-word-index",
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
      if (resumeKeepAlive) {
        clearInterval(resumeKeepAlive);
        resumeKeepAlive = null;
      }
      // Show full text when speech ends
      localStorage.setItem("syntraiq-current-answer-text", answerText);
      // Keep full answer text visible while voice session is active.
      const voiceSessionActive = localStorage.getItem("syntraiq-voice-session-active") === "1";
      if (voiceSessionActive) {
        // Continue hands-free loop: once answer is spoken, go back to listening.
        localStorage.setItem("syntraiq-auto-listen-next", "1");
      }
      if (!voiceSessionActive) {
        setTimeout(() => {
          localStorage.removeItem("syntraiq-current-answer-text");
          localStorage.removeItem("syntraiq-current-word-index");
          // Signal that voice output has completed
          localStorage.setItem("syntraiq-voice-output-complete", "1");
          // Clean up this flag after a moment
          setTimeout(() => {
            localStorage.removeItem("syntraiq-voice-output-complete");
          }, 100);
        }, 2000);
      }
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event.error);
      setIsSpeaking(false);
      // Clear fallback interval
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      if (resumeKeepAlive) {
        clearInterval(resumeKeepAlive);
        resumeKeepAlive = null;
      }
      // Show full text on error
      localStorage.setItem("syntraiq-current-answer-text", answerText);
    };

    synthesisRef.current = utterance;
    // Small delay after cancel() so Chrome doesn't silently drop the new utterance
    window.setTimeout(() => {
      window.speechSynthesis.speak(utterance);
      console.log('🎤 Speech synthesis started');
    }, 100);
  }, [chunks, speechSupported, isSpeaking, showToast]);

  const stopVoiceOutput = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    // Clear the stored text when speech is stopped
    localStorage.removeItem("syntraiq-current-answer-text");
    localStorage.removeItem("syntraiq-current-word-index");
    // Note: fallbackInterval will be cleared in onend/onerror handlers
  };

  // Monitor for trigger flag and start voice output when ready
  useEffect(() => {
    const checkTrigger = () => {
      const shouldTrigger = localStorage.getItem("syntraiq-trigger-voice-output");
      if (shouldTrigger && chunks.length > 0 && !isLoading) {
        console.log('🎤 Trigger detected, starting voice output...');
        startVoiceOutput();
      }
    };

    // Check immediately
    checkTrigger();

    // Also check periodically in case we missed it
    const interval = setInterval(checkTrigger, 200);

    return () => clearInterval(interval);
  }, [chunks, isLoading, startVoiceOutput]);

  // Sources are now rendered via SourcesPill (collapsible pill), no auto-expand needed.

  if (isLoading) {
    return (
      <div className="" style={{ padding: 18 }}>
        {/* <div className="sub text-sm" style={{ marginBottom: 10 }}>
          Syntra<span className="text-[var(--accent)]">IQ</span>
        </div> */}
        {query && (
          <div
            className="flex flex-col items-end gap-3"
            style={{ marginBottom: 24 }}
          >
            {attachments && attachments.length > 0 && (
              <div className="flex gap-2 flex-wrap justify-end max-w-[90%]">
                {attachments.map((file) => (
                  <div
                    key={file.id}
                    style={{
                      position: "relative",
                      width: "clamp(60px, 20vw, 100px)",
                      height: "clamp(60px, 20vw, 100px)",
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {file.preview ? (
                      isVideoAttachment(file) ? (
                        <video
                          src={file.preview}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={file.preview}
                          alt="Attachment"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--input-bg)",
                          fontSize: "24px",
                        }}
                      >
                        📄
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div
              style={QUERY_TEXT_STYLE}
              className="glass-card !max-w-[calc(90%)] !px-4 !py-2"
            >
              {query}
            </div>
          </div>
        )}
        <div
          className="flex items-start gap-1"
          style={{ marginTop: query ? 8 : 0 }}
        >
          <div className="w-9 h-9 shrink-0">
            <img
              src={syntraGif}
              loading="eager"
              alt="IQ"
              className="rounded-full w-full h-full object-cover"
              style={{ display: "block" }}
            />
          </div>
          <div
            className="flex items-center justify-center"
            style={{ minHeight: 36, paddingRight: 8 }}
          >
            <p
              style={{
                fontSize: "var(--font-sm)",
                fontWeight: 500,
                color: "var(--sub)",
                margin: 0,
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              IQ is thinking
              <span className="thinking-dots" aria-hidden="true">.....</span>
            </p>
          </div>
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
    <div className="card !bg-transparent !border-none !shadow-none" style={{ padding: 5 }}>
      {/* Display the searched query prominently */}
      {query && (
        <div
          style={{
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex flex-col items-end gap-3">
            {attachments && attachments.length > 0 && (
              <div className="flex gap-2 flex-wrap justify-end max-w-[90%]">
                {attachments.map((file) => (
                  <div
                    key={file.id}
                    style={{
                      position: "relative",
                      width: "clamp(60px, 20vw, 100px)",
                      height: "clamp(60px, 20vw, 100px)",
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {file.preview ? (
                      isVideoAttachment(file) ? (
                        <video
                          src={file.preview}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={file.preview}
                          alt="Attachment"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--input-bg)",
                          fontSize: "24px",
                        }}
                      >
                        📄
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {generatedMedia && (
              <div className="w-full max-w-full">
                <div
                  style={{
                    borderRadius: 12,
                    overflow: "hidden",
                    width: "100%",
                    maxWidth: "100%",
                    border: "1px solid var(--border)",
                  }}
                >
                  {generatedMedia.type === "image" ? (
                    <img
                      src={generatedMedia.url}
                      alt={generatedMedia.prompt}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        height: "auto",
                        display: "block",
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <video
                      src={generatedMedia.url}
                      controls
                      playsInline
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        height: "auto",
                        display: "block",
                        objectFit: "contain",
                      }}
                    />
                  )}
                </div>
              </div>
            )}
            <div
              onClick={() => {
                if (onQueryEdit) {
                  setShowEditModal(true);
                }
              }}
              style={{
                cursor: onQueryEdit ? "pointer" : "default",
                transition: "background-color 0.2s ease",
              }}
              className="flex justify-end w-full"
              title={onQueryEdit ? "Click to edit query" : undefined}
            >
              <div
                style={QUERY_TEXT_STYLE}
                className="glass-card !max-w-[calc(90%)] !px-4 !py-2"
              >
                {query}
              </div>
            </div>
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
          {/* <div
            style={{
              fontSize: "var(--font-sm)",
              fontWeight: 500,
              color: "var(--sub)",
            }}
          >
            Syntra<span className="text-[var(--accent)]">IQ</span>
          </div> */}
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
              className="answer-content answer-document"
              style={{
                fontSize: "var(--font-md)",
                marginBottom: 12,
                color: "var(--text)",
              }}
            >
              {isStreamingAnswer ? (
                // Streaming render strategy: feed COMPLETED lines (everything
                // up to the last newline) into the same `formatText` pipeline
                // we use post-stream, so headings / bullets / bold appear in
                // their final styled form the moment the line finishes — no
                // visible "raw → formatted" snap at the end of streaming.
                // The actively-typing trailing line is rendered as plain
                // pre-wrap text so partial markdown (a `## ` waiting for its
                // word, an unbalanced `**`, a `|---|` table separator) never
                // flickers into half-styled form.
                //
                // Tables remain handled by renderStreamingContent for the
                // in-flight portion only — partial table rows look ugly when
                // styled mid-row, so we keep that buffer-then-render behaviour.
                (() => {
                  const text = chunk.text || "";
                  const lastNl = text.lastIndexOf("\n");
                  const completed = lastNl >= 0 ? text.slice(0, lastNl) : "";
                  const partial = lastNl >= 0 ? text.slice(lastNl + 1) : text;
                  const partialIsTableLike =
                    isStreamTableSeparator(partial) ||
                    isStreamTableRowComplete(partial) ||
                    isStreamTableRowPartial(partial);
                  // Only when the *currently-typing* line is part of a table
                  // do we hand the whole chunk to the buffered renderer —
                  // it already drops partial rows and shows complete ones.
                  // Completed tables sitting above the cursor go through
                  // formatText just fine (it has its own renderMarkdownTable).
                  if (partialIsTableLike) {
                    return (
                      <div
                        className="answer-streaming-text"
                        style={{ lineHeight: 1.75, wordBreak: "break-word" }}
                      >
                        {renderStreamingContent(chunk.text)}
                        {index === chunks.length - 1 && (
                          <span className="answer-streaming-cursor" aria-hidden />
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      className="answer-streaming-text"
                      style={{ lineHeight: 1.75, wordBreak: "break-word" }}
                    >
                      {completed && formatText(completed, false, true)}
                      {partial && (
                        <span style={{ whiteSpace: "pre-wrap" }}>
                          {partial.replace(/^#{1,6}\s+/, "")}
                        </span>
                      )}
                      {index === chunks.length - 1 && (
                        <span className="answer-streaming-cursor" aria-hidden />
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className={skipTypewriter ? "answer-formatted-fadein" : undefined}>
                  {formatText(
                    // Always fall back to chunk.text so there's never a blank frame
                    // when displayedTexts hasn't been populated yet (e.g. wasStreamed transition)
                    displayedTexts[index] !== undefined ? displayedTexts[index] : chunk.text,
                    isTypingComplete && index === chunks.length - 1
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              {/* Per-chunk source chips removed — sources show as a clean logo row below. */}
              <div style={{ flex: 1 }} />

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


      {suggestedQuestions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="sub text-sm" style={{ marginBottom: 8 }}>
            Related questions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {suggestedQuestions.slice(0, 3).map((question) => (
              <button
                key={question}
                className="glass-button !px-2 !py-0.5 rounded-sm"
                style={{ cursor: "pointer" }}
                onClick={() => _onSearch?.(question, mode)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sources — compact favicon-stack pill ("N sources"); tap to expand the list. */}
      {!hideSources && sources.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <SourcesPill sources={sources} />
        </div>
      )}


      {/* Uploaded Attachments Download Section */}
      {attachments && attachments.length > 0 && !isLoading && (
        <div>
          <div className="spacer-4" />
          <div
            style={{
              fontSize: "var(--font-md)",
              fontWeight: 500,
              marginBottom: 12,
              color: "var(--text)",
            }}
          >
            Uploaded Attachments
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {attachments.map((file) => {
              const canDownloadFile = file.file instanceof File;

              const handleDownload = () => {
                if (!canDownloadFile) {
                  if (file.preview) {
                    window.open(file.preview, "_blank");
                  }
                  return;
                }
                try {
                  const url = URL.createObjectURL(file.file);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = attachmentName(file);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  setTimeout(() => URL.revokeObjectURL(url), 100);

                  showToast({
                    message: `Downloaded ${attachmentName(file)}`,
                    type: "success",
                    duration: 2000,
                  });
                } catch (error) {
                  console.error("Failed to download file:", error);
                  showToast({
                    message: "Failed to download file",
                    type: "error",
                    duration: 2000,
                  });
                }
              };

              return (
                <div
                  key={file.id}
                  className="card"
                  style={{
                    padding: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    {file.preview && file.type === "image" ? (
                      <img
                        src={file.preview}
                        alt={attachmentName(file)}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          objectFit: "cover",
                          border: "1px solid var(--border)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--input-bg)",
                          border: "1px solid var(--border)",
                          fontSize: "20px",
                        }}
                      >
                        📄
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: "var(--font-sm)",
                          color: "var(--text)",
                          marginBottom: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {attachmentName(file)}
                      </div>
                      <div
                        className="sub text-xs"
                        style={{
                          color: "var(--text-secondary)",
                        }}
                      >
                        {attachmentSizeKb(file)} KB
                        {file.type && ` • ${file.type}`}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn-ghost"
                    onClick={handleDownload}
                    aria-label={`Download ${attachmentName(file)}`}
                    style={{
                      padding: "8px 12px",
                      fontSize: "var(--font-sm)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <FaDownload size={14} />
                    <span>Download</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* <div className="spacer-4" /> */}

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
                  _onSearch?.(`${query} ${action.text}`, action.mode);
                } else {
                  _onSearch?.(action.text, action.mode);
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
                  : "rgba(0, 0, 0, 0.38)",
                backdropFilter: isClosing ? "blur(0px)" : "blur(8px)",
                WebkitBackdropFilter: isClosing ? "blur(0px)" : "blur(8px)",
                zIndex: 9999,
                transition: "background-color 0.2s ease, backdrop-filter 0.2s ease",
              }}
              onClick={handleCloseModal}
            />

            {/* Offcanvas */}
            <div
              ref={offcanvasRef}
              className="glass-card"
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
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
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
                  className="glass-input dark:text-black"
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
