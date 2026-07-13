import { Capacitor } from "@capacitor/core";
import { NativeTts } from "../plugins/nativeTts";
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

let activeFallbackInterval: number | null = null;
let activeResumeKeepAlive: number | null = null;
let nativeSpeakGeneration = 0;

function updateVoiceDisplay(text: string) {
  setLocalItem(STORAGE_KEYS.currentAnswerText, text);
}

function clearSpeechTimers() {
  if (activeResumeKeepAlive) {
    clearInterval(activeResumeKeepAlive);
    activeResumeKeepAlive = null;
  }
  if (activeFallbackInterval) {
    clearInterval(activeFallbackInterval);
    activeFallbackInterval = null;
  }
}

function startPacedDisplay(
  plan: VoiceSpeechPlan,
  rate: number,
  isSpeaking: () => boolean
) {
  clearSpeechTimers();
  let spokenOffset = 0;
  let fallbackWordIndex = 0;
  let peakDisplayLength = 0;
  const speechStartTime = Date.now();
  let lastBoundaryUpdate = Date.now();
  // Tuned to track native/device TTS cadence without running ahead or behind.
  const estimatedMsPerWord = Capacitor.isNativePlatform()
    ? 455 / rate
    : 480 / rate;

  const syncDisplay = (offset: number) => {
    const display = plan.displayAtSpeechOffset(
      Math.min(offset, plan.speechText.length)
    );
    if (display.length >= peakDisplayLength) {
      peakDisplayLength = display.length;
      updateVoiceDisplay(display);
    }
  };

  updateVoiceDisplay("");

  activeFallbackInterval = window.setInterval(() => {
    if (!isSpeaking()) return;

    const elapsed = Date.now() - speechStartTime;
    const timeSinceLastUpdate = Date.now() - lastBoundaryUpdate;
    const totalWords = plan.speechText.trim()
      ? plan.speechText.trim().split(/\s+/).length
      : 0;
    const estimatedWordIndex = Math.min(
      Math.floor(elapsed / estimatedMsPerWord),
      Math.max(totalWords - 1, 0)
    );

    if (
      estimatedWordIndex > fallbackWordIndex &&
      timeSinceLastUpdate > estimatedMsPerWord * 0.6
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
}

function useNativeTts(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Pace the answer text for the estimated speech duration even if audio fails.
 * Prevents the "full answer dumps instantly" UX on native.
 */
function paceTextWithoutAudio(
  plan: VoiceSpeechPlan,
  options: VoiceSpeechSessionOptions,
  generation: number
): void {
  const rate = options.rate ?? 0.92;
  let speaking = true;
  options.onSpeakingChange?.(true);
  startPacedDisplay(plan, rate, () => speaking && generation === nativeSpeakGeneration);

  const totalWords = plan.speechText.trim()
    ? plan.speechText.trim().split(/\s+/).length
    : 1;
  const durationMs = Math.max(1800, Math.round((totalWords * 455) / rate));

  window.setTimeout(() => {
    if (generation !== nativeSpeakGeneration) return;
    speaking = false;
    clearSpeechTimers();
    options.onSpeakingChange?.(false);
    updateVoiceDisplay(plan.fullDisplayText);
    options.onComplete?.();
  }, durationMs);
}

async function speakWithNativeTts(
  plan: VoiceSpeechPlan,
  options: VoiceSpeechSessionOptions
): Promise<void> {
  const rate = options.rate ?? 0.92;
  const volume = options.volume ?? 1;
  const generation = ++nativeSpeakGeneration;

  try {
    await NativeTts.stop();
  } catch {
    /* ignore */
  }

  updateVoiceDisplay("");
  options.onSpeakingChange?.(true);

  let speaking = true;

  try {
    // Let mic / recognition release the audio session before speaking.
    await new Promise((r) => setTimeout(r, 160));
    if (generation !== nativeSpeakGeneration) return;

    // Start text pacing and native audio together for tight sync.
    startPacedDisplay(
      plan,
      rate,
      () => speaking && generation === nativeSpeakGeneration
    );

    await NativeTts.speak({
      text: plan.speechText,
      rate,
      volume,
    });
  } catch (error) {
    console.warn("Native TTS failed — pacing text without audio:", error);
    speaking = false;
    clearSpeechTimers();
    if (generation !== nativeSpeakGeneration) return;
    // Do NOT fall back to WebView speechSynthesis (it ends instantly and dumps text).
    paceTextWithoutAudio(plan, options, generation);
    return;
  }

  if (generation !== nativeSpeakGeneration) return;

  speaking = false;
  clearSpeechTimers();
  options.onSpeakingChange?.(false);
  updateVoiceDisplay(plan.fullDisplayText);
  options.onComplete?.();
}

function speakWithWebSpeech(
  plan: VoiceSpeechPlan,
  options: VoiceSpeechSessionOptions
): void {
  const rate = options.rate ?? 0.92;
  const volume = options.volume ?? 0.9;

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    updateVoiceDisplay(plan.fullDisplayText);
    options.onComplete?.();
    return;
  }

  window.speechSynthesis.cancel();
  updateVoiceDisplay("");

  const utterance = new SpeechSynthesisUtterance(plan.speechText);
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = volume;

  let spokenOffset = 0;
  let fallbackWordIndex = 0;
  let speechStartTime = 0;
  let lastBoundaryUpdate = 0;
  let peakDisplayLength = 0;
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

    activeResumeKeepAlive = window.setInterval(() => {
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }, 10000);

    const estimatedMsPerWord = 480 / rate;
    activeFallbackInterval = window.setInterval(() => {
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

  const finish = () => {
    options.onSpeakingChange?.(false);
    clearSpeechTimers();
    updateVoiceDisplay(plan.fullDisplayText);
    options.onComplete?.();
  };

  const onError = (event?: SpeechSynthesisErrorEvent) => {
    const err = (event as any)?.error ?? "";
    if (err === "interrupted" || err === "canceled" || err === "cancelled") {
      clearSpeechTimers();
      options.onSpeakingChange?.(false);
      return;
    }
    finish();
  };

  utterance.onend = finish;
  utterance.onerror = onError as any;
  window.speechSynthesis.speak(utterance);
}

/**
 * Speak an answer while keeping the voice overlay text in sync.
 * On Capacitor Android/iOS, uses native TextToSpeech / AVSpeechSynthesizer.
 */
export function speakAnswerWithVoicePlan(
  rawText: string,
  options: VoiceSpeechSessionOptions = {}
): void {
  const content = (rawText || "").replace(/\bundefined\b/gi, "").trim();
  if (!content) return;

  const plan = buildVoiceSpeechPlan(content);

  if (!plan.speechText.trim()) {
    updateVoiceDisplay(plan.fullDisplayText);
    options.onComplete?.();
    return;
  }

  if (useNativeTts()) {
    void speakWithNativeTts(plan, options);
    return;
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    updateVoiceDisplay(plan.fullDisplayText);
    options.onComplete?.();
    return;
  }

  speakWithWebSpeech(plan, options);
}

export function warmSpeechSynthesis(): void {
  if (useNativeTts()) {
    void NativeTts.warmUp()
      .catch(() => NativeTts.isSpeaking())
      .catch(() => undefined);
    return;
  }
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const warmUp = new SpeechSynthesisUtterance("");
    warmUp.volume = 0;
    window.speechSynthesis.speak(warmUp);
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function stopVoiceSpeechOutput(
  onSpeakingChange?: (speaking: boolean) => void
) {
  nativeSpeakGeneration += 1;
  clearSpeechTimers();

  if (useNativeTts()) {
    void NativeTts.stop().catch(() => undefined);
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  onSpeakingChange?.(false);
}

export { buildVoiceSpeechPlan, type VoiceSpeechPlan };
