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
    updateVoiceDisplay("");

    resumeKeepAlive = window.setInterval(() => {
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }, 10000);

    const estimatedMsPerWord = 450 / rate;
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

      if (
        estimatedWordIndex > fallbackWordIndex &&
        timeSinceLastUpdate > estimatedMsPerWord * 0.8
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
    }, 150);
  };

  utterance.onboundary = (event: SpeechSynthesisEvent) => {
    if (event.charIndex === undefined) return;

    const nextOffset = Math.max(
      spokenOffset,
      event.charIndex + (event.charLength || 0)
    );
    if (nextOffset <= spokenOffset) return;

    spokenOffset = nextOffset;
    lastBoundaryUpdate = Date.now();
    syncDisplay(spokenOffset);
  };

  const finish = () => {
    options.onSpeakingChange?.(false);
    updateVoiceDisplay(plan.fullDisplayText);
    if (resumeKeepAlive) {
      clearInterval(resumeKeepAlive);
      resumeKeepAlive = null;
    }
    if (fallbackInterval) {
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }
    options.onComplete?.();
  };

  utterance.onend = finish;
  utterance.onerror = finish;

  window.setTimeout(() => window.speechSynthesis.speak(utterance), 100);
}

export function stopVoiceSpeechOutput(onSpeakingChange?: (speaking: boolean) => void) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  onSpeakingChange?.(false);
}

export { buildVoiceSpeechPlan, type VoiceSpeechPlan };
