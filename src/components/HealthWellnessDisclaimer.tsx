/**
 * Visible medical / mental-health disclaimer for App Store Guideline 1.4.1.
 * Keep this on-screen for wellness-related features (not buried only in Terms).
 */

type HealthWellnessDisclaimerProps = {
  compact?: boolean;
  className?: string;
};

const DISCLAIMER_TEXT =
  "For wellness and informational support only. This is not medical or mental-health advice, diagnosis, or treatment. Always seek a doctor's or licensed professional's advice before making health decisions. If you are in crisis, contact emergency services immediately.";

export function HealthWellnessDisclaimer({
  compact = false,
  className = "",
}: HealthWellnessDisclaimerProps) {
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
      }}
    >
      <strong style={{ color: "var(--text)", fontWeight: 600 }}>Important: </strong>
      {DISCLAIMER_TEXT}
    </div>
  );
}

export const HEALTH_WELLNESS_DISCLAIMER_TEXT = DISCLAIMER_TEXT;
