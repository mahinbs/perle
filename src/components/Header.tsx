import React from 'react';
import { Dot } from './Dot';

export const Header: React.FC = () => {
  return (
    <header className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <div className="h1">
          Perlé <Dot />
        </div>
      </div>
      
      <div className="row" style={{ gap: 8 }}>
        <button 
          className="btn-ghost" 
          onClick={() => {/* Navigate to discover */}}
          aria-label="Discover"
        >
          Discover
        </button>
        <button 
          className="btn-ghost" 
          onClick={() => {/* Navigate to profile */}}
          aria-label="Profile"
        >
          Profile
        </button>
      </div>
    </header>
  );
};
