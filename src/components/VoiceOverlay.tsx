import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import MicWaveIcon from "./MicWaveIcon";

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

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes("mac")) setOs("mac");
    else if (platform.includes("win")) setOs("windows");
    else setOs("other");
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
        <SpeakingGradientCircle isListening={isListening} responseText={responseText} />
      </div>

      {/* Bottom actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: os === 'mac' ? '6rem' : undefined,
        }}
      >
        <button
          className="btn-ghost"
          onClick={() => {
            try {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            } catch {}
            onClose();
          }}
          aria-label="Cancel"
          style={{
            width: 72,
            height: 72,
            borderRadius: 9999,
            color: "var(--text)",
            borderColor: "var(--border)",
            fontSize: 18,
          }}
        >
          ✕
        </button>
        <button
          className={isListening ? "btn" : "btn-ghost"}
          onClick={() => {
            try {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            } catch {}
            onToggleListening();
          }}
          aria-label={isListening ? "Stop listening" : "Start voice"}
          style={{
            width: 84,
            height: 84,
            borderRadius: 9999,
            color: isListening ? "#111" : "var(--text)",
            borderColor: isListening ? undefined : "var(--border)",
          }}
        >
          <MicWaveIcon size={26} active={isListening} />
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

// Internal helper component that watches the Web Speech API speaking state
// and displays an animated watercolor gradient circle during voice output
const SpeakingGradientCircle: React.FC<{ isListening: boolean; responseText?: string }> = ({ 
  isListening,
  responseText: propResponseText 
}) => {
  const [speaking, setSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [wavePhase, setWavePhase] = useState(0);
  const [responseText, setResponseText] = useState<string>("");

  useEffect(() => {
    let raf = 0;
    const startTime = Date.now();
    
    // Track speech synthesis utterances to get response text
    const trackUtterance = () => {
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          // Note: There's no direct API to get current utterance text,
          // so we'll use a workaround by storing it when we detect speaking starts
        }
      } catch {}
    };

    const tick = () => {
      try {
        const isSpeaking =
          typeof window !== "undefined" && "speechSynthesis" in window
            ? window.speechSynthesis.speaking
            : false;
        
        // Update speaking state
        const wasSpeaking = speaking;
        setSpeaking(isSpeaking);
        
        // Try to extract text from speechSynthesis if possible
        if (isSpeaking && !wasSpeaking) {
          // When speech starts, try to get the text
          // This is a workaround since browsers don't expose current utterance directly
          trackUtterance();
        }
        
        // Use prop responseText if available, otherwise try to get from localStorage
        if (propResponseText) {
          setResponseText(propResponseText);
        }
        // Don't clear text immediately when speech ends - let the localStorage handler manage it
        // This prevents flickering and allows text to remain visible briefly
        
        // Update wave phase for smooth animation
        const elapsed = (Date.now() - startTime) / 1000;
        setWavePhase(elapsed);
        
        // Create varying audio levels for wave animation based on voice activity
        if (isSpeaking) {
          // Create more realistic audio levels with multiple sine waves for variation
          const time = elapsed;
          const level = 0.4 + 0.4 * Math.sin(time * 2.5) + 0.2 * Math.sin(time * 4.2) + 0.1 * Math.sin(time * 6.8);
          setAudioLevel(Math.max(0, Math.min(1, level)));
        } else {
          setAudioLevel(0);
        }
      } catch {}
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    
    // Listen for speech synthesis events
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const synth = window.speechSynthesis;
      synth.addEventListener("voiceschanged", trackUtterance);
    }
    
    return () => {
      cancelAnimationFrame(raf);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const synth = window.speechSynthesis;
        synth.removeEventListener("voiceschanged", trackUtterance);
      }
    };
  }, [speaking, propResponseText]);
  
  // Update responseText when prop changes or from localStorage
  useEffect(() => {
    if (propResponseText) {
      setResponseText(propResponseText);
    } else {
      // Try to get from localStorage (set by AnswerCard when speaking)
      const storedText = localStorage.getItem('perle-current-answer-text');
      if (storedText) {
        setResponseText(storedText);
      }
    }
  }, [propResponseText]);
  
  // Monitor localStorage for answer text updates (with faster polling for smooth typewriter effect)
  useEffect(() => {
    const handleStorageChange = () => {
      const storedText = localStorage.getItem('perle-current-answer-text');
      if (storedText !== null && !propResponseText) {
        // Only update if text actually changed to avoid unnecessary re-renders
        setResponseText(prev => {
          if (prev !== storedText) {
            return storedText;
          }
          return prev;
        });
        // Also check if speech is speaking and update speaking state if needed
        // This helps catch cases where speaking state might not be detected
        if (storedText && typeof window !== "undefined" && "speechSynthesis" in window) {
          const isCurrentlySpeaking = window.speechSynthesis.speaking;
          if (isCurrentlySpeaking && !speaking) {
            setSpeaking(true);
          }
        }
      } else if (storedText === null && !propResponseText && responseText) {
        // Keep text visible for a bit even after localStorage is cleared
        // This prevents flickering when speech ends
        setTimeout(() => {
          if (!window.speechSynthesis.speaking) {
            setResponseText("");
          }
        }, 1000);
      }
    };
    
    // Check initially
    handleStorageChange();
    
    // Listen for storage events (from other tabs/windows)
    window.addEventListener('storage', handleStorageChange);
    
    // Poll more frequently for smooth typewriter effect (every 50ms for better responsiveness)
    const interval = setInterval(handleStorageChange, 50);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [propResponseText, speaking, responseText]);

  // Animate only when AI is speaking and user is not recording
  const shouldAnimate = !isListening && speaking;

  const displayText = propResponseText || responseText;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 260,
          height: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width={260}
          height={260}
          aria-hidden="true"
          style={{
            opacity: shouldAnimate ? 1 : 0.3,
            transition: "opacity 0.3s ease-in-out",
          }}
        >
        <defs>
          {/* Theme-colored gradient matching website design */}
          <linearGradient id="bwGradient" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#FFFBF5" />
            <stop offset="30%" stopColor="#F8F7F4" />
            <stop offset="60%" stopColor="#E8D4B0" />
            <stop offset="100%" stopColor="#C7A869" />
          </linearGradient>
          
          {/* Neon glow filter for futuristic effect */}
          <filter id="glowFilter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Stronger glow for active state */}
          <filter id="strongGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Wave gradient with theme colors - accent gold variations */}
          <linearGradient id="waveGradient1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(199, 168, 105, 0)" />
            <stop offset="30%" stopColor="rgba(199, 168, 105, 0.7)" />
            <stop offset="70%" stopColor="rgba(184, 154, 90, 0.8)" />
            <stop offset="100%" stopColor="rgba(199, 168, 105, 0)" />
          </linearGradient>
          
          <linearGradient id="waveGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 251, 245, 0)" />
            <stop offset="30%" stopColor="rgba(255, 251, 245, 0.85)" />
            <stop offset="70%" stopColor="rgba(248, 247, 244, 0.85)" />
            <stop offset="100%" stopColor="rgba(255, 251, 245, 0)" />
          </linearGradient>
          
          {/* Grid pattern for futuristic overlay - using theme accent color */}
          <pattern id="gridPattern" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(199, 168, 105, 0.15)" strokeWidth="0.2"/>
          </pattern>

          {/* Clip path to contain waves within circle */}
          <clipPath id="circleClip">
            <circle cx="50" cy="50" r="48" />
          </clipPath>
        </defs>
        
        {/* Outer glow ring - using theme accent color */}
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="rgba(199, 168, 105, 0.4)"
          strokeWidth="0.5"
          opacity={shouldAnimate ? 1 : 0.3}
          filter={shouldAnimate ? "url(#glowFilter)" : "none"}
          style={{
            animation: shouldAnimate ? "pulseGlow 2s ease-in-out infinite" : "none",
          }}
        />
        
        {/* Main circle with black and white gradient - NO BLUR */}
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="url(#bwGradient)"
        />
        
        {/* Futuristic grid overlay */}
        {shouldAnimate && (
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="url(#gridPattern)"
            opacity={0.3 * audioLevel}
          />
        )}
        
        {/* Scan line effect - clipped to circle */}
        {shouldAnimate && (
          <g clipPath="url(#circleClip)">
            <rect
              x="0"
              y={(wavePhase * 15) % 100}
              width="100"
              height="1.5"
              fill="rgba(199, 168, 105, 0.5)"
              opacity={0.8 * audioLevel}
              filter="url(#glowFilter)"
              style={{ mixBlendMode: "screen" }}
            />
          </g>
        )}
        
        {/* Animated gradient waves inside circle - futuristic sharp waves */}
        <g clipPath="url(#circleClip)">
          {/* Wave 1 - dark wave with sharp edges, responsive to audio level */}
          <path
            d="M 0 50 L 10 45 L 20 48 L 30 42 L 40 46 L 50 44 L 60 47 L 70 43 L 80 45 L 90 44 L 100 46 L 100 100 L 0 100 Z"
            fill="url(#waveGradient1)"
            opacity={shouldAnimate ? 0.9 * audioLevel : 0}
            filter={shouldAnimate ? "url(#glowFilter)" : "none"}
            style={{
              transform: `translateY(${-8 * audioLevel * (0.7 + 0.3 * Math.sin(wavePhase * 1.5))}px)`,
              transition: "opacity 0.15s linear",
            }}
          />
          
          {/* Wave 2 - light wave with sharp edges, responsive to audio level */}
          <path
            d="M 0 50 L 10 55 L 20 52 L 30 58 L 40 54 L 50 56 L 60 53 L 70 57 L 80 55 L 90 56 L 100 54 L 100 100 L 0 100 Z"
            fill="url(#waveGradient2)"
            opacity={shouldAnimate ? 0.9 * audioLevel : 0}
            filter={shouldAnimate ? "url(#glowFilter)" : "none"}
            style={{
              transform: `translateY(${8 * audioLevel * (0.7 + 0.3 * Math.sin(wavePhase * 1.8))}px)`,
              transition: "opacity 0.15s linear",
            }}
          />
          
          {/* Wave 3 - geometric secondary dark wave */}
          <path
            d="M 0 45 L 8 38 L 16 42 L 24 36 L 32 40 L 40 38 L 48 41 L 56 37 L 64 39 L 72 38 L 80 40 L 88 39 L 96 41 L 100 38 L 100 100 L 0 100 Z"
            fill="url(#waveGradient1)"
            opacity={shouldAnimate ? 0.7 * audioLevel : 0}
            style={{
              transform: `translateY(${-6 * audioLevel * (0.8 + 0.2 * Math.sin(wavePhase * 2.2))}px) scaleY(${1 + 0.15 * audioLevel})`,
              transition: "opacity 0.15s linear",
            }}
          />
          
          {/* Wave 4 - geometric secondary light wave */}
          <path
            d="M 0 55 L 8 62 L 16 58 L 24 64 L 32 60 L 40 62 L 48 59 L 56 63 L 64 61 L 72 62 L 80 60 L 88 61 L 96 59 L 100 62 L 100 100 L 0 100 Z"
            fill="url(#waveGradient2)"
            opacity={shouldAnimate ? 0.7 * audioLevel : 0}
            style={{
              transform: `translateY(${6 * audioLevel * (0.8 + 0.2 * Math.sin(wavePhase * 2.5))}px) scaleY(${1 + 0.15 * audioLevel})`,
              transition: "opacity 0.15s linear",
            }}
          />
          
          {/* Additional geometric waves for more dynamic response */}
          <path
            d="M 0 48 L 12 40 L 24 44 L 36 38 L 48 42 L 60 40 L 72 43 L 84 39 L 96 41 L 100 40 L 100 100 L 0 100 Z"
            fill="url(#waveGradient1)"
            opacity={shouldAnimate ? 0.6 * audioLevel : 0}
            filter={shouldAnimate ? "url(#glowFilter)" : "none"}
            style={{
              transform: `translateY(${-10 * audioLevel * Math.sin(wavePhase * 2)}px)`,
              transition: "opacity 0.1s linear",
            }}
          />
          
          <path
            d="M 0 52 L 12 60 L 24 56 L 36 62 L 48 58 L 60 60 L 72 57 L 84 61 L 96 59 L 100 60 L 100 100 L 0 100 Z"
            fill="url(#waveGradient2)"
            opacity={shouldAnimate ? 0.6 * audioLevel : 0}
            filter={shouldAnimate ? "url(#glowFilter)" : "none"}
            style={{
              transform: `translateY(${10 * audioLevel * Math.sin(wavePhase * 2.3)}px)`,
              transition: "opacity 0.1s linear",
            }}
          />
        </g>
        
        {/* Futuristic data bars radiating from center */}
        {shouldAnimate && (
          <g>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const length = 15 + 8 * audioLevel * (0.5 + 0.5 * Math.sin(wavePhase * 3 + i));
              const x1 = 50 + 35 * Math.cos(rad);
              const y1 = 50 + 35 * Math.sin(rad);
              const x2 = 50 + (35 + length) * Math.cos(rad);
              const y2 = 50 + (35 + length) * Math.sin(rad);
              
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(199, 168, 105, 0.6)"
                  strokeWidth="0.5"
                  opacity={0.8 * audioLevel}
                  filter="url(#glowFilter)"
                  style={{
                    animation: `dataPulse ${1 + i * 0.1}s ease-in-out infinite`,
                  }}
                />
              );
            })}
          </g>
        )}

        <style>
          {`
            @keyframes pulseGlow {
              0%, 100% {
                opacity: 0.3;
                stroke-width: 0.5;
              }
              50% {
                opacity: 0.8;
                stroke-width: 1;
              }
            }
            
            @keyframes dataPulse {
              0%, 100% {
                opacity: 0.3;
                stroke-width: 0.5;
              }
              50% {
                opacity: 1;
                stroke-width: 1;
              }
            }
          `}
        </style>
      </svg>
      </div>
      
      {/* AI Response Text Display - Dynamic height based on content */}
      <div
        className="voice-overlay-text-container"
        style={{
          maxWidth: 600,
          width: "100%",
          minHeight: displayText ? 60 : 0,
          maxHeight: displayText ? 120 : 0,
          padding: displayText ? "12px 24px" : "0",
          textAlign: "center",
          color: "var(--text)",
          fontSize: 16,
          lineHeight: 1.6,
          opacity: displayText ? (shouldAnimate ? 0.95 : 0.7) : 0,
          transition: "min-height 0.3s ease-in-out, max-height 0.3s ease-in-out, opacity 0.3s ease-in-out, padding 0.3s ease-in-out",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {displayText && (
          <div style={{ width: "100%" }}>
            {displayText}
          </div>
        )}
      </div>
      
      <style>
        {`
          .voice-overlay-text-container::-webkit-scrollbar {
            width: 6px;
          }
          
          .voice-overlay-text-container::-webkit-scrollbar-track {
            background: rgba(199, 168, 105, 0.1);
            border-radius: 10px;
          }
          
          .voice-overlay-text-container::-webkit-scrollbar-thumb {
            background: rgba(199, 168, 105, 0.4);
            border-radius: 10px;
            transition: background 0.2s ease;
          }
          
          .voice-overlay-text-container::-webkit-scrollbar-thumb:hover {
            background: rgba(199, 168, 105, 0.6);
          }
          
          /* Firefox scrollbar styling */
          .voice-overlay-text-container {
            scrollbar-width: thin;
            scrollbar-color: rgba(199, 168, 105, 0.4) rgba(199, 168, 105, 0.1);
          }
        `}
      </style>
    </div>
  );
};

export default VoiceOverlay;
