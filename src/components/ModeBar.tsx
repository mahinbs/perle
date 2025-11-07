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
    <>
      <div className="mode-bar-container">
        <div className="row mode-bar-buttons" role="tablist" aria-label="Search modes">
          {modes.map(m => (
            <button
              key={m}
              className={`pill mode-pill ${m === mode ? 'active' : ''}`}
              onClick={() => handleModeChange(m)}
              aria-pressed={m === mode}
              aria-label={`Mode ${m}: ${modeDescriptions[m]}`}
              title={modeDescriptions[m]}
              style={{
                padding: "6px 10px",
                fontSize: "var(--font-md)",
                minHeight: 36,
              }}
            >
              <span className="mode-text">{m}</span>
              {m === mode && <span className="mode-indicator">●</span>}
            </button>
          ))}
        </div>
        
        {/* Mode description */}
        <div className="mode-description" style={{ 
          marginTop: 8, 
          fontSize: "var(--font-sm)", 
          color: 'var(--sub)',
          textAlign: 'center',
          opacity: 0.8
        }}>
          {modeDescriptions[mode]}
        </div>
      </div>
      <style>
        {`
          .mode-bar-buttons {
            gap: 8px;
            flexWrap: wrap;
          }
          
          .mode-bar-buttons .mode-pill {
            flex: 1;
            min-width: 0;
          }
          
          @media (max-width: 768px) {
            .mode-bar-buttons {
              gap: 6px !important;
            }
            
            .mode-bar-buttons .mode-pill {
              padding: 8px 12px !important;
              font-size: var(--font-md) !important;
              min-height: 40px !important;
            }
          }
          
          @media (max-width: 480px) {
            .mode-bar-buttons {
              gap: 4px !important;
            }
            
            .mode-bar-buttons .mode-pill {
              padding: 7px 10px !important;
              font-size: var(--font-sm) !important;
              min-height: 38px !important;
            }
          }
        `}
      </style>
    </>
  );
};
