import React from 'react';

export const Dot: React.FC = () => (
  <span 
    style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: 99,
      background: 'var(--accent)',
      transform: 'translateY(2px)'
    }}
  />
);
