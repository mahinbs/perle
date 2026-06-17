import React from "react";
import MicWaveIcon from "./MicWaveIcon";

interface VoiceOverlayControlsProps {
  isListening: boolean;
  onClose: () => void;
  onToggleListening: () => void;
  isMac: boolean;
  centerContent?: React.ReactNode;
}

const VoiceOverlayControls: React.FC<VoiceOverlayControlsProps> = ({
  isListening,
  onClose,
  onToggleListening,
  isMac,
  centerContent,
}) => {
  const handleClose = () => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch { }
    onClose();
  };

  const handleToggleListening = () => {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch { }
    onToggleListening();
  };

  const buttonSize = "clamp(48px, 12vmin, 56px)";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        maxWidth: "100%",
        paddingBottom: isMac ? "max(2rem, env(safe-area-inset-bottom))" : "max(1.25rem, env(safe-area-inset-bottom))",
        paddingLeft: "1.5rem",
        paddingRight: "1.5rem",
        paddingTop: "0.5rem",
        boxSizing: "border-box",
        gap: 12,
      }}
    >
      <button
        className="btn-ghost glass-button"
        onClick={handleClose}
        aria-label="Cancel"
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: 9999,
          color: "var(--text)",
          borderColor: "var(--border)",
          fontSize: "var(--font-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        ✕
      </button>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          pointerEvents: "none",
        }}
      >
        {centerContent}
      </div>

      <button
        className={`${isListening ? "btn mic-recording" : "btn-ghost glass-button"}`}
        onClick={handleToggleListening}
        aria-label={isListening ? "Stop listening" : "Start voice"}
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <MicWaveIcon size={22} active={isListening} />
      </button>
    </div>
  );
};

export default React.memo(VoiceOverlayControls);
