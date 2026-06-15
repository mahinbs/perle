import React from "react";
import type { ExperienceMode } from "../types";

interface ExperienceModeButtonsProps {
  experienceMode: ExperienceMode;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
  disabled?: boolean;
  size?: "small" | "medium";
}

const MODES: { id: ExperienceMode; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "web_search", label: "Web" },
  { id: "deep_research", label: "Deep" },
];

export const ExperienceModeButtons: React.FC<ExperienceModeButtonsProps> = ({
  experienceMode,
  onExperienceModeChange,
  disabled = false,
  size = "medium",
}) => {
  if (!onExperienceModeChange) return null;

  const isSmall = size === "small";

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {MODES.map(({ id, label }) => {
        const active = experienceMode === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onExperienceModeChange(id)}
            className={`glass-button btn-shadow whitespace-nowrap transition-colors rounded-lg ${
              active
                ? "!bg-[var(--accent)] !text-[#111] !border-[var(--accent)]"
                : "btn-ghost"
            }`}
            style={{
              padding: isSmall ? "5px 12px" : "6px 14px",
              fontSize: isSmall ? "var(--font-xs)" : "var(--font-sm)",
              fontWeight: 600,
              borderRadius: 8,
              minHeight: isSmall ? 30 : 34,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
