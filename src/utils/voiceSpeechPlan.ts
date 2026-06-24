import {
  isMarkdownTableRow,
  isMarkdownTableSeparator,
} from "./markdownTable";
import { sanitizeForSpeech } from "./voiceText";

export type VoiceContentSegment =
  | { kind: "prose"; raw: string; speech: string }
  | { kind: "table"; raw: string };

export type SegmentTiming = {
  segmentIndex: number;
  speechStart: number;
  speechEnd: number;
};

export type VoiceSpeechPlan = {
  segments: VoiceContentSegment[];
  /** Text fed to speech synthesis — tables omitted. */
  speechText: string;
  /** Full answer text for the voice overlay (tables kept for rendering). */
  fullDisplayText: string;
  timings: SegmentTiming[];
  displayAtSpeechOffset: (speechOffset: number) => string;
};

/** Map a spoken word index to a character offset in `speechText`. */
export function wordIndexToCharOffset(text: string, wordIndex: number): number {
  if (!text || wordIndex < 0) return 0;

  let seen = 0;
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (seen >= wordIndex) {
      return match.index + match[0].length;
    }
    seen += 1;
  }

  return text.length;
}

function collectTableLines(
  lines: string[],
  start: number
): { raw: string; nextLineIndex: number } | null {
  const first = lines[start]?.trim() ?? "";
  if (!isMarkdownTableRow(first) && !isMarkdownTableSeparator(first)) {
    return null;
  }

  const tableLines: string[] = [];
  let i = start;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) break;
    if (!isMarkdownTableRow(trimmed) && !isMarkdownTableSeparator(trimmed)) {
      break;
    }
    tableLines.push(lines[i]);
    i += 1;
  }

  if (tableLines.length < 2) return null;

  return { raw: tableLines.join("\n"), nextLineIndex: i };
}

/** Split answer text into prose and markdown table blocks. */
export function splitVoiceContentSegments(raw: string): VoiceContentSegment[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const segments: VoiceContentSegment[] = [];
  let proseLines: string[] = [];
  let i = 0;

  const flushProse = () => {
    const text = proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    proseLines = [];
    if (!text) return;
    segments.push({
      kind: "prose",
      raw: text,
      speech: sanitizeForSpeech(text),
    });
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      if (proseLines.length > 0 && proseLines[proseLines.length - 1] !== "") {
        proseLines.push("");
      }
      i += 1;
      continue;
    }

    const tableRun = collectTableLines(lines, i);
    if (tableRun) {
      flushProse();
      segments.push({ kind: "table", raw: tableRun.raw });
      i = tableRun.nextLineIndex;
      continue;
    }

    proseLines.push(lines[i]);
    i += 1;
  }

  flushProse();
  return segments;
}

function buildSegmentTimings(
  segments: VoiceContentSegment[]
): { speechText: string; timings: SegmentTiming[] } {
  const timings: SegmentTiming[] = [];
  const speechParts: string[] = [];
  let cursor = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];

    if (seg.kind === "table") {
      timings.push({ segmentIndex: i, speechStart: cursor, speechEnd: cursor });
      continue;
    }

    const speech = seg.speech.trim();
    if (!speech) {
      timings.push({ segmentIndex: i, speechStart: cursor, speechEnd: cursor });
      continue;
    }

    if (speechParts.length > 0) {
      cursor += 2;
    }

    const start = cursor;
    cursor += speech.length;
    speechParts.push(speech);
    timings.push({ segmentIndex: i, speechStart: start, speechEnd: cursor });
  }

  return { speechText: speechParts.join("\n\n"), timings };
}

function partialProseForSpeechProgress(
  raw: string,
  speech: string,
  speechCharsSpoken: number
): string {
  if (!raw) return "";
  if (speechCharsSpoken <= 0) return "";
  if (!speech || speechCharsSpoken >= speech.length) return raw;

  const speechSoFar = speech.slice(0, speechCharsSpoken);
  const speechWordsSpoken = speechSoFar.trim()
    ? speechSoFar.trim().split(/\s+/).length
    : 0;
  const totalSpeechWords = speech.trim().split(/\s+/).filter(Boolean).length;

  if (totalSpeechWords === 0 || speechWordsSpoken === 0) {
    const ratio = speechCharsSpoken / speech.length;
    const end = Math.max(1, Math.floor(raw.length * ratio));
    return raw.slice(0, end).trimEnd();
  }

  const totalRawWords = raw.trim().split(/\s+/).filter(Boolean).length;
  const rawWordsToShow = Math.min(
    totalRawWords,
    Math.max(1, Math.round((speechWordsSpoken / totalSpeechWords) * totalRawWords))
  );

  let count = 0;
  let end = 0;
  const pattern = /\S+|\s+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    if (/\S/.test(match[0])) {
      count += 1;
      if (count > rawWordsToShow) break;
    }
    end = match.index + match[0].length;
  }

  return raw.slice(0, end).trimEnd();
}

export function displayTextAtSpeechOffset(
  segments: VoiceContentSegment[],
  timings: SegmentTiming[],
  speechOffset: number
): string {
  const clampedOffset = Math.max(0, speechOffset);
  const parts: string[] = [];

  for (const timing of timings) {
    const seg = segments[timing.segmentIndex];
    if (!seg) continue;

    if (seg.kind === "table") {
      if (clampedOffset >= timing.speechStart) {
        parts.push(seg.raw);
      }
      continue;
    }

    if (clampedOffset >= timing.speechEnd) {
      parts.push(seg.raw);
      continue;
    }

    if (clampedOffset > timing.speechStart && timing.speechEnd > timing.speechStart) {
      const within = clampedOffset - timing.speechStart;
      parts.push(partialProseForSpeechProgress(seg.raw, seg.speech, within));
    } else if (
      clampedOffset === timing.speechStart &&
      timing.speechStart > 0 &&
      timing.speechEnd > timing.speechStart
    ) {
      parts.push(partialProseForSpeechProgress(seg.raw, seg.speech, 1));
    }
    break;
  }

  return parts.join("\n\n").trim();
}

export function buildVoiceSpeechPlan(raw: string): VoiceSpeechPlan {
  const segments = splitVoiceContentSegments(raw);
  const { speechText, timings } = buildSegmentTimings(segments);
  const fullDisplayText = segments.map((s) => s.raw).join("\n\n").trim();

  return {
    segments,
    speechText,
    fullDisplayText,
    timings,
    displayAtSpeechOffset: (speechOffset: number) =>
      displayTextAtSpeechOffset(segments, timings, speechOffset),
  };
}
