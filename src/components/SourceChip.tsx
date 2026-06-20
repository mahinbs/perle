import React from 'react';
import type { Source } from '../types';
import { SourceFavicon } from './SourceFavicon';

interface SourceChipProps {
  source: Source;
  onClick?: () => void;
  citationNumber?: number;
}

export const SourceChip: React.FC<SourceChipProps> = ({ source, onClick, citationNumber }) => {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.open(source.url, '_blank');
    }
  };

  return (
    <span
      className="gold-source-box"
      title={`${source.title} (${source.domain})`}
      onClick={handleClick}
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        background: "linear-gradient(135deg, rgba(223, 183, 104, 0.15) 0%, rgba(223, 183, 104, 0.05) 100%)",
        border: "1px solid rgba(223, 183, 104, 0.4)",
        borderRadius: "8px",
        color: "var(--text)",
        fontSize: "var(--font-sm)",
        fontWeight: 500,
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(4px)",
        transition: "all 0.2s ease",
        margin: "0 4px 4px 0",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "linear-gradient(135deg, rgba(223, 183, 104, 0.25) 0%, rgba(223, 183, 104, 0.1) 100%)";
        e.currentTarget.style.borderColor = "rgba(223, 183, 104, 0.6)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "linear-gradient(135deg, rgba(223, 183, 104, 0.15) 0%, rgba(223, 183, 104, 0.05) 100%)";
        e.currentTarget.style.borderColor = "rgba(223, 183, 104, 0.4)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1)";
      }}
    >
      <SourceFavicon url={source.url} domain={source.domain} size={18} rounded="sm" />
      {citationNumber !== undefined && (
        <span style={{ opacity: 0.45, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {citationNumber}
        </span>
      )}
      <span style={{
        maxWidth: "150px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}>
        {source.title}
      </span>
      <span style={{
        opacity: 0.5,
        fontSize: "0.85em",
        marginLeft: "2px"
      }}>
        {source.domain?.replace(/^www\./, '') || new URL(source.url).hostname.replace(/^www\./, '')}
      </span>
    </span>
  );
};
