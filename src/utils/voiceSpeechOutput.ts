import { STORAGE_KEYS, setLocalItem } from "./storage";
import {
  buildVoiceSpeechPlan,
  type VoiceSpeechPlan,
  wordIndexToCharOffset,
} from "./voiceSpeechPlan";

export type VoiceSpeechSessionOptions = {
  onSpeakingChange?: (speaking: boolean) => void;
  onComplete?: () => void;
  rate?: number;
  volume?: number;
};

function updateVoiceDisplay(text: string) {
  setLocalItem(STORAGE_KEYS.currentAnswerText, text);
}

/**
 * Speak an answer while keeping the voice overlay text in sync.
 * Markdown tables are shown on screen but skipped by TTS so speech does not
 * get stuck reading every cell.
 */
export function speakAnswerWithVoicePlan(
  rawText: string,
  options: VoiceSpeechSessionOptions = {}
): void {
  const content = (rawText || "").replace(/\bundefined\b/gi, "").trim();
  if (!content) return;

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    const plan = buildVoiceSpeechPlan(content);
    updateVoiceDisplay(plan.fullDisplayText);
    return;
  }

  const plan = buildVoiceSpeechPlan(content);
  const rate = options.rate ?? 0.92;
  const volume = options.volume ?? 0.9;

  window.speechSynthesis.cancel();
  updateVoiceDisplay("");

  if (!plan.speechText.trim()) {
    updateVoiceDisplay(plan.fullDisplayText);
    options.onComplete?.();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(plan.speechText);
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = volume;

  let resumeKeepAlive: number | null = null;
  let spokenOffset = 0;
  let fallbackInterval: number | null = null;
  let fallbackWordIndex = 0;
  let speechStartTime = 0;
  let lastBoundaryUpdate = 0;
  let peakDisplayLength = 0;
  // Track whether we already received at least one boundary event — on platforms
  // that fire them we trust the boundary-driven path; on ones that don't (some
  // Android WebViews), the time-based fallback drives the display.
  let hasBoundaryEvents = false;

  const syncDisplay = (offset: number) => {
    const display = plan.displayAtSpeechOffset(
      Math.min(offset, plan.speechText.length)
    );
    if (display.length >= peakDisplayLength) {
      peakDisplayLength = display.length;
      updateVoiceDisplay(display);
    }
  };

  utterance.onstart = () => {
    options.onSpeakingChange?.(true);
    spokenOffset = 0;
    fallbackWordIndex = 0;
    peakDisplayLength = 0;
    speechStartTime = Date.now();
    lastBoundaryUpdate = Date.now();
    hasBoundaryEvents = false;
    updateVoiceDisplay("");

    resumeKeepAlive = window.setInterval(() => {
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch { /* ignore */ }
    }, 10000);

    // Time-based fallback: advances the display proportionally to elapsed time
    // so the text always looks like it's keeping up with speech even when
    // boundary events don't fire (common on Android WebView).
    const estimatedMsPerWord = 480 / rate; // roughly 480 ms / word at normal speed
    fallbackInterval = window.setInterval(() => {
      if (!window.speechSynthesis.speaking) return;

      const elapsed = Date.now() - speechStartTime;
      const timeSinceLastUpdate = Date.now() - lastBoundaryUpdate;
      const totalWords = plan.speechText.trim()
        ? plan.speechText.trim().split(/\s+/).length
        : 0;
      const estimatedWordIndex = Math.min(
        Math.floor(elapsed / estimatedMsPerWord + 1),
        Math.max(totalWords - 1, 0)
      );

      // If we have real boundary events, use a looser threshold — the
      // fallback acts as a safety-net only.
      const threshold = hasBoundaryEvents
        ? estimatedMsPerWord * 1.5
        : estimatedMsPerWord * 0.7;

      if (
        estimatedWordIndex > fallbackWordIndex &&
        timeSinceLastUpdate > threshold
      ) {
        fallbackWordIndex = estimatedWordIndex;
        const charOffset = wordIndexToCharOffset(
          plan.speechText,
          estimatedWordIndex
        );
        spokenOffset = Math.max(spokenOffset, charOffset);
        syncDisplay(spokenOffset);
        lastBoundaryUpdate = Date.now();
      }
    }, 80);
  };

  utterance.onboundary = (event: SpeechSynthesisEvent) => {
    if (event.charIndex === undefined) return;
    hasBoundaryEvents = true;

    const nextOffset = Math.max(
      spokenOffset,
      event.charIndex + (event.charLength || 0)
    );
    if (nextOffset <= spokenOffset) return;

    spokenOffset = nextOffset;
    lastBoundaryUpdate = Date.now();
    syncDisplay(spokenOffset);
  };

  const stopIntervals = () => {
    if (resumeKeepAlive) {
      clearInterval(resumeKeepAlive);
      resumeKeepAlive = null;
    }
    if (fallbackInterval) {
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }
  };

  const finish = () => {
    options.onSpeakingChange?.(false);
    stopIntervals();
    // Show the full display text once speech actually ends.
    updateVoiceDisplay(plan.fullDisplayText);
    options.onComplete?.();
  };

  const onError = (event?: SpeechSynthesisErrorEvent) => {
    // "interrupted" / "canceled" fire when we call speechSynthesis.cancel() —
    // that's intentional (user stopped, new query, etc.), not an error to log.
    const err = (event as any)?.error ?? "";
    if (err === "interrupted" || err === "canceled" || err === "cancelled") {
      stopIntervals();
      options.onSpeakingChange?.(false);
      return;
    }
    finish();
  };

  utterance.onend = finish;
  utterance.onerror = onError as any;

  // Speak immediately — no artificial delay. speechSynthesis.cancel() above
  // already flushes any previous utterance so we can queue this one right away.
  window.speechSynthesis.speak(utterance);
}

/**
 * Pre-warm the speech synthesis engine so the first utterance starts without
 * the typical 300-600ms "cold start" delay on mobile WebViews.
 * Call this once after a user interaction (e.g. when the voice overlay opens).
 */
export function warmSpeechSynthesis(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    // Speaking an empty utterance forces the engine to initialise voices.
    const warmUp = new SpeechSynthesisUtterance("");
    warmUp.volume = 0;
    window.speechSynthesis.speak(warmUp);
    window.speechSynthesis.cancel();
  } catch { /* ignore */ }
}

export function stopVoiceSpeechOutput(onSpeakingChange?: (speaking: boolean) => void) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  onSpeakingChange?.(false);
}

export { buildVoiceSpeechPlan, type VoiceSpeechPlan };
