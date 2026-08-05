/**
 * Visible medical / mental-health disclaimer for App Store Guideline 1.4.1.
 * Keep this on-screen for wellness-related features (not buried only in Terms).
 *
 * It can be dismissed to free up chat space, but the dismissal only lasts for
 * the current app session (module-level flag) — it re-appears the next time the
 * app is opened, so the disclaimer stays compliant while not permanently
 * occupying the screen.
 */

import { useState } from "react";

type HealthWellnessDisclaimerProps = {
  compact?: boolean;
  className?: string;
  /** Show the close (×) button so users can dismiss it after reading. Default true. */
  dismissible?: boolean;
};

const DISCLAIMER_TEXT =
  "For wellness and informational support only. This is not medical or mental-health advice, diagnosis, or treatment. Always seek a doctor's or licensed professional's advice before making health decisions. If you are in crisis, contact emergency services immediately.";

// Session-scoped: once dismissed, stays hidden until the app is relaunched.
let dismissedThisSession = false;

export function HealthWellnessDisclaimer({
  compact = false,
  className = "",
  dismissible = true,
}: HealthWellnessDisclaimerProps) {
  const [hidden, setHidden] = useState(dismissedThisSession);
  if (hidden) return null;

  return (
    <div
      role="note"
      aria-label="Health and wellness disclaimer"
      className={`health-wellness-disclaimer ${className}`.trim()}
      style={{
        margin: compact ? "0" : "0 12px 10px",
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: "10px",
        border: "1px solid rgba(199, 168, 105, 0.35)",
        background: "rgba(199, 168, 105, 0.08)",
        color: "var(--sub)",
        fontSize: compact ? "11px" : "12px",
        lineHeight: 1.45,
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ color: "var(--text)", fontWeight: 600 }}>Important: </strong>
        {DISCLAIMER_TEXT}
      </div>
      {dismissible && (
        <button
          type="button"
          aria-label="Dismiss disclaimer"
          onClick={() => {
            dismissedThisSession = true;
            setHidden(true);
          }}
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: "var(--sub)",
            cursor: "pointer",
            fontSize: "16px",
            lineHeight: 1,
            padding: "0 2px",
            marginTop: "-1px",
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}

export const HEALTH_WELLNESS_DISCLAIMER_TEXT = DISCLAIMER_TEXT;
