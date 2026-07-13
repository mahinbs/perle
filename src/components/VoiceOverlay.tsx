import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { World, type GlobeConfig, type Position } from "./ui/globe";
import VoiceResponseText from "./VoiceResponseText";
import VoiceOverlayControls from "./VoiceOverlayControls";
import { SourcesPill } from "./SourcesPill";
import { warmSpeechSynthesis, stopVoiceSpeechOutput } from "../utils/voiceSpeechOutput";
import type { Source } from "../types";
import syntraGif from "../assets/gif/syntraiq.gif";

const IS_NATIVE = Capacitor.isNativePlatform();

const FIXED_GLOBE_ROTATION_SPEED = 24;
// Web keeps the larger WebGL globe; native uses a smaller CSS orb to avoid lag.
const BOTTOM_GLOBE_SIZE = IS_NATIVE
  ? "clamp(64px, 18vmin, 96px)"
  : "clamp(96px, 30vmin, 145px)";
const CENTER_GLOBE_SIZE = IS_NATIVE
  ? "clamp(110px, 32vmin, 168px)"
  : "clamp(160px, 48vmin, 260px)";
const VOICE_OVERLAY_SAFE_TOP = "max(12px, env(safe-area-inset-top, 0px))";
const VOICE_CONTENT_H_PADDING = "clamp(12px, 4vw, 28px)";

interface VoiceOverlayProps {
  isOpen: boolean;
  isListening: boolean;
  isLoading?: boolean;
  queryText?: string;
  onToggleListening: () => void;
  onClose: () => void;
  responseText?: string;
  sources?: Source[];
}

const GlobeView = React.memo(function GlobeView({
  baseGlobeSize,
  globeConfig,
  globeData,
}: {
  baseGlobeSize: string;
  globeConfig: GlobeConfig;
  globeData: Position[];
}) {
  return (
    <div
      className="globe-wrapper"
      style={{
        position: "relative",
        width: baseGlobeSize,
        height: baseGlobeSize,
        aspectRatio: "1 / 1",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 1,
        transition: "opacity 0.3s ease-in-out",
      }}
    >
      <World globeConfig={globeConfig} data={globeData} />
    </div>
  );
});

// Fullscreen overlay for voice interaction with a dotted sphere animation
export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isOpen,
  isListening,
  isLoading = false,
  queryText = "",
  onToggleListening,
  onClose,
  responseText,
  sources = [],
}) => {
  const [os, setOs] = useState("");
  const hasAutoStartedRef = useRef(false);
  // Shared AudioContext — created once on first open (inside a user gesture) so
  // it's never blocked by the browser's autoplay policy.
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes("mac")) setOs("mac");
    else if (platform.includes("win")) setOs("windows");
    else setOs("other");
  }, []);

  const getAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioCtx();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const playActivationBeep = useCallback(async () => {
    const audioCtx = getAudioCtx();
    if (!audioCtx) return;
    try {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.25,
        audioCtx.currentTime + 0.01
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        audioCtx.currentTime + 0.25
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      await new Promise<void>((resolve) => {
        oscillator.onended = () => resolve();
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      });
    } catch { }
  }, [getAudioCtx]);

  // Clear stale answer state and pre-warm speech synthesis whenever the overlay opens.
  useEffect(() => {
    if (!isOpen) {
      hasAutoStartedRef.current = false;
      return;
    }
    // Wipe previous-session answer text the moment the overlay opens.
    try {
      localStorage.removeItem("syntraiq-current-answer-text");
      localStorage.removeItem("syntraiq-current-word-index");
    } catch { }
    // Pre-warm the speech engine so the first TTS response starts instantly.
    warmSpeechSynthesis();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (hasAutoStartedRef.current) return;
    hasAutoStartedRef.current = true;

    let cancelled = false;

    const kickOffListening = async () => {
      // Play beep first, then start mic so beep isn't starved on Android.
      await playActivationBeep();
      if (cancelled) return;
      // When opening voice mode to read existing chat answer, do not immediately
      // start listening (which would cancel TTS). Let TTS start first.
      try {
        const speakFirst = localStorage.getItem("syntraiq-voice-open-speak-first") === "1";
        if (speakFirst) {
          localStorage.removeItem("syntraiq-voice-open-speak-first");
          return;
        }
      } catch { }
      if (!isListening) {
        onToggleListening();
      }
    };

    kickOffListening();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isListening, onToggleListening, playActivationBeep]);

  // Do not cancel speech when opening overlay.
  // TTS may have just been intentionally triggered from chat answer and canceling here
  // causes partial/garbled playback that feels like hallucination.

  // Cancel leftover speech on remount / refresh
  useEffect(() => {
    stopVoiceSpeechOutput();
    localStorage.removeItem("syntraiq-current-answer-text");
    localStorage.removeItem("syntraiq-current-word-index");

    return () => {
      stopVoiceSpeechOutput();
    };
  }, []);

  // Lock background scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const globeAtBottom = isLoading || Boolean(queryText) || Boolean(responseText);

  const overlay = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        padding: "0 16px 0",
        pointerEvents: "auto",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Voice assistant"
    >
      {/* Always reserve top safe area (Dynamic Island / status bar) — sources pill sits here when ready */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: VOICE_OVERLAY_SAFE_TOP,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          minHeight: isLoading && sources.length === 0 ? 52 : undefined,
        }}
      >
        <SourcesPill sources={sources} expandDirection="down" />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "flex-start",
          overflow: "hidden",
          minHeight: 0,
          paddingBottom: 8,
          position: "relative",
        }}
      >
        {!globeAtBottom && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 0,
            }}
          >
            <VoiceGlobeOrb size={CENTER_GLOBE_SIZE} />
          </div>
        )}
        <VoiceResponsePanel
          isLoading={isLoading}
          queryText={queryText}
          key={isOpen ? "open" : "closed"}
        />
      </div>

      <div className="shrink-0 w-full z-[1]">
        <VoiceOverlayControls
          isListening={isListening}
          onClose={() => {
            try {
              stopVoiceSpeechOutput();
              localStorage.removeItem("syntraiq-current-answer-text");
              localStorage.removeItem("syntraiq-current-word-index");
              localStorage.removeItem("syntraiq-keep-voice-overlay-open");
            } catch { }
            onClose();
          }}
          onToggleListening={onToggleListening}
          isMac={os === "mac"}
          centerContent={
            globeAtBottom ? <VoiceGlobeOrb size={BOTTOM_GLOBE_SIZE} /> : null
          }
        />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

