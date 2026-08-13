/**
 * Minimal, unobtrusive AI/health disclaimer — kept for App Store Guideline 1.4.1
 * and Google Play's AI-content policy, but styled like the small grey notices in
 * ChatGPT / Gemini rather than a large coloured banner. Still on-screen (so it
 * stays compliant) but visually quiet, and dismissible for the session so it
 * never permanently occupies the chat.
 *
 * Variants pick the wording for the surface it sits on:
 *   - "wellness"  (default) full health/wellness notice (AI Psychology, Sleep)
 *   - "general"   normal chat / search — "AI can make mistakes" style line
 *   - "companion" AI Friend casual-chat note
 */

import { useState } from "react";

type Variant = "wellness" | "general" | "companion";

type HealthWellnessDisclaimerProps = {
  compact?: boolean;
  className?: string;
  variant?: Variant;
  /** Show the close (×) button so users can dismiss it after reading. Default true. */
  dismissible?: boolean;
};

const TEXTS: Record<Variant, string> = {
  wellness:
    "SyntraIQ is for wellness and informational support only — not medical or mental-health advice, diagnosis, or treatment. Seek a licensed professional before making health decisions; in a crisis, contact emergency services.",
  general:
    "SyntraIQ can make mistakes — answers are general information, not medical, legal, or financial advice.",
  companion:
    "AI Friend is for casual conversation — not medical advice, therapy, diagnosis, or treatment. Seek a qualified professional for health decisions.",
};

// Session-scoped: once dismissed, stays hidden until the app is relaunched.
// Keyed per-variant so closing one surface doesn't hide a different one.
const dismissedThisSession: Record<Variant, boolean> = {
  wellness: false,
  general: false,
  companion: false,
};

export function HealthWellnessDisclaimer({
  compact = false,
  className = "",
  variant = "wellness",
  dismissible = true,
}: HealthWellnessDisclaimerProps) {
  const [hidden, setHidden] = useState(dismissedThisSession[variant]);
  if (hidden) return null;

  return (
    <div
      role="note"
      aria-label="AI safety notice"
      className={`health-wellness-disclaimer ${className}`.trim()}
      style={{
        margin: compact ? "0" : "0 12px 8px",
        padding: compact ? "2px 2px" : "4px 2px",
        border: "none",
        background: "transparent",
        color: "var(--sub)",
        fontSize: "10.5px",
        lineHeight: 1.4,
        opacity: 0.8,
        display: "flex",
        alignItems: "flex-start",
        gap: "6px",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{TEXTS[variant]}</span>
      {dismissible && (
        <button
          type="button"
          aria-label="Dismiss notice"
          onClick={() => {
            dismissedThisSession[variant] = true;
            setHidden(true);
          }}
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: "var(--sub)",
            cursor: "pointer",
            fontSize: "14px",
            lineHeight: 1,
            padding: "0 2px",
            opacity: 0.9,
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}

export const HEALTH_WELLNESS_DISCLAIMER_TEXT = TEXTS.wellness;
