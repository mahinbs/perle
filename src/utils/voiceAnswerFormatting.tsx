import React from "react";
import {
  MarkdownTable,
  isMarkdownTableRow,
  isMarkdownTableSeparator,
  parseMarkdownTableBlock,
} from "./markdownTable";

/**
 * Format voice-overlay answer text: paragraphs, lists, headings, and markdown tables.
 */
export function formatVoiceAnswerText(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let currentList: Array<{ bullet: string; content: string }> = [];
  let inList = false;
  let lineIndex = 0;

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
              <span
                style={{
                  flexShrink: 0,
                  color: "var(--accent)",
                  fontWeight: 600,
                }}
              >
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

  while (lineIndex < lines.length) {
    const trimmed = lines[lineIndex].trim();

    if (!trimmed) {
      if (inList) flushList();
      else flushParagraph();
      lineIndex += 1;
      continue;
    }

    if (isMarkdownTableSeparator(trimmed)) {
      lineIndex += 1;
      continue;
    }

    const tableBlock = parseMarkdownTableBlock(lines, lineIndex);
    if (tableBlock) {
      flushParagraph();
      flushList();
      if (tableBlock.title) {
        result.push(
          <h3
            key={`table-title-${result.length}`}
            style={{
              fontSize: "var(--font-lg)",
              fontWeight: 600,
              marginTop: result.length > 0 ? 24 : 0,
              marginBottom: 12,
              color: "var(--text)",
            }}
          >
            {tableBlock.title}
          </h3>
        );
      }
      result.push(
        <MarkdownTable
          key={`table-${result.length}`}
          tableKey={`table-${result.length}`}
          headerCells={tableBlock.headerCells}
          bodyRows={tableBlock.bodyRows}
        />
      );
      lineIndex = tableBlock.nextLineIndex;
      continue;
    }

    if (isMarkdownTableRow(trimmed)) {
      lineIndex += 1;
      continue;
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
      lineIndex += 1;
      continue;
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
      lineIndex += 1;
      continue;
    }

    if (inList) flushList();
    currentParagraph.push(trimmed);
    lineIndex += 1;
  }

  if (inList) flushList();
  else flushParagraph();

  return result.length > 0 ? <>{result}</> : text;
}
