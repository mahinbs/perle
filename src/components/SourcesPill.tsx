import React, { useState, useEffect, useRef } from "react";
import type { Source } from "../types";
import { SourceFavicon } from "./SourceFavicon";
import { getSourceDomain } from "../utils/sourceFavicon";

interface SourcesPillProps {
  sources: Source[];
}

/**
 * Collapsed pill showing favicon stack + count.
 * Tap to expand the full source list; tap a source to open it in a new tab;
 * tap outside to close.
 */
export const SourcesPill: React.FC<SourcesPillProps> = ({ sources }) => {
  const [expanded, setExpanded] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (pillRef.current && !pillRef.current.contains(target)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [expanded]);

  if (sources.length === 0) return null;

  const previewSources = sources.slice(0, 4);

  return (
    <div
      ref={pillRef}
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${sources.length} sources`}
        className="glass-button"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 9999,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--text)",
          fontSize: "var(--font-sm)",
          fontWeight: 500,
          cursor: "pointer",
          boxShadow: "var(--shadow)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center" }}>
          {previewSources.map((source, index) => (
            <SourceFavicon
              key={source.id}
              url={source.url}
              domain={source.domain}
              size={18}
              style={{
                position: "relative",
                zIndex: previewSources.length - index,
                border: "2px solid var(--bg)",
                marginLeft: index > 0 ? -6 : 0,
              }}
            />
          ))}
        </span>
        <span>
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 8,
            width: "min(340px, 90vw)",
            maxHeight: "min(50vh, 300px)",
            overflowY: "auto",
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--card)",
            boxShadow: "var(--shadow)",
            zIndex: 9999,
            padding: 8,
          }}
        >
          {sources.map((source, index) => (
            <button
              key={source.id}
              type="button"
              onClick={() => {
                setExpanded(false);
                window.open(source.url, "_blank");
              }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: "none",
                background: "transparent",
                color: "var(--text)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--input-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <SourceFavicon
                url={source.url}
                domain={source.domain}
                size={18}
                rounded="sm"
                style={{ marginTop: 2 }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--font-sm)",
                    fontWeight: 600,
                    lineHeight: 1.35,
                    marginBottom: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {index + 1}. {source.title}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--font-xs)",
                    opacity: 0.65,
                  }}
                >
                  {source.domain || getSourceDomain(source.url)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