const VoiceResponsePanel: React.FC<{
  isLoading?: boolean;
  queryText?: string;
}> = ({ isLoading = false, queryText = "" }) => {
  const [speaking, setSpeaking] = useState(false);
  const [displayText, setDisplayText] = useState("");

  // Progressive display driven only by live TTS sync (localStorage).
  // 80 ms interval is fast enough for smooth word-by-word reveal without
  // the jank of a 60fps requestAnimationFrame loop on Android.
  useEffect(() => {
    if (isLoading) {
      setDisplayText("");
      try {
        localStorage.removeItem("syntraiq-current-answer-text");
      } catch { /* ignore */ }
      return;
    }
    const timer = window.setInterval(() => {
      try {
        const storedText =
          typeof window !== "undefined"
            ? window.localStorage.getItem("syntraiq-current-answer-text")
            : null;

        if (storedText !== null && storedText !== "") {
          const cleaned = storedText.replace(/\bundefined\b/gi, "");
          setDisplayText((prev) => (cleaned !== prev ? cleaned : prev));
        }

        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const isSpeakingNow = window.speechSynthesis.speaking;
          setSpeaking((s) => (isSpeakingNow !== s ? isSpeakingNow : s));
        }
      } catch { /* ignore */ }
    }, 80);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div
        className="voice-overlay-loading"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          width: "100%",
          maxWidth: "min(720px, 94vw)",
          marginInline: "auto",
          flex: 1,
          minHeight: 0,
          padding: `8px ${VOICE_CONTENT_H_PADDING} 12px`,
          gap: 12,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {queryText && (
          <p
            style={{
              fontSize: "var(--font-md)",
              fontWeight: 500,
              color: "var(--text)",
              textAlign: "left",
              margin: 0,
              maxWidth: "100%",
              wordBreak: "break-word",
              alignSelf: "stretch",
            }}
          >
            {queryText}
          </p>
        )}
        <div className="flex items-start gap-1">
          <img
            src={syntraGif}
            alt="IQ"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
          <div
            className="flex items-center justify-center"
            style={{ minHeight: 36, paddingRight: 8 }}
          >
            <p
              style={{
                fontSize: "var(--font-sm)",
                fontWeight: 500,
                color: "var(--sub)",
                margin: 0,
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              IQ is thinking
              <span className="thinking-dots" aria-hidden="true">.....</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
        flex: 1,
        minHeight: 0,
        padding: "0 8px",
      }}
    >
      <VoiceResponseText text={displayText} speaking={speaking} />
    </div>
  );
};

