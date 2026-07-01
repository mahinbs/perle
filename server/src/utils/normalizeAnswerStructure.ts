/**
 * Fix model output that mashes headings and bullets onto one line.
 * Mirror of src/utils/normalizeAnswerStructure.ts (keep in sync).
 */

const TABLE_BLOCK_RE =
  /(?:^|\n)((?:\|[^\n]+\|\n)(?:\|[-:\s|]+\|\n)(?:\|[^\n]+\|\n?)+)/gm;

const TABLE_PLACEHOLDER = (i: number) => `\n<<<SYNTTABLE${i}>>>\n`;

const EMOJI_CLUSTER =
  /[\p{Extended_Pictographic}](?:\uFE0F|‍[\p{Extended_Pictographic}])*/u;

function protectTables(text: string): { body: string; tables: string[] } {
  const tables: string[] = [];
  const body = text.replace(TABLE_BLOCK_RE, (match) => {
    const idx = tables.length;
    tables.push(match.trim());
    return TABLE_PLACEHOLDER(idx);
  });
  return { body, tables };
}

function restoreTables(text: string, tables: string[]): string {
  let out = text;
  tables.forEach((table, idx) => {
    out = out.replace(TABLE_PLACEHOLDER(idx), table);
  });
  return out;
}

export function normalizeInlineAnswerStructure(text: string): string {
  if (!text) return text;

  let working = text.replace(/\r\n/g, '\n');
  const { body, tables } = protectTables(working);
  working = body;

  working = working.replace(/:\s*•\s+/g, ':\n• ');
  working = working.replace(/([.!?])\s*•\s+/g, '$1\n• ');
  working = working.replace(/([^\n•|])\s*•\s+(?=[A-Z0-9"(])/g, '$1\n• ');
  working = working.replace(/([.!?])\s+(\d{1,2})\.\s+(?=[A-Z])/g, '$1\n$2. ');
  working = working.replace(/([.!?])\s+-\s+(?=[A-Z])/g, '$1\n- ');
  working = working.replace(/(•[^\n]+?)\s{2,}-\s+/g, '$1\n  - ');
  working = working.replace(
    /([.!?])\s*([\p{Extended_Pictographic}](?:\uFE0F|‍[\p{Extended_Pictographic}])*)/gu,
    '$1\n$2'
  );
  working = working.replace(
    /([a-z0-9])\s*([\p{Extended_Pictographic}](?:\uFE0F|‍[\p{Extended_Pictographic}])*[^\n]{0,120}:)/gu,
    '$1\n$2'
  );
  working = working.replace(
    new RegExp(
      `([^\\n])\\n((?:${EMOJI_CLUSTER.source})[^\\n]{0,120}:)`,
      'gu'
    ),
    '$1\n\n$2'
  );
  working = working.replace(
    /([.!?])\s+([A-Z][A-Za-z0-9 ,&/()-]{4,70}:)\s*(?=[A-Z•])/g,
    '$1\n\n$2\n'
  );

  working = restoreTables(working, tables);
  working = working.replace(/\n{3,}/g, '\n\n');
  return working.trim();
}
