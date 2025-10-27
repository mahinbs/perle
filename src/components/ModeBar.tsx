import React from 'react';
import type { Mode } from '../types';

interface ModeBarProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const modeDescriptions: Record<Mode, string> = {
  'Ask': 'Get quick answers',
  'Research': 'Deep dive analysis',
  'Summarize': 'Key points only',
  'Compare': 'Side-by-side comparison'
};

export const ModeBar: React.FC<ModeBarProps> = ({ mode, setMode }) => {
  const modes: Mode[] = ['Ask', 'Research', 'Summarize', 'Compare'];

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    // Optional: Add haptic feedback or sound for mobile
    if (navigator.vibrate) {
      navigator.vibrate(50); // Short vibration for mobile
    }
  };

  return (
    <div className="mode-bar-container">
      <div className="row" role="tablist" aria-label="Search modes">
        {modes.map(m => (
          <button
            key={m}
            className={`pill mode-pill ${m === mode ? 'active' : ''}`}
            onClick={() => handleModeChange(m)}
            aria-pressed={m === mode}
            aria-label={`Mode ${m}: ${modeDescriptions[m]}`}
            title={modeDescriptions[m]}
          >
            <span className="mode-text">{m}</span>
            {m === mode && <span className="mode-indicator">●</span>}
          </button>
        ))}
      </div>
      
      {/* Mode description */}
      <div className="mode-description" style={{ 
        marginTop: 8, 
        fontSize: 12, 
        color: 'var(--sub)',
        textAlign: 'center',
        opacity: 0.8
      }}>
        {modeDescriptions[mode]}
      </div>
    </div>
  );
};
