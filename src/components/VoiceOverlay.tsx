import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { World, type GlobeConfig, type Position } from "./ui/globe";
import VoiceResponseText from "./VoiceResponseText";
import VoiceOverlayControls from "./VoiceOverlayControls";

interface VoiceOverlayProps {
  isOpen: boolean;
  isListening: boolean;
  onToggleListening: () => void;
  onClose: () => void;
  responseText?: string;
}

// Fullscreen overlay for voice interaction with a dotted sphere animation
export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isOpen,
  isListening,
  onToggleListening,
  onClose,
  responseText,
}) => {
  const [os, setOs] = useState("");
  const hasAutoStartedRef = useRef(false);

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes("mac")) setOs("mac");
    else if (platform.includes("win")) setOs("windows");
    else setOs("other");
  }, []);

  const playActivationBeep = useCallback(async () => {
    if (typeof window === "undefined") return;

    try {
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.25,
        audioCtx.currentTime + 0.01,
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        audioCtx.currentTime + 0.25,
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      await new Promise<void>((resolve) => {
        oscillator.onended = () => {
          try {
            audioCtx.close();
          } catch {}
          resolve();
        };
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!isOpen) {
      hasAutoStartedRef.current = false;
      return;
    }

    if (hasAutoStartedRef.current) return;
    hasAutoStartedRef.current = true;

    let cancelled = false;

    const kickOffListening = async () => {
      await playActivationBeep();
      if (cancelled) return;
      if (!isListening) {
        onToggleListening();
      }
    };

    kickOffListening();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isListening, onToggleListening, playActivationBeep]);

  // Cancel any ongoing speech and clear text when overlay opens
  useEffect(() => {
    if (isOpen) {
      // Cancel any ongoing speech synthesis
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      } catch {}

      // Clear any existing answer text from localStorage
      localStorage.removeItem("perle-current-answer-text");
      localStorage.removeItem("perle-current-word-index");
      localStorage.removeItem("perle-speak-next-answer");
    }
  }, [isOpen]);

  // Cancel speech synthesis on page refresh/component mount
  useEffect(() => {
    // Cancel any ongoing speech when component mounts (e.g., on page refresh)
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}

    // Clear any stored answer text on mount
    localStorage.removeItem("perle-current-answer-text");
    localStorage.removeItem("perle-current-word-index");

    // Cleanup on unmount
    return () => {
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      } catch {}
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

  const overlay = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        padding: 16,
        pointerEvents: "auto",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Voice assistant"
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className="btn-ghost"
          onClick={() => {
            try {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            } catch {}
            onClose();
          }}
          aria-label="Close"
          style={{
            borderRadius: 9999,
            color: "var(--text)",
            borderColor: "var(--border)",
            width: 48,
            height: 48,
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        {/* Watercolor gradient circle animation on voice output */}
        <SpeakingGradientCircle
          isListening={isListening}
          responseText={responseText}
          key={isOpen ? "open" : "closed"} // Reset component when overlay opens/closes
        />
      </div>

      {/* Bottom actions */}
      <VoiceOverlayControls
        isListening={isListening}
        onClose={onClose}
        onToggleListening={onToggleListening}
        isMac={os === "mac"}
      />
    </div>
  );

  return createPortal(overlay, document.body);
};

// Internal helper component that displays a 3D globe during voice output
const SpeakingGradientCircle: React.FC<{
  isListening: boolean;
  responseText?: string;
}> = ({ responseText: propResponseText }) => {
  const [speaking, setSpeaking] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const baseGlobeSize = "min(clamp(220px, 48vw, 420px), calc(100vh - 300px))";

  // Detect theme (light or dark)
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

  // Reset state when component mounts (overlay opens)
  useEffect(() => {
    setSpeaking(false);

    // Ensure speech is cancelled
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }, []); // Empty deps - only run on mount

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      try {
        const isSpeaking =
          typeof window !== "undefined" && "speechSynthesis" in window
            ? window.speechSynthesis.speaking
            : false;

        setSpeaking(isSpeaking);
      } catch {}
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
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

  // Theme-aware globe configuration - colors change when speaking
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
      autoRotateSpeed: speaking ? 50 : 15,
      polygonColor: basePolygonColor,
      ambientLight: baseAmbientLight,
      directionalLeftLight: "#ffffff",
      directionalTopLight: "#ffffff",
      pointLight: "#ffffff",
    };
  }, [isDarkMode, speaking]);

  return (
    <div
      className="speaking-gradient-circle-container"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        width: "100%",
        maxWidth: "100%",
        flexShrink: 0, // Prevent container from shrinking
      }}
    >
      {/* Globe Container - Responsive sizing with 1:1 aspect ratio */}
      <div
        className="globe-wrapper"
        style={{
          position: "relative",
          width: baseGlobeSize,
          height: baseGlobeSize,
          aspectRatio: "1 / 1", // Force 1:1 aspect ratio
          maxWidth: "480px",
          maxHeight: "480px",
          minWidth: "200px",
          minHeight: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 1, // Always fully visible
          transition: "opacity 0.3s ease-in-out",
          flexShrink: 0, // Prevent shrinking
        }}
      >
        <World globeConfig={globeConfig} data={globeData} />
      </div>

      {/* Commented out SVG animation - replaced with globe */}
      {/* 
      <svg
        viewBox="0 0 100 100"
        width={260}
        height={260}
        className="speaking-circle-svg"
        aria-hidden="true"
        style={{
          opacity: shouldAnimate ? 1 : 0.3,
          transition: "opacity 0.3s ease-in-out",
        }}
      >
        ... (entire SVG animation code commented out) ...
      </svg>
      */}

      {/* AI Response Text Display - Responsive height for mobile and desktop */}
      <VoiceResponseText text={propResponseText} speaking={speaking} />

      <style>
        {`
          /* Desktop - Larger globe size */
          @media (min-width: 1024px) {
            .globe-wrapper {
              width: min(clamp(320px, 30vw, 480px), calc(100vh - 300px)) !important;
              height: min(clamp(320px, 30vw, 480px), calc(100vh - 300px)) !important;
              max-width: 480px !important;
              max-height: 480px !important;
            }
          }
          
          /* Tablet responsive adjustments */
          @media (max-width: 1023px) and (min-width: 769px) {
            .globe-wrapper {
              width: min(clamp(260px, 44vw, 420px), calc(100vh - 300px)) !important;
              height: min(clamp(260px, 44vw, 420px), calc(100vh - 300px)) !important;
              max-width: 420px !important;
              max-height: 420px !important;
            }
          }
          
          /* Mobile responsive adjustments */
          @media (max-width: 768px) {
            .speaking-gradient-circle-container {
              gap: 16px !important;
            }
            
            .globe-wrapper {
              width: min(clamp(220px, 65vw, 320px), calc(100vh - 260px)) !important;
              height: min(clamp(220px, 65vw, 320px), calc(100vh - 260px)) !important;
              aspect-ratio: 1 / 1 !important; /* Force 1:1 aspect ratio */
              max-width: 320px !important;
              max-height: 320px !important;
              min-width: 200px !important;
              min-height: 200px !important;
              flex-shrink: 0 !important; /* Prevent shrinking */
            }
            
            .voice-overlay-text-container {
              max-width: 100% !important;
              padding: 12px 16px !important;
              max-height: calc(100vh - 450px) !important;
              min-height: 50px !important;
              font-size: 15px !important;
            }
          }
          
          @media (max-width: 480px) {
            .speaking-gradient-circle-container {
              gap: 12px !important;
            }
            
            .globe-wrapper {
              width: min(clamp(200px, 78vw, 280px), calc(100vh - 240px)) !important;
              height: min(clamp(200px, 78vw, 280px), calc(100vh - 240px)) !important;
              aspect-ratio: 1 / 1 !important; /* Force 1:1 aspect ratio */
              max-width: 280px !important;
              max-height: 280px !important;
              min-width: 200px !important;
              min-height: 200px !important;
              flex-shrink: 0 !important; /* Prevent shrinking */
            }
            
            .voice-overlay-text-container {
              padding: 10px 12px !important;
              max-height: calc(100vh - 380px) !important;
              min-height: 40px !important;
              font-size: 14px !important;
              line-height: 1.5 !important;
            }
          }
        `}
      </style>
    </div>
  );
};

export default VoiceOverlay;
