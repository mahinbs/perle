export interface AIFriendMemory {
  preferredName?: string | null;
  pronouns?: string | null;
  keyNouns: string[];
}

interface MemoryExtraction {
  preferredName?: string;
  pronouns?: string;
  nouns: string[];
}

const NOUN_STOPWORDS = new Set([
  'fine',
  'okay',
  'good',
  'bad',
  'happy',
  'sad',
  'tired',
  'stressed',
  'angry',
  'upset',
  'hungry',
  'bored',
  'ready',
  'here',
  'there',
]);

function cleanWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z-]/g, '').trim();
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function extractPronouns(text: string): string | undefined {
  const directPattern =
    /\b(?:my pronouns are|i use|use)\s+([a-z]+(?:\/[a-z]+){0,3}|[a-z]+\s+(?:and|&)\s+[a-z]+)\b/i;
  const match = text.match(directPattern);
  if (!match) return undefined;
  const raw = match[1].replace(/\s+(and|&)\s+/gi, '/');
  const normalized = raw
    .split('/')
    .map((p) => cleanWord(p))
    .filter(Boolean)
    .slice(0, 4);
  if (normalized.length === 0) return undefined;
  return normalized.join('/');
}

function extractPreferredName(text: string): string | undefined {
  const patterns = [
    /\b(?:call me|you can call me)\s+([A-Za-z][A-Za-z'-]{1,30})\b/i,
    /\b(?:my name is|i am named|i'm named)\s+([A-Za-z][A-Za-z'-]{1,30})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractKeyNouns(text: string): string[] {
  const nouns: string[] = [];
  const rolePatterns = [
    /\b(?:i am|i'm|im)\s+(?:an?\s+)?([a-z][a-z-]{2,30})\b/gi,
    /\b(?:i work as|working as)\s+(?:an?\s+)?([a-z][a-z-]{2,30})\b/gi,
    /\b(?:my role is|my job is)\s+(?:an?\s+)?([a-z][a-z-]{2,30})\b/gi,
    /\b(?:i study)\s+([a-z][a-z-]{2,30})\b/gi,
    /\b(?:i like|i love|i enjoy)\s+([a-z][a-z-]{2,30})\b/gi,
  ];

  for (const pattern of rolePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const noun = cleanWord(match[1]);
      if (!noun || NOUN_STOPWORDS.has(noun)) continue;
      nouns.push(noun);
    }
  }

  return dedupeStrings(nouns).slice(0, 8);
}

export function extractMemoryFromUserMessage(message: string): MemoryExtraction {
  return {
    preferredName: extractPreferredName(message),
    pronouns: extractPronouns(message),
    nouns: extractKeyNouns(message),
  };
}

export function mergeAIFriendMemory(
  existing: AIFriendMemory | null | undefined,
  extracted: MemoryExtraction
): AIFriendMemory {
  const existingNouns = existing?.keyNouns || [];
  const mergedNouns = dedupeStrings([...existingNouns, ...extracted.nouns]).slice(0, 12);

  return {
    preferredName: extracted.preferredName || existing?.preferredName || null,
    pronouns: extracted.pronouns || existing?.pronouns || null,
    keyNouns: mergedNouns,
  };
}

export function formatAIFriendMemoryContext(memory: AIFriendMemory | null | undefined): string | null {
  if (!memory) return null;
  const lines: string[] = [];
  if (memory.preferredName) lines.push(`Preferred name: ${memory.preferredName}`);
  if (memory.pronouns) lines.push(`Pronouns: ${memory.pronouns}`);
  if (memory.keyNouns && memory.keyNouns.length > 0) lines.push(`Key nouns/interests: ${memory.keyNouns.join(', ')}`);
  return lines.length > 0 ? lines.join('\n') : null;
}
