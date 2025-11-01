import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import HeadsetWaveIcon from './HeadsetWaveIcon';
import MicWaveIcon from './MicWaveIcon';

interface VoiceOverlayProps {
  isOpen: boolean;
  isListening: boolean;
  onToggleListening: () => void;
  onClose: () => void;
}

// Fullscreen overlay for voice interaction with a dotted sphere animation
export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isOpen,
  isListening,
  onToggleListening,
  onClose
}) => {
  // (dots sphere removed; replaced by HeadsetWaveIcon)

  // Lock background scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  const overlay = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        pointerEvents: 'auto'
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Voice assistant"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn-ghost"
          onClick={() => {
            try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch {}
            onClose();
          }}
          aria-label="Close"
          style={{ borderRadius: 9999, color: 'var(--text)', borderColor: 'var(--border)', width: 48, height: 48 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Animate only when AI is replying (speechSynthesis speaking) and user is not recording */}
        <SpeakingWave isListening={isListening} />
        {/* Dotted animated sphere */}
        {/* <svg viewBox="0 0 100 100" width={260} height={260} aria-hidden>
          <defs>
            <radialGradient id="fade" cx="50%" cy="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.2)" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="none" stroke="url(#fade)" strokeWidth="0.3" />
          <style>
            {`
              @keyframes dotPulse { 0%,100%{opacity:.35} 50%{opacity:1} }
            `}
          </style>
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill="rgba(255,255,255,0.55)"
              style={{ animation: `dotPulse 2.2s ease-in-out ${d.d}s infinite` }}
            />
          ))}
        </svg> */}
      </div>

      {/* Bottom actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',paddingBottom:"6rem" }}>
        <button
          className="btn-ghost"
          onClick={() => {
            try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch {}
            onClose();
          }}
          aria-label="Cancel"
          style={{ width: 72, height: 72, borderRadius: 9999, color: 'var(--text)', borderColor: 'var(--border)', fontSize: 18 }}
        >
          ✕
        </button>
        <button
          className={isListening ? 'btn' : 'btn-ghost'}
          onClick={() => {
            try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch {}
            onToggleListening();
          }}
          aria-label={isListening ? 'Stop listening' : 'Start voice'}
          style={{ width: 84, height: 84, borderRadius: 9999, color: isListening ? '#111' : 'var(--text)', borderColor: isListening ? undefined : 'var(--border)' }}
        >
          <MicWaveIcon size={26} active={isListening} />
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

// Internal helper component that watches the Web Speech API speaking state
const SpeakingWave: React.FC<{ isListening: boolean }> = ({ isListening }) => {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      try {
        const isSpeaking = typeof window !== 'undefined' && 'speechSynthesis' in window
          ? window.speechSynthesis.speaking
          : false;
        setSpeaking(isSpeaking);
      } catch {}
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <HeadsetWaveIcon size={180} color="var(--text)" pulse={!isListening && speaking} />
  );
};

export default VoiceOverlay;