/** Lightweight CSS “3D” globe for Capacitor — avoids WebGL lag / blank screens. */
const CssVoiceGlobe: React.FC<{ size: string }> = ({ size }) => (
  <div
    className="voice-css-globe"
    style={{ width: size, height: size, flexShrink: 0 }}
    aria-hidden
  >
    <div className="voice-css-globe__aura" />
    <div className="voice-css-globe__ring voice-css-globe__ring--outer" />
    <div className="voice-css-globe__ring voice-css-globe__ring--mid" />
    <div className="voice-css-globe__sphere">
      <div className="voice-css-globe__surface" />
      <div className="voice-css-globe__grid" />
      <svg
        className="voice-css-globe__arcs"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="voiceArcGradA" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(90,180,255,0)" />
            <stop offset="50%" stopColor="rgba(120,200,255,0.95)" />
            <stop offset="100%" stopColor="rgba(90,180,255,0)" />
          </linearGradient>
          <linearGradient id="voiceArcGradB" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(199,168,105,0)" />
            <stop offset="50%" stopColor="rgba(255,210,140,0.95)" />
            <stop offset="100%" stopColor="rgba(199,168,105,0)" />
          </linearGradient>
          <linearGradient id="voiceArcGradC" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(160,120,255,0)" />
            <stop offset="50%" stopColor="rgba(190,150,255,0.95)" />
            <stop offset="100%" stopColor="rgba(160,120,255,0)" />
          </linearGradient>
          <filter id="voiceArcGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Soft track underlays */}
        <path className="voice-css-globe__arc-track" d="M14 64 C 30 24, 70 18, 88 46" />
        <path className="voice-css-globe__arc-track" d="M18 34 C 38 72, 68 78, 90 40" />
        <path className="voice-css-globe__arc-track" d="M24 82 C 46 54, 64 28, 82 20" />
        <path className="voice-css-globe__arc-track" d="M30 22 C 48 48, 58 70, 76 86" />

        {/* Animated network arcs */}
        <path className="voice-css-globe__arc voice-css-globe__arc--a" d="M14 64 C 30 24, 70 18, 88 46" />
        <path className="voice-css-globe__arc voice-css-globe__arc--b" d="M18 34 C 38 72, 68 78, 90 40" />
        <path className="voice-css-globe__arc voice-css-globe__arc--c" d="M24 82 C 46 54, 64 28, 82 20" />
        <path className="voice-css-globe__arc voice-css-globe__arc--d" d="M30 22 C 48 48, 58 70, 76 86" />

        {/* Traveling packets along arcs */}
        <circle className="voice-css-globe__packet voice-css-globe__packet--a" r="1.35" filter="url(#voiceArcGlow)">
          <animateMotion dur="2.6s" repeatCount="indefinite" path="M14 64 C 30 24, 70 18, 88 46" />
        </circle>
        <circle className="voice-css-globe__packet voice-css-globe__packet--b" r="1.2" filter="url(#voiceArcGlow)">
          <animateMotion dur="3.1s" begin="-0.8s" repeatCount="indefinite" path="M18 34 C 38 72, 68 78, 90 40" />
        </circle>
        <circle className="voice-css-globe__packet voice-css-globe__packet--c" r="1.15" filter="url(#voiceArcGlow)">
          <animateMotion dur="2.9s" begin="-1.4s" repeatCount="indefinite" path="M24 82 C 46 54, 64 28, 82 20" />
        </circle>
        <circle className="voice-css-globe__packet voice-css-globe__packet--d" r="1.1" filter="url(#voiceArcGlow)">
          <animateMotion dur="3.4s" begin="-0.4s" repeatCount="indefinite" path="M30 22 C 48 48, 58 70, 76 86" />
        </circle>

        <circle className="voice-css-globe__node voice-css-globe__node--1" cx="14" cy="64" r="1.7" />
        <circle className="voice-css-globe__node voice-css-globe__node--2" cx="88" cy="46" r="1.7" />
        <circle className="voice-css-globe__node voice-css-globe__node--3" cx="18" cy="34" r="1.45" />
        <circle className="voice-css-globe__node voice-css-globe__node--4" cx="90" cy="40" r="1.45" />
        <circle className="voice-css-globe__node voice-css-globe__node--5" cx="24" cy="82" r="1.35" />
        <circle className="voice-css-globe__node voice-css-globe__node--6" cx="82" cy="20" r="1.5" />
        <circle className="voice-css-globe__node voice-css-globe__node--7" cx="30" cy="22" r="1.3" />
        <circle className="voice-css-globe__node voice-css-globe__node--8" cx="76" cy="86" r="1.3" />
      </svg>
      <div className="voice-css-globe__shine" />
      <div className="voice-css-globe__rim" />
    </div>
    <div className="voice-css-globe__border-glow" />
  </div>
);

