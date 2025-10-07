import React from 'react';
import type { Mode } from '../types';

interface ModeBarProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export const ModeBar: React.FC<ModeBarProps> = ({ mode, setMode }) => {
  const modes: Mode[] = ['Ask', 'Research', 'Summarize', 'Compare'];

  return (
    <div className="row" role="tablist" aria-label="Search modes">
      {modes.map(m => (
        <button
          key={m}
          className={`pill ${m === mode ? 'active' : ''}`}
          onClick={() => setMode(m)}
          aria-pressed={m === mode}
          aria-label={`Mode ${m}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
};
