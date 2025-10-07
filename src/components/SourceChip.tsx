import React from 'react';
import type { Source } from '../types';

interface SourceChipProps {
  source: Source;
  onClick?: () => void;
}

export const SourceChip: React.FC<SourceChipProps> = ({ source, onClick }) => {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.open(source.url, '_blank');
    }
  };

  return (
    <span 
      className="chip" 
      title={`${source.title} (${source.domain})`}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {source.title}
    </span>
  );
};