const VoiceGlobeOrb: React.FC<{ size: string }> = ({ size }) => {
  // Android + iOS native: CSS 3D pulse orb (WebGL three-globe causes lag / blanks).
  if (IS_NATIVE) return <CssVoiceGlobe size={size} />;
  return <WebVoiceGlobe size={size} />;
};

const WebVoiceGlobe: React.FC<{ size: string }> = ({ size }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      const isDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDarkMode(isDark);
    };

    checkTheme();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", checkTheme);

    return () => mediaQuery.removeEventListener("change", checkTheme);
  }, []);

  // Sample globe data for arcs - Multiple points across the globe
  const globeData: Position[] = useMemo(
    () => [
      // North America
      {
        order: 1,
        startLat: 40.7128,
        startLng: -74.006,
        endLat: 34.0522,
        endLng: -118.2437,
        arcAlt: 0.1,
        color: "#C7A869",
      }, // NYC to LA
      {
        order: 2,
        startLat: 40.7128,
        startLng: -74.006,
        endLat: 41.8781,
        endLng: -87.6298,
        arcAlt: 0.15,
        color: "#C7A869",
      }, // NYC to Chicago
      {
        order: 3,
        startLat: 40.7128,
        startLng: -74.006,
        endLat: 29.7604,
        endLng: -95.3698,
        arcAlt: 0.2,
        color: "#C7A869",
      }, // NYC to Houston
      {
        order: 4,
        startLat: 34.0522,
        startLng: -118.2437,
        endLat: 37.7749,
        endLng: -122.4194,
        arcAlt: 0.1,
        color: "#C7A869",
      }, // LA to San Francisco
      {
        order: 5,
        startLat: 25.7617,
        startLng: -80.1918,
        endLat: 40.7128,
        endLng: -74.006,
        arcAlt: 0.25,
        color: "#C7A869",
      }, // Miami to NYC

      // Europe
      {
        order: 6,
        startLat: 51.5074,
        startLng: -0.1278,
        endLat: 40.7128,
        endLng: -74.006,
        arcAlt: 0.3,
        color: "#C7A869",
      }, // London to NYC
      {
        order: 7,
        startLat: 48.8566,
        startLng: 2.3522,
        endLat: 51.5074,
        endLng: -0.1278,
        arcAlt: 0.1,
        color: "#C7A869",
      }, // Paris to London
      {
        order: 8,
        startLat: 52.52,
        startLng: 13.405,
        endLat: 51.5074,
        endLng: -0.1278,
        arcAlt: 0.15,
        color: "#C7A869",
      }, // Berlin to London
      {
        order: 9,
        startLat: 41.9028,
        startLng: 12.4964,
        endLat: 48.8566,
        endLng: 2.3522,
        arcAlt: 0.2,
        color: "#C7A869",
      }, // Rome to Paris
      {
        order: 10,
        startLat: 55.7558,
        startLng: 37.6173,
        endLat: 51.5074,
        endLng: -0.1278,
        arcAlt: 0.35,
        color: "#C7A869",
      }, // Moscow to London

      // Asia
      {
        order: 11,
        startLat: 35.6762,
        startLng: 139.6503,
        endLat: 40.7128,
        endLng: -74.006,
        arcAlt: 0.4,
        color: "#C7A869",
      }, // Tokyo to NYC
      {
        order: 12,
        startLat: 28.6139,
        startLng: 77.209,
        endLat: 35.6762,
        endLng: 139.6503,
        arcAlt: 0.3,
        color: "#C7A869",
      }, // Delhi to Tokyo
      {
        order: 13,
        startLat: 31.2304,
        startLng: 121.4737,
        endLat: 35.6762,
        endLng: 139.6503,
        arcAlt: 0.15,
        color: "#C7A869",
      }, // Shanghai to Tokyo
      {
        order: 14,
        startLat: 22.3193,
        startLng: 114.1694,
        endLat: 31.2304,
        endLng: 121.4737,
        arcAlt: 0.2,
        color: "#C7A869",
      }, // Hong Kong to Shanghai
      {
        order: 15,
        startLat: 1.3521,
        startLng: 103.8198,
        endLat: 22.3193,
        endLng: 114.1694,
        arcAlt: 0.25,
        color: "#C7A869",
      }, // Singapore to Hong Kong
      {
        order: 16,
        startLat: 19.076,
        startLng: 72.8777,
        endLat: 28.6139,
        endLng: 77.209,
        arcAlt: 0.2,
        color: "#C7A869",
      }, // Mumbai to Delhi
      {
        order: 17,
        startLat: 39.9042,
        startLng: 116.4074,
        endLat: 35.6762,
        endLng: 139.6503,
        arcAlt: 0.25,
        color: "#C7A869",
      }, // Beijing to Tokyo
      {
        order: 18,
        startLat: 37.5665,
        startLng: 126.978,
        endLat: 35.6762,
        endLng: 139.6503,
        arcAlt: 0.1,
        color: "#C7A869",
      }, // Seoul to Tokyo

      // Middle East & Africa
      {
        order: 19,
        startLat: 25.2048,
        startLng: 55.2708,
        endLat: 51.5074,
        endLng: -0.1278,
        arcAlt: 0.3,
        color: "#C7A869",
      }, // Dubai to London
      {
        order: 20,
        startLat: 30.0444,
        startLng: 31.2357,
        endLat: 25.2048,
        endLng: 55.2708,
        arcAlt: 0.2,
        color: "#C7A869",
      }, // Cairo to Dubai
      {
        order: 21,
        startLat: -33.8688,
        startLng: 151.2093,
        endLat: 1.3521,
        endLng: 103.8198,
        arcAlt: 0.3,
        color: "#C7A869",
      }, // Sydney to Singapore
      {
        order: 22,
        startLat: -26.2041,
        startLng: 28.0473,
        endLat: 25.2048,
        endLng: 55.2708,
        arcAlt: 0.35,
        color: "#C7A869",
      }, // Johannesburg to Dubai

      // South America
      {
        order: 23,
        startLat: -23.5505,
        startLng: -46.6333,
        endLat: 40.7128,
        endLng: -74.006,
        arcAlt: 0.4,
        color: "#C7A869",
      }, // São Paulo to NYC
      {
        order: 24,
        startLat: -34.6037,
        startLng: -58.3816,
        endLat: -23.5505,
        endLng: -46.6333,
        arcAlt: 0.2,
        color: "#C7A869",
      }, // Buenos Aires to São Paulo
      {
        order: 25,
        startLat: -12.0464,
        startLng: -77.0428,
        endLat: -23.5505,
        endLng: -46.6333,
        arcAlt: 0.3,
        color: "#C7A869",
      }, // Lima to São Paulo

      // Additional connections
      {
        order: 26,
        startLat: 55.7558,
        startLng: 37.6173,
        endLat: 39.9042,
        endLng: 116.4074,
        arcAlt: 0.3,
        color: "#C7A869",
      }, // Moscow to Beijing
      {
        order: 27,
        startLat: 51.5074,
        startLng: -0.1278,
        endLat: 28.6139,
        endLng: 77.209,
        arcAlt: 0.35,
        color: "#C7A869",
      }, // London to Delhi
      {
        order: 28,
        startLat: 40.7128,
        startLng: -74.006,
        endLat: 1.3521,
        endLng: 103.8198,
        arcAlt: 0.45,
        color: "#C7A869",
      }, // NYC to Singapore
    ],
    []
  );

  // Theme-aware globe configuration with fixed rotation speed
  const globeConfig: GlobeConfig = useMemo(() => {
    const baseGlobeColor = isDarkMode ? "#2d1f4e" : "#0f4c75";
    const baseEmissive = isDarkMode ? "#3d2f5e" : "#1a5490";
    const basePolygonColor = isDarkMode
      ? "rgba(199, 168, 105, 0.7)"
      : "rgba(255,255,255,0.8)";
    const baseAtmosphereColor = isDarkMode
      ? "rgba(199, 168, 105, 0.6)"
      : "rgba(255,255,255,0.7)";
    const baseAmbientLight = isDarkMode ? "#a68b5b" : "#3b82f6";

    return {
      pointSize: 3,
      globeColor: baseGlobeColor,
      showAtmosphere: true,
      atmosphereColor: baseAtmosphereColor,
      atmosphereAltitude: 0.22,
      emissive: baseEmissive,
      emissiveIntensity: isDarkMode ? 0.4 : 0.35,
      shininess: 0.9,
      arcTime: 1000,
      arcLength: 0.9,
      rings: 1,
      maxRings: 3,
      initialPosition: { lat: 0, lng: 0 },
      autoRotate: true,
      autoRotateSpeed: FIXED_GLOBE_ROTATION_SPEED,
      polygonColor: basePolygonColor,
      ambientLight: baseAmbientLight,
      directionalLeftLight: "#ffffff",
      directionalTopLight: "#ffffff",
      pointLight: "#ffffff",
    };
  }, [isDarkMode]);

  return (
    <GlobeView
      baseGlobeSize={size}
      globeConfig={globeConfig}
      globeData={globeData}
    />
  );
};

export default VoiceOverlay;
