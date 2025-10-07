import React from 'react';

export const Dot: React.FC = () => (
  <span 
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: 99,
      background: 'var(--accent)',
      transform: 'translateY(2px)'
    }}
  />
);
