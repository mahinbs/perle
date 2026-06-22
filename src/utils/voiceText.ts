/**
 * Clean text for speech-synthesis output. Removes things that make the voice
 * sound robotic / cluttered when read aloud:
 *   - Citation numbers like [1], [2, 3]
 *   - Markdown noise (**bold**, *italic*, `code`, ##, ---, |, table pipes)
 *   - URLs (they get spelled out otherwise)
 *   - Emoji (the synth reads them out as literal Unicode names)
 *   - Multiple dashes / underscores / pipes left from tables
 *   - Question marks → period (the rising-intonation TTS does is jarring on
 *     every line that contains a "?", e.g. inside scraped news titles)
 *   - Repeated whitespace
 */
export function sanitizeForSpeech(text: string): string {
  if (!text) return "";
  return text
    // 1. Citation markers — [1], [2, 3, 4]
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "")
    // 2. Source labels — "Source X" or "Source(s):"
    .replace(/\bsources?\s*[:\-]?\s*\d+(?:\s*,\s*\d+)*/gi, "")
    // 3. URLs
    .replace(/https?:\/\/\S+/g, "")
    // 4. Markdown code fences and inline code
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // 5. Markdown bold / italic markers (keep the inner text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1$2")
    // 6. Markdown headings and HR rules
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // 7. Markdown table pipes / separators
    .replace(/\|/g, " ")
    .replace(/[\s]*-{2,}[\s]*/g, " ")
    // 8. Question marks → period (avoid uptalk on every news title)
    .replace(/\?/g, ".")
    // 9. Strip leading/trailing punctuation noise
    .replace(/[•►▪︎]/g, "")
    // 10. Emoji / extended pictographs — speech engines read them literally
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    // 11. Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
