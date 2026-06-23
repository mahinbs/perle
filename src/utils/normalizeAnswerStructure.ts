/**
 * Fix model output that mashes headings and bullets onto one line.
 * Fast string passes only — safe to run on every streaming chunk.
 */

const TABLE_BLOCK_RE =
  /(?:^|\n)((?:\|[^\n]+\|\n)(?:\|[-:\s|]+\|\n)(?:\|[^\n]+\|\n?)+)/gm;

const TABLE_PLACEHOLDER = (i: number) => `\n<<<SYNTTABLE${i}>>>\n`;

/** Emoji cluster at line/start (pictographic + optional VS-16 / ZWJ). */
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

/**
 * Turn compressed LLM output into line-based structure the AnswerCard renderer expects.
 */
export function normalizeInlineAnswerStructure(text: string): string {
  if (!text) return text;

  let working = text.replace(/\r\n/g, "\n");
  const { body, tables } = protectTables(working);
  working = body;

  // "Section:• item" → heading line + bullet line
  working = working.replace(/:\s*•\s+/g, ":\n• ");

  // Inline bullets after sentence punctuation
  working = working.replace(/([.!?])\s*•\s+/g, "$1\n• ");

  // Bullets glued to prior word: "targets.•" or "word • Next"
  working = working.replace(/([^\n•|])\s*•\s+(?=[A-Z0-9"(])/g, "$1\n• ");

  // Numbered steps mid-paragraph: "...end. 1. First step"
  working = working.replace(/([.!?])\s+(\d{1,2})\.\s+(?=[A-Z])/g, "$1\n$2. ");

  // Dash bullets after sentence end
  working = working.replace(/([.!?])\s+-\s+(?=[A-Z])/g, "$1\n- ");

  // Nested sub-bullets glued to parent bullet
  working = working.replace(/(•[^\n]+?)\s{2,}-\s+/g, "$1\n  - ");

  // Emoji section headers mid-sentence: "...ended.📰 Economy..."
  working = working.replace(
    /([.!?])\s*([\p{Extended_Pictographic}](?:\uFE0F|‍[\p{Extended_Pictographic}])*)/gu,
    "$1\n$2"
  );

  // Emoji heading after lowercase letter (rare glue): "updates.📰" without punct
  working = working.replace(
    /([a-z0-9])\s*([\p{Extended_Pictographic}](?:\uFE0F|‍[\p{Extended_Pictographic}])*[^\n]{0,120}:)/gu,
    "$1\n$2"
  );

  // Blank line before emoji/colon headings for visual section break
  working = working.replace(
    new RegExp(
      `([^\\n])\\n((?:${EMOJI_CLUSTER.source})[^\\n]{0,120}:)`,
      "gu"
    ),
    "$1\n\n$2"
  );

  // Colon-terminated headings without leading emoji (ALL CAPS style sections)
  working = working.replace(
    /([.!?])\s+([A-Z][A-Za-z0-9 ,&/()-]{4,70}:)\s*(?=[A-Z•])/g,
    "$1\n\n$2\n"
  );

  working = restoreTables(working, tables);
  working = working.replace(/\n{3,}/g, "\n\n");
  return working.trim();
}
