import React from "react";
import { isColonHeading, stripHeadingEmojis } from "./answerFormatting";

export function splitTableCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

export function isMarkdownTableRow(line: string): boolean {
  if (!line.includes("|")) return false;
  return splitTableCells(line).filter(Boolean).length >= 2;
}

export function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  if (cells.length < 2) return false;
  return cells.every(
    (cell) => cell === "" || /^:?-{3,}:?$/.test(cell) || /^-+$/.test(cell)
  );
}

/** If the model glued an emoji subheading into cell 0, peel it off. */
export function peelTableTitleFromHeaderRow(
  headerCells: string[]
): { title: string | null; headerCells: string[] } {
  if (headerCells.length < 2) return { title: null, headerCells };
  const first = headerCells[0].trim();
  if (!isColonHeading(first)) return { title: null, headerCells };
  const rest = headerCells.slice(1);
  if (rest.length < 2) return { title: null, headerCells };
  return {
    title: stripHeadingEmojis(first.replace(/:+$/, "").trim()),
    headerCells: rest,
  };
}

export type ParsedMarkdownTable = {
  title: string | null;
  headerCells: string[];
  bodyRows: string[][];
  nextLineIndex: number;
};

/** Parse a markdown table block starting at `startIndex`. */
export function parseMarkdownTableBlock(
  lines: string[],
  startIndex: number
): ParsedMarkdownTable | null {
  const first = lines[startIndex]?.trim() ?? "";
  if (!isMarkdownTableRow(first)) return null;

  const parsedRows: string[][] = [];
  let scanIndex = startIndex;

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

  if (parsedRows.length < 1) return null;

  let headerCells = parsedRows[0];
  const peeled = peelTableTitleFromHeaderRow(headerCells);
  if (peeled.title) headerCells = peeled.headerCells;
  const bodyRows = parsedRows.slice(1);
  if (bodyRows.length === 0) return null;

  return {
    title: peeled.title,
    headerCells,
    bodyRows,
    nextLineIndex: scanIndex,
  };
}

type MarkdownTableProps = {
  headerCells: string[];
  bodyRows: string[][];
  tableKey: string;
  renderCell?: (cell: string) => React.ReactNode;
};

export function MarkdownTable({
  headerCells,
  bodyRows,
  tableKey,
  renderCell = (cell) => cell,
}: MarkdownTableProps) {
  return (
    <div
      key={tableKey}
      className="answer-table-wrap"
      style={{
        marginTop: 16,
        marginBottom: 16,
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
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
                key={`${tableKey}-th-${cellIndex}`}
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
                {renderCell(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`${tableKey}-tr-${rowIndex}`}>
              {headerCells.map((_, cellIndex) => (
                <td
                  key={`${tableKey}-td-${rowIndex}-${cellIndex}`}
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
                  {renderCell(row[cellIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
